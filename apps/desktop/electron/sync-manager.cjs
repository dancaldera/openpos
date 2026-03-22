const { replicatedTables, replicatedTablesByName } = require('@openpos/data')

const DEFAULT_WATERMARK = '1970-01-01T00:00:00.000Z'
const OUTBOX_ACTIVE_STATUSES = ['pending', 'error']
const OUTBOX_OPEN_STATUSES = ['pending', 'error', 'conflict']

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`
}

function quoteColumns(columns) {
  return columns.map((column) => quoteIdentifier(column)).join(', ')
}

function createSyncManager({ getDatabase, getRemoteConfig }) {
  let pollTimer = null
  let syncPromise = null
  const status = {
    status: 'offline',
    mode: 'mirror',
    remoteConfigured: false,
    pendingWrites: 0,
    conflictedWrites: 0,
    lastCheckedAt: null,
    lastSyncedAt: null,
    lastError: null,
  }

  function refreshCounts(database = getDatabase()) {
    const pendingRow = database
      .prepare(
        `SELECT COUNT(*) AS count
           FROM sync_outbox
          WHERE status IN (${OUTBOX_ACTIVE_STATUSES.map(() => '?').join(', ')})`,
      )
      .get(...OUTBOX_ACTIVE_STATUSES)
    const conflictRow = database.prepare(`SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'conflict'`).get()

    status.pendingWrites = Number(pendingRow?.count ?? 0)
    status.conflictedWrites = Number(conflictRow?.count ?? 0)
  }

  function getStatusSnapshot(database = getDatabase()) {
    refreshCounts(database)
    return {
      ...status,
    }
  }

  async function getTursoClient() {
    const config = getRemoteConfig()
    status.remoteConfigured = Boolean(config.configured)

    if (!config.configured || !config.url || !config.authToken) {
      return null
    }

    const { connect } = await import('@tursodatabase/serverless')
    return connect({
      url: config.url,
      authToken: config.authToken,
    })
  }

  function setStatus(nextStatus, error = null) {
    status.status = nextStatus
    status.lastError = error instanceof Error ? error.message : error
    status.lastCheckedAt = new Date().toISOString()
  }

  function rowFromRemoteResult(result, index) {
    const rawRow = result.rows[index]

    if (!Array.isArray(rawRow)) {
      return rawRow
    }

    return Object.fromEntries(result.columns.map((column, columnIndex) => [column, rawRow[columnIndex] ?? null]))
  }

  async function fetchRemoteRows(client, sql, params = []) {
    const result = await client.execute(sql, params)
    return result.rows.map((_, index) => rowFromRemoteResult(result, index))
  }

  async function fetchRemoteRow(client, config, recordId) {
    const rows = await fetchRemoteRows(
      client,
      `SELECT ${quoteColumns(config.columns)}
         FROM ${quoteIdentifier(config.tableName)}
        WHERE ${quoteIdentifier(config.primaryKey)} = ?
        LIMIT 1`,
      [coerceRecordId(recordId)],
    )

    return rows[0] ?? null
  }

  function coerceRecordId(recordId) {
    const numeric = Number(recordId)
    return Number.isNaN(numeric) ? recordId : numeric
  }

  function upsertLocalRow(database, config, row) {
    const placeholders = config.columns.map(() => '?').join(', ')
    const values = config.columns.map((column) => row[column] ?? null)

    database
      .prepare(
        `INSERT OR REPLACE INTO ${quoteIdentifier(config.tableName)} (${quoteColumns(config.columns)})
         VALUES (${placeholders})`,
      )
      .run(...values)
  }

  async function upsertRemoteRow(client, config, row) {
    const placeholders = config.columns.map(() => '?').join(', ')
    const assignments = config.columns
      .filter((column) => column !== config.primaryKey)
      .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
      .join(', ')
    const values = config.columns.map((column) => row[column] ?? null)

    await client.execute(
      `INSERT INTO ${quoteIdentifier(config.tableName)} (${quoteColumns(config.columns)})
       VALUES (${placeholders})
       ON CONFLICT(${quoteIdentifier(config.primaryKey)}) DO UPDATE SET ${assignments}`,
      values,
    )
  }

  function upsertSyncState(database, tableName, values) {
    database
      .prepare(
        `INSERT INTO sync_state (table_name, last_pulled_at, last_sync_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(table_name) DO UPDATE SET
           last_pulled_at = excluded.last_pulled_at,
           last_sync_at = excluded.last_sync_at,
           updated_at = excluded.updated_at`,
      )
      .run(tableName, values.lastPulledAt ?? null, values.lastSyncAt ?? null, new Date().toISOString())
  }

  function getSyncState(database, tableName) {
    return (
      database
        .prepare('SELECT last_pulled_at, last_sync_at FROM sync_state WHERE table_name = ? LIMIT 1')
        .get(tableName) ?? null
    )
  }

  async function reconcileHardDeletes(database, client, config) {
    const remoteIds = new Set(
      (
        await fetchRemoteRows(
          client,
          `SELECT ${quoteIdentifier(config.primaryKey)} FROM ${quoteIdentifier(config.tableName)}`,
        )
      ).map((row) => String(row[config.primaryKey])),
    )
    const localIds = database
      .prepare(`SELECT ${quoteIdentifier(config.primaryKey)} AS id FROM ${quoteIdentifier(config.tableName)}`)
      .all()
      .map((row) => String(row.id))
    const protectedIds = new Set(
      database
        .prepare(
          `SELECT record_id
             FROM sync_outbox
            WHERE table_name = ?
              AND status IN (${OUTBOX_OPEN_STATUSES.map(() => '?').join(', ')})`,
        )
        .all(config.tableName, ...OUTBOX_OPEN_STATUSES)
        .map((row) => String(row.record_id)),
    )

    const deleteStatement = database.prepare(
      `DELETE FROM ${quoteIdentifier(config.tableName)} WHERE ${quoteIdentifier(config.primaryKey)} = ?`,
    )

    for (const localId of localIds) {
      if (remoteIds.has(localId) || protectedIds.has(localId)) {
        continue
      }

      deleteStatement.run(coerceRecordId(localId))
    }
  }

  async function pullRemoteChanges(database, client) {
    const orderedTables = [...replicatedTables].sort((left, right) => left.pullOrder - right.pullOrder)

    for (const config of orderedTables) {
      const state = getSyncState(database, config.tableName)
      const since = state?.last_pulled_at ?? DEFAULT_WATERMARK
      const remoteRows = await fetchRemoteRows(
        client,
        `SELECT ${quoteColumns(config.columns)}
           FROM ${quoteIdentifier(config.tableName)}
          WHERE ${quoteIdentifier(config.watermarkColumn)} > ?
          ORDER BY ${quoteIdentifier(config.watermarkColumn)} ASC, ${quoteIdentifier(config.primaryKey)} ASC`,
        [since],
      )

      for (const row of remoteRows) {
        upsertLocalRow(database, config, row)
      }

      if (config.deleteStrategy === 'hard') {
        await reconcileHardDeletes(database, client, config)
      }

      if (remoteRows.length > 0) {
        const lastRow = remoteRows[remoteRows.length - 1]
        upsertSyncState(database, config.tableName, {
          lastPulledAt: lastRow[config.watermarkColumn] ?? since,
          lastSyncAt: state?.last_sync_at ?? null,
        })
      }
    }
  }

  function parseOutboxPayload(payload) {
    if (!payload) return null

    try {
      return JSON.parse(payload)
    } catch {
      return null
    }
  }

  function markOutboxRow(database, rowId, changes) {
    database
      .prepare(
        `UPDATE sync_outbox
            SET status = ?,
                attempts = ?,
                last_error = ?,
                synced_at = ?,
                updated_at = ?
          WHERE id = ?`,
      )
      .run(
        changes.status,
        changes.attempts,
        changes.lastError ?? null,
        changes.syncedAt ?? null,
        new Date().toISOString(),
        rowId,
      )
  }

  function remoteWinsConflict(baseRemoteUpdatedAt, localUpdatedAt, remoteUpdatedAt) {
    if (!baseRemoteUpdatedAt) {
      return false
    }

    if (!remoteUpdatedAt) {
      return true
    }

    if (remoteUpdatedAt <= baseRemoteUpdatedAt) {
      return false
    }

    if (!localUpdatedAt) {
      return true
    }

    return remoteUpdatedAt >= localUpdatedAt
  }

  async function restoreAuthoritativeLocalState(database, client, config, recordId) {
    const remoteRow = await fetchRemoteRow(client, config, recordId)

    if (remoteRow) {
      upsertLocalRow(database, config, remoteRow)
      return remoteRow
    }

    database
      .prepare(`DELETE FROM ${quoteIdentifier(config.tableName)} WHERE ${quoteIdentifier(config.primaryKey)} = ?`)
      .run(coerceRecordId(recordId))
    return null
  }

  async function flushOutbox(database, client) {
    const rows = database
      .prepare(
        `SELECT *
           FROM sync_outbox
          WHERE status IN (${OUTBOX_ACTIVE_STATUSES.map(() => '?').join(', ')})
          ORDER BY created_at ASC, id ASC`,
      )
      .all(...OUTBOX_ACTIVE_STATUSES)
    const affectedRecords = []

    for (const row of rows) {
      const config = replicatedTablesByName[row.table_name]

      if (!config) {
        markOutboxRow(database, row.id, {
          status: 'error',
          attempts: Number(row.attempts ?? 0) + 1,
          lastError: `Unknown replicated table: ${row.table_name}`,
        })
        continue
      }

      const localPayload = parseOutboxPayload(row.row_payload)
      const localUpdatedAt = row.local_updated_at ?? localPayload?.[config.watermarkColumn] ?? null
      const remoteRow = await fetchRemoteRow(client, config, row.record_id)
      const remoteUpdatedAt = remoteRow?.[config.watermarkColumn] ?? null

      if (row.operation === 'DELETE' && !remoteRow) {
        markOutboxRow(database, row.id, {
          status: 'synced',
          attempts: Number(row.attempts ?? 0),
          lastError: null,
          syncedAt: new Date().toISOString(),
        })
        continue
      }

      if (row.operation === 'INSERT' && remoteRow) {
        await restoreAuthoritativeLocalState(database, client, config, row.record_id)
        markOutboxRow(database, row.id, {
          status: 'conflict',
          attempts: Number(row.attempts ?? 0) + 1,
          lastError: 'Remote row already exists with the same primary key',
        })
        continue
      }

      if (row.operation !== 'DELETE' && remoteRow === null && row.base_remote_updated_at) {
        await restoreAuthoritativeLocalState(database, client, config, row.record_id)
        markOutboxRow(database, row.id, {
          status: 'conflict',
          attempts: Number(row.attempts ?? 0) + 1,
          lastError: 'Remote row was deleted after the local base version',
        })
        continue
      }

      if (remoteWinsConflict(row.base_remote_updated_at, localUpdatedAt, remoteUpdatedAt)) {
        await restoreAuthoritativeLocalState(database, client, config, row.record_id)
        markOutboxRow(database, row.id, {
          status: 'conflict',
          attempts: Number(row.attempts ?? 0) + 1,
          lastError: 'Remote row is newer than the local pending write',
        })
        continue
      }

      try {
        if (row.operation === 'DELETE') {
          await client.execute(
            `DELETE FROM ${quoteIdentifier(config.tableName)} WHERE ${quoteIdentifier(config.primaryKey)} = ?`,
            [coerceRecordId(row.record_id)],
          )
        } else {
          if (!localPayload) {
            throw new Error('Missing row payload')
          }

          await upsertRemoteRow(client, config, localPayload)
        }

        await restoreAuthoritativeLocalState(database, client, config, row.record_id)
        markOutboxRow(database, row.id, {
          status: 'synced',
          attempts: Number(row.attempts ?? 0),
          lastError: null,
          syncedAt: new Date().toISOString(),
        })
        affectedRecords.push({
          tableName: config.tableName,
          recordId: row.record_id,
        })
      } catch (error) {
        markOutboxRow(database, row.id, {
          status: 'error',
          attempts: Number(row.attempts ?? 0) + 1,
          lastError: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return affectedRecords
  }

  async function refreshAffectedRows(database, client, affectedRecords) {
    const deduped = new Map()

    for (const item of affectedRecords) {
      deduped.set(`${item.tableName}:${item.recordId}`, item)
    }

    for (const item of deduped.values()) {
      const config = replicatedTablesByName[item.tableName]
      if (!config) continue

      await restoreAuthoritativeLocalState(database, client, config, item.recordId)

      const state = getSyncState(database, config.tableName)
      upsertSyncState(database, config.tableName, {
        lastPulledAt: state?.last_pulled_at ?? DEFAULT_WATERMARK,
        lastSyncAt: new Date().toISOString(),
      })
    }
  }

  async function performSync() {
    const database = getDatabase()
    const client = await getTursoClient()

    refreshCounts(database)

    if (!client) {
      setStatus('offline')
      return getStatusSnapshot(database)
    }

    setStatus('syncing')
    await client.execute('SELECT 1')

    await pullRemoteChanges(database, client)
    const affectedRecords = await flushOutbox(database, client)
    await refreshAffectedRows(database, client, affectedRecords)

    status.status = 'online'
    status.lastError = null
    status.lastCheckedAt = new Date().toISOString()
    status.lastSyncedAt = status.lastCheckedAt

    return getStatusSnapshot(database)
  }

  async function triggerSync() {
    if (syncPromise) {
      return syncPromise
    }

    syncPromise = performSync()
      .catch((error) => {
        setStatus('offline', error)
        return getStatusSnapshot(getDatabase())
      })
      .finally(() => {
        syncPromise = null
      })

    return syncPromise
  }

  async function heartbeat({ runSync = true } = {}) {
    const database = getDatabase()
    refreshCounts(database)

    const client = await getTursoClient().catch((error) => {
      setStatus('offline', error)
      return null
    })

    if (!client) {
      setStatus('offline')
      return getStatusSnapshot(database)
    }

    try {
      await client.execute('SELECT 1')
    } catch (error) {
      setStatus('offline', error)
      return getStatusSnapshot(database)
    }

    if (runSync) {
      return triggerSync()
    }

    status.status = 'online'
    status.lastError = null
    status.lastCheckedAt = new Date().toISOString()

    return getStatusSnapshot(database)
  }

  function start(intervalMs = 15_000) {
    if (pollTimer) {
      return
    }

    void heartbeat()
    pollTimer = setInterval(() => {
      void heartbeat()
    }, intervalMs)
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function getConflictSummary(database = getDatabase()) {
    return database
      .prepare(
        `SELECT table_name, record_id, last_error, local_updated_at, base_remote_updated_at
           FROM sync_outbox
          WHERE status = 'conflict'
          ORDER BY updated_at DESC`,
      )
      .all()
      .map((row) => ({
        tableName: row.table_name,
        recordId: String(row.record_id),
        reason: row.last_error ?? 'Remote row won the conflict',
        localUpdatedAt: row.local_updated_at ?? null,
        remoteUpdatedAt: null,
      }))
  }

  function parseWriteStatement(sql) {
    const insertMatch = /^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i.exec(sql)
    if (insertMatch) {
      return {
        operation: 'INSERT',
        tableName: insertMatch[1],
        whereClause: null,
        whereParamCount: 0,
      }
    }

    const updateMatch = /^\s*UPDATE\s+(\w+)\s+SET\b/i.exec(sql)
    if (updateMatch) {
      const whereMatch = /\bWHERE\b([\s\S]+)$/i.exec(sql)
      const whereClause = whereMatch?.[1]?.trim() ?? null
      return {
        operation: 'UPDATE',
        tableName: updateMatch[1],
        whereClause,
        whereParamCount: whereClause ? (whereClause.match(/\?/g) ?? []).length : 0,
      }
    }

    const deleteMatch = /^\s*DELETE\s+FROM\s+(\w+)/i.exec(sql)
    if (deleteMatch) {
      const whereMatch = /\bWHERE\b([\s\S]+)$/i.exec(sql)
      const whereClause = whereMatch?.[1]?.trim() ?? null
      return {
        operation: 'DELETE',
        tableName: deleteMatch[1],
        whereClause,
        whereParamCount: whereClause ? (whereClause.match(/\?/g) ?? []).length : 0,
      }
    }

    return null
  }

  function selectMatchingRows(database, config, whereClause, params, whereParamCount = 0) {
    if (!whereClause) {
      return []
    }

    const whereParams = whereParamCount > 0 ? params.slice(-whereParamCount) : []

    return database
      .prepare(`SELECT ${quoteColumns(config.columns)} FROM ${quoteIdentifier(config.tableName)} WHERE ${whereClause}`)
      .all(...whereParams)
  }

  function selectRowByPrimaryKey(database, config, recordId) {
    return (
      database
        .prepare(
          `SELECT ${quoteColumns(config.columns)}
             FROM ${quoteIdentifier(config.tableName)}
            WHERE ${quoteIdentifier(config.primaryKey)} = ?
            LIMIT 1`,
        )
        .get(coerceRecordId(recordId)) ?? null
    )
  }

  function getExistingOutboxRow(database, tableName, recordId) {
    return (
      database.prepare('SELECT * FROM sync_outbox WHERE table_name = ? AND record_id = ? LIMIT 1').get(tableName, String(recordId)) ??
      null
    )
  }

  function storeOutboxRow(database, change) {
    const existing = getExistingOutboxRow(database, change.tableName, change.recordId)

    if (existing && existing.operation === 'INSERT' && change.operation === 'DELETE' && !existing.base_remote_updated_at) {
      database.prepare('DELETE FROM sync_outbox WHERE id = ?').run(existing.id)
      return
    }

    const operation =
      existing?.operation === 'INSERT' && change.operation === 'UPDATE' ? 'INSERT' : change.operation
    const baseRemoteUpdatedAt = existing?.base_remote_updated_at ?? change.baseRemoteUpdatedAt ?? null
    const now = new Date().toISOString()

    database
      .prepare(
        `INSERT INTO sync_outbox (
           table_name,
           record_id,
           operation,
           row_payload,
           local_updated_at,
           base_remote_updated_at,
           status,
           attempts,
           last_error,
           synced_at,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, ?, ?)
         ON CONFLICT(table_name, record_id) DO UPDATE SET
           operation = excluded.operation,
           row_payload = excluded.row_payload,
           local_updated_at = excluded.local_updated_at,
           base_remote_updated_at = COALESCE(sync_outbox.base_remote_updated_at, excluded.base_remote_updated_at),
           status = 'pending',
           attempts = 0,
           last_error = NULL,
           synced_at = NULL,
           updated_at = excluded.updated_at`,
      )
      .run(
        change.tableName,
        String(change.recordId),
        operation,
        change.rowPayload ? JSON.stringify(change.rowPayload) : null,
        change.localUpdatedAt ?? null,
        baseRemoteUpdatedAt,
        existing?.created_at ?? now,
        now,
      )
  }

  function captureWrite(database, sql, params) {
    const parsed = parseWriteStatement(sql)
    if (!parsed) {
      return null
    }

    const config = replicatedTablesByName[parsed.tableName]
    if (!config || config.tableName === 'sync_outbox' || config.tableName === 'sync_state') {
      return null
    }

    return {
      config,
      parsed,
      beforeRows:
        parsed.operation === 'INSERT'
          ? []
          : selectMatchingRows(database, config, parsed.whereClause, params, parsed.whereParamCount),
    }
  }

  function trackWrite(database, capturedWrite, result) {
    if (!capturedWrite) {
      return
    }

    const { config, parsed, beforeRows } = capturedWrite

    if (parsed.operation === 'INSERT') {
      if (!result || !result.lastInsertRowid) {
        return
      }

      const recordId = String(result.lastInsertRowid)
      const row = selectRowByPrimaryKey(database, config, recordId)
      if (!row) return

      storeOutboxRow(database, {
        tableName: config.tableName,
        recordId,
        operation: 'INSERT',
        rowPayload: row,
        localUpdatedAt: row[config.watermarkColumn] ?? row.created_at ?? null,
        baseRemoteUpdatedAt: null,
      })
      refreshCounts(database)
      return
    }

    if (beforeRows.length === 0) {
      return
    }

    if (parsed.operation === 'DELETE') {
      for (const row of beforeRows) {
        storeOutboxRow(database, {
          tableName: config.tableName,
          recordId: row[config.primaryKey],
          operation: 'DELETE',
          rowPayload: row,
          localUpdatedAt: new Date().toISOString(),
          baseRemoteUpdatedAt: row[config.watermarkColumn] ?? null,
        })
      }

      refreshCounts(database)
      return
    }

    for (const beforeRow of beforeRows) {
      const recordId = String(beforeRow[config.primaryKey])
      const afterRow = selectRowByPrimaryKey(database, config, recordId)

      if (!afterRow) {
        continue
      }

      storeOutboxRow(database, {
        tableName: config.tableName,
        recordId,
        operation: 'UPDATE',
        rowPayload: afterRow,
        localUpdatedAt: afterRow[config.watermarkColumn] ?? new Date().toISOString(),
        baseRemoteUpdatedAt: beforeRow[config.watermarkColumn] ?? null,
      })
    }

    refreshCounts(database)
  }

  return {
    captureWrite,
    getStatusSnapshot,
    getConflictSummary,
    heartbeat,
    start,
    stop,
    trackWrite,
    triggerSync,
  }
}

module.exports = {
  createSyncManager,
}
