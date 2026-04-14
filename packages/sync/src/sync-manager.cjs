const { replicatedTables, replicatedTablesByName } = require('@openpos/data')

const DEFAULT_WATERMARK = '1970-01-01T00:00:00.000Z'
const OUTBOX_ACTIVE_STATUSES = ['pending', 'error', 'conflict']
const OUTBOX_OPEN_STATUSES = ['pending', 'error', 'conflict']
const PRODUCT_IMAGE_REPAIR_BATCH_SIZE = 200

function logSync(message, details) {
  if (details === undefined) {
    console.log(`[sync] ${message}`)
    return
  }

  console.log(`[sync] ${message}`, details)
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`
}

function quoteColumns(columns) {
  return columns.map((column) => quoteIdentifier(column)).join(', ')
}

function normalizeComparableValue(value) {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value === 'string') {
    try {
      return normalizeComparableValue(JSON.parse(value))
    } catch {
      return value
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeComparableValue(item))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, normalizeComparableValue(entryValue)]),
    )
  }

  return value
}

function rowsMateriallyEqual(config, left, right) {
  return config.columns.every((column) => {
    const leftValue = normalizeComparableValue(left?.[column])
    const rightValue = normalizeComparableValue(right?.[column])
    return JSON.stringify(leftValue) === JSON.stringify(rightValue)
  })
}

function createSyncManager({ getDatabase, getRemoteConfig, onFlushOrderQueue, getRemoteClient: getRemoteClientOverride }) {
  let pollTimer = null
  let syncPromise = null
  let cachedClient = null
  let cachedConfigKey = null
  let cachedConnectModule = null
  let hardDeleteCycleCounter = 0
  let remoteInfrastructureEnsured = false
  let lastKnownVersion = null
  const remoteSchemaCache = new Map()
  const status = {
    status: 'offline',
    isSyncing: false,
    mode: 'mirror',
    remoteConfigured: false,
    pendingWrites: 0,
    erroredWrites: 0,
    conflictedWrites: 0,
    lastCheckedAt: null,
    lastSyncedAt: null,
    lastError: null,
  }

  function refreshCounts(database = getDatabase()) {
    const pendingRow = database.prepare(`SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'pending'`).get()
    const errorRow = database.prepare(`SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'error'`).get()
    const conflictRow = database.prepare(`SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'conflict'`).get()

    status.pendingWrites = Number(pendingRow?.count ?? 0)
    status.erroredWrites = Number(errorRow?.count ?? 0)
    status.conflictedWrites = Number(conflictRow?.count ?? 0)
  }

  function getStatusSnapshot(database = getDatabase()) {
    refreshCounts(database)
    return {
      ...status,
    }
  }

  function invalidateCachedClient() {
    cachedClient = null
    cachedConfigKey = null
  }

  async function getTursoClient() {
    const config = getRemoteConfig()
    status.remoteConfigured = Boolean(config.configured)

    if (!config.configured || !config.url || !config.authToken) {
      invalidateCachedClient()
      logSync('remote client unavailable because config is incomplete')
      return null
    }

    const configKey = `${config.url}:${config.authToken}`

    if (cachedClient && cachedConfigKey === configKey) {
      return cachedClient
    }

    logSync('resolve remote config', {
      configured: Boolean(config.configured),
      hasUrl: Boolean(config.url),
      hasAuthToken: Boolean(config.authToken),
      url: config.url ?? null,
    })

    if (getRemoteClientOverride) {
      cachedClient = await getRemoteClientOverride(config)
      cachedConfigKey = configKey
      return cachedClient
    }

    if (!cachedConnectModule) {
      cachedConnectModule = (await import('@tursodatabase/serverless')).connect
    }

    logSync('creating Turso client')
    cachedClient = cachedConnectModule({
      url: config.url,
      authToken: config.authToken,
    })
    cachedConfigKey = configKey
    return cachedClient
  }

  function setStatus(nextStatus, error = null) {
    status.status = nextStatus
    status.lastError = error instanceof Error ? error.message : error
    status.lastCheckedAt = new Date().toISOString()
    logSync('status changed', {
      status: nextStatus,
      lastError: status.lastError,
      lastCheckedAt: status.lastCheckedAt,
    })
  }

  function beginSync({ foreground = false } = {}) {
    status.isSyncing = true

    if (foreground) {
      setStatus('syncing')
      return
    }

    status.lastCheckedAt = new Date().toISOString()
    logSync('background sync started', {
      status: status.status,
      lastCheckedAt: status.lastCheckedAt,
    })
  }

  function endSync() {
    status.isSyncing = false
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

  async function getRemoteTableColumns(client, tableName) {
    if (remoteSchemaCache.has(tableName)) {
      return remoteSchemaCache.get(tableName)
    }

    const rows = await fetchRemoteRows(client, `PRAGMA table_info(${quoteIdentifier(tableName)})`)
    const columns = new Set(rows.map((row) => String(row.name)))
    remoteSchemaCache.set(tableName, columns)
    logSync('loaded remote table columns', {
      table: tableName,
      columns: [...columns],
    })
    return columns
  }

  async function ensureRemoteInfrastructure(client) {
    if (remoteInfrastructureEnsured) return
    try {
      const check = await fetchRemoteRows(client, 'SELECT version FROM sync_metadata WHERE id = 1')
      if (check.length > 0) {
        remoteInfrastructureEnsured = true
        logSync('remote infrastructure already exists')
        return
      }
    } catch {
      // Table does not exist yet.
    }

    try {
      for (const config of replicatedTables) {
        if (config.watermarkColumn) {
          await client.execute(
            `CREATE INDEX IF NOT EXISTS idx_${config.tableName}_${config.watermarkColumn} ON ${quoteIdentifier(config.tableName)}(${quoteIdentifier(config.watermarkColumn)})`,
          )
        }
      }

      await client.execute(
        'CREATE TABLE IF NOT EXISTS sync_metadata (id INTEGER PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0)',
      )
      await client.execute('INSERT OR IGNORE INTO sync_metadata (id, version) VALUES (1, 0)')

      for (const config of replicatedTables) {
        const table = quoteIdentifier(config.tableName)
        for (const op of ['ins', 'upd', 'del']) {
          const event = op === 'ins' ? 'INSERT' : op === 'upd' ? 'UPDATE' : 'DELETE'
          await client.execute(
            `CREATE TRIGGER IF NOT EXISTS trg_${config.tableName}_sync_${op} AFTER ${event} ON ${table} BEGIN UPDATE sync_metadata SET version = version + 1 WHERE id = 1; END`,
          )
        }
      }

      remoteInfrastructureEnsured = true
      logSync('remote infrastructure created (indexes, sentinel, triggers)')
    } catch (error) {
      logSync('failed to ensure remote infrastructure', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  function resolveCompatibleWatermarkColumn(config, remoteColumns) {
    if (remoteColumns.has(config.watermarkColumn)) {
      return config.watermarkColumn
    }

    if (config.watermarkColumn === 'updated_at' && remoteColumns.has('created_at')) {
      return 'created_at'
    }

    return null
  }

  function buildRemoteSelectColumns(config, remoteColumns, effectiveWatermarkColumn) {
    return config.columns
      .map((column) => {
        if (remoteColumns.has(column)) {
          return quoteIdentifier(column)
        }

        if (column === config.watermarkColumn && effectiveWatermarkColumn && remoteColumns.has(effectiveWatermarkColumn)) {
          return `${quoteIdentifier(effectiveWatermarkColumn)} AS ${quoteIdentifier(column)}`
        }

        return `NULL AS ${quoteIdentifier(column)}`
      })
      .join(', ')
  }

  async function fetchRemoteRow(client, config, recordId) {
    const remoteColumns = await getRemoteTableColumns(client, config.tableName)
    const effectiveWatermarkColumn = resolveCompatibleWatermarkColumn(config, remoteColumns)
    const rows = await fetchRemoteRows(
      client,
      `SELECT ${buildRemoteSelectColumns(config, remoteColumns, effectiveWatermarkColumn)}
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
    const assignments = config.columns
      .filter((column) => column !== config.primaryKey)
      .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
      .join(', ')
    const values = config.columns.map((column) => row[column] ?? null)

    logSync('upserting local replicated row without replace semantics', {
      table: config.tableName,
      recordId: String(row[config.primaryKey]),
    })

    database
      .prepare(
        `INSERT INTO ${quoteIdentifier(config.tableName)} (${quoteColumns(config.columns)})
         VALUES (${placeholders})
         ON CONFLICT(${quoteIdentifier(config.primaryKey)}) DO UPDATE SET ${assignments}`,
      )
      .run(...values)
  }

  async function upsertRemoteRow(client, config, row) {
    const remoteColumns = await getRemoteTableColumns(client, config.tableName)
    const writeColumns = config.columns.filter((column) => remoteColumns.has(column))

    if (writeColumns.length === 0) {
      throw new Error(`Remote table "${config.tableName}" has no compatible writable columns`)
    }

    const placeholders = writeColumns.map(() => '?').join(', ')
    const assignments = writeColumns
      .filter((column) => column !== config.primaryKey)
      .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
      .join(', ')
    const values = writeColumns.map((column) => row[column] ?? null)

    const sql = assignments
      ? `INSERT INTO ${quoteIdentifier(config.tableName)} (${quoteColumns(writeColumns)})
         VALUES (${placeholders})
         ON CONFLICT(${quoteIdentifier(config.primaryKey)}) DO UPDATE SET ${assignments}`
      : `INSERT INTO ${quoteIdentifier(config.tableName)} (${quoteColumns(writeColumns)})
         VALUES (${placeholders})
         ON CONFLICT(${quoteIdentifier(config.primaryKey)}) DO NOTHING`

    logSync('writing remote row', {
      table: config.tableName,
      writeColumns,
    })

    await client.execute(sql, values)
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

  function getOpenOutboxRecordIds(database, tableName) {
    return new Set(
      database
        .prepare(
          `SELECT record_id
             FROM sync_outbox
            WHERE table_name = ?
              AND status IN (${OUTBOX_OPEN_STATUSES.map(() => '?').join(', ')})`,
        )
        .all(tableName, ...OUTBOX_OPEN_STATUSES)
        .map((row) => String(row.record_id)),
    )
  }

  async function reconcileHardDeletes(database, client, config, prefetchedRemoteCount) {
    let remoteCount
    if (prefetchedRemoteCount !== undefined) {
      remoteCount = prefetchedRemoteCount
    } else {
      const remoteCountRows = await fetchRemoteRows(
        client,
        `SELECT COUNT(*) AS c FROM ${quoteIdentifier(config.tableName)}`,
      )
      remoteCount = Number(remoteCountRows[0]?.c ?? 0)
    }
    const localCountRow = database.prepare(`SELECT COUNT(*) AS c FROM ${quoteIdentifier(config.tableName)}`).get()
    const localCount = Number(localCountRow?.c ?? 0)

    if (remoteCount >= localCount) {
      logSync('hard delete reconciliation skipped (counts match or remote has more)', {
        table: config.tableName,
        remoteCount,
        localCount,
      })
      return
    }

    logSync('hard delete reconciliation running (local has extra rows)', {
      table: config.tableName,
      remoteCount,
      localCount,
    })

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
    const protectedIds = getOpenOutboxRecordIds(database, config.tableName)

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

  async function detectChangedTables(database, client, { includeHardDeleteCounts = false } = {}) {
    try {
      const sentinel = await fetchRemoteRows(client, 'SELECT version FROM sync_metadata WHERE id = 1')
      const remoteVersion = sentinel[0]?.version ?? null

      if (
        remoteVersion !== null &&
        lastKnownVersion !== null &&
        remoteVersion === lastKnownVersion &&
        !includeHardDeleteCounts
      ) {
        logSync('sentinel unchanged, skipping detection', { version: remoteVersion })
        return { changedTables: new Set(), remoteCounts: new Map() }
      }

      lastKnownVersion = remoteVersion
    } catch {
      // Sentinel table may not exist yet.
    }

    const orderedTables = [...replicatedTables].sort((left, right) => left.pullOrder - right.pullOrder)
    const selectParts = []
    const params = []
    const alwaysPull = []
    const watermarkTables = []

    for (const config of orderedTables) {
      const state = getSyncState(database, config.tableName)
      const since = state?.last_pulled_at ?? DEFAULT_WATERMARK

      if (config.watermarkColumn) {
        selectParts.push(
          `(SELECT EXISTS(SELECT 1 FROM ${quoteIdentifier(config.tableName)} WHERE ${quoteIdentifier(config.watermarkColumn)} > ?)) AS ${quoteIdentifier('chg_' + config.tableName)}`,
        )
        params.push(since)
        watermarkTables.push(config.tableName)
      } else {
        alwaysPull.push(config.tableName)
      }

      if (includeHardDeleteCounts && config.deleteStrategy === 'hard' && config.tableName !== 'order_items') {
        selectParts.push(
          `(SELECT COUNT(*) FROM ${quoteIdentifier(config.tableName)}) AS ${quoteIdentifier('cnt_' + config.tableName)}`,
        )
      }
    }

    const changedTables = new Set(alwaysPull)
    const remoteCounts = new Map()

    if (selectParts.length > 0) {
      const sql = `SELECT ${selectParts.join(', ')}`
      const rows = await fetchRemoteRows(client, sql, params)
      const row = rows[0]

      if (row) {
        for (const tableName of watermarkTables) {
          if (row['chg_' + tableName] === 1) {
            changedTables.add(tableName)
          }
        }

        for (const config of orderedTables) {
          const countKey = 'cnt_' + config.tableName
          if (countKey in row) {
            remoteCounts.set(config.tableName, Number(row[countKey]))
          }
        }
      }
    }

    logSync('change detection completed', {
      changedTables: [...changedTables],
      totalTables: orderedTables.length,
    })

    return { changedTables, remoteCounts }
  }

  async function runHardDeleteReconciliation(database, client, remoteCounts) {
    const hardDeleteTables = replicatedTables.filter(
      (config) => config.deleteStrategy === 'hard' && config.tableName !== 'order_items',
    )
    for (const config of hardDeleteTables) {
      const remoteCount = remoteCounts.get(config.tableName)
      if (remoteCount !== undefined) {
        await reconcileHardDeletes(database, client, config, remoteCount)
      }
    }
  }

  async function pullRemoteChanges(database, client, changedTables) {
    const orderedTables = [...replicatedTables].sort((left, right) => left.pullOrder - right.pullOrder)
    const changedOrderIds = new Set()
    const queuedOrderIds = new Set(
      database
        .prepare(
          `SELECT order_id
             FROM order_sync_queue
            WHERE operation = 'UPSERT'`,
        )
        .all()
        .map((row) => String(row.order_id)),
    )

    for (const config of orderedTables) {
      if (!changedTables.has(config.tableName)) {
        continue
      }

      const remoteColumns = await getRemoteTableColumns(client, config.tableName)
      const effectiveWatermarkColumn = resolveCompatibleWatermarkColumn(config, remoteColumns)
      const state = getSyncState(database, config.tableName)
      const since = state?.last_pulled_at ?? DEFAULT_WATERMARK
      const protectedRecordIds = getOpenOutboxRecordIds(database, config.tableName)

      logSync('pulling changed rows', {
        table: config.tableName,
        since,
        watermarkColumn: effectiveWatermarkColumn ?? 'FULL_TABLE_SCAN',
      })

      const remoteRows = effectiveWatermarkColumn
        ? await fetchRemoteRows(
            client,
            `SELECT ${buildRemoteSelectColumns(config, remoteColumns, effectiveWatermarkColumn)}
               FROM ${quoteIdentifier(config.tableName)}
              WHERE ${quoteIdentifier(effectiveWatermarkColumn)} > ?
              ORDER BY ${quoteIdentifier(effectiveWatermarkColumn)} ASC, ${quoteIdentifier(config.primaryKey)} ASC`,
            [since],
          )
        : await fetchRemoteRows(
            client,
            `SELECT ${buildRemoteSelectColumns(config, remoteColumns, effectiveWatermarkColumn)}
               FROM ${quoteIdentifier(config.tableName)}
              ORDER BY ${quoteIdentifier(config.primaryKey)} ASC`,
          )
      logSync('remote rows fetched', {
        table: config.tableName,
        count: remoteRows.length,
      })

      if (config.tableName === 'orders' && remoteRows.length > 0) {
        for (const row of remoteRows) {
          changedOrderIds.add(String(row.id))
        }

        logSync('remote order changed', {
          orderIds: [...changedOrderIds],
        })
      }

      if (config.tableName === 'order_items') {
        const pullableOrderIds = [...changedOrderIds].filter((id) => {
          if (queuedOrderIds.has(id)) {
            logSync('child snapshot skipped because local aggregate push is pending', { orderId: id })
            return false
          }
          return true
        })

        if (pullableOrderIds.length > 0) {
          const placeholders = pullableOrderIds.map(() => '?').join(', ')
          const remoteSnapshotRows = await fetchRemoteRows(
            client,
            `SELECT ${buildRemoteSelectColumns(config, remoteColumns, effectiveWatermarkColumn)}
               FROM ${quoteIdentifier(config.tableName)}
              WHERE order_id IN (${placeholders})
              ORDER BY order_id ASC, ${quoteIdentifier(config.primaryKey)} ASC`,
            pullableOrderIds.map((id) => coerceRecordId(id)),
          )

          const itemsByOrder = new Map()
          for (const row of remoteSnapshotRows) {
            const oid = String(row.order_id)
            if (!itemsByOrder.has(oid)) {
              itemsByOrder.set(oid, [])
            }
            itemsByOrder.get(oid).push(row)
          }

          const deleteByOrderStatement = database.prepare('DELETE FROM order_items WHERE order_id = ?')
          const refreshedOrderIds = []

          for (const orderId of pullableOrderIds) {
            deleteByOrderStatement.run(coerceRecordId(orderId))
            const items = itemsByOrder.get(orderId) ?? []
            for (const row of items) {
              upsertLocalRow(database, config, row)
            }
            refreshedOrderIds.push({ orderId, itemCount: items.length })
          }

          if (refreshedOrderIds.length > 0) {
            logSync('full child snapshot refreshed', { orders: refreshedOrderIds })
          }
        }
      } else {
        for (const row of remoteRows) {
          const recordId = String(row[config.primaryKey])

          if (protectedRecordIds.has(recordId)) {
            logSync('remote row skipped because a local outbox write is still open', {
              table: config.tableName,
              recordId,
            })
            continue
          }

          if (config.tableName === 'orders' && queuedOrderIds.has(recordId)) {
            logSync('remote order skipped because local aggregate push is pending', {
              orderId: recordId,
            })
            continue
          }

          upsertLocalRow(database, config, row)
        }
      }

      if (remoteRows.length > 0 && effectiveWatermarkColumn) {
        const lastRow = remoteRows[remoteRows.length - 1]
        upsertSyncState(database, config.tableName, {
          lastPulledAt: lastRow[config.watermarkColumn] ?? since,
          lastSyncAt: state?.last_sync_at ?? null,
        })
        logSync('sync state updated for table', {
          table: config.tableName,
          lastPulledAt: lastRow[config.watermarkColumn] ?? since,
        })
      } else if (remoteRows.length > 0) {
        logSync('skipping sync watermark update because remote table has no compatible watermark column', {
          table: config.tableName,
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

  function remoteShouldWin(localUpdatedAt, remoteUpdatedAt) {
    if (!remoteUpdatedAt) {
      return false
    }

    if (!localUpdatedAt) {
      return true
    }

    return remoteUpdatedAt > localUpdatedAt
  }

  function markResolved(database, row, lastError = null) {
    markOutboxRow(database, row.id, {
      status: 'synced',
      attempts: Number(row.attempts ?? 0),
      lastError,
      syncedAt: new Date().toISOString(),
    })
  }

  function applyLocalState(database, config, remoteRow, recordId) {
    if (remoteRow) {
      upsertLocalRow(database, config, remoteRow)
    } else {
      database
        .prepare(`DELETE FROM ${quoteIdentifier(config.tableName)} WHERE ${quoteIdentifier(config.primaryKey)} = ?`)
        .run(coerceRecordId(recordId))
    }
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
    const affectedTables = new Set()

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
        markResolved(database, row)
        continue
      }

      if (remoteRow && localPayload && rowsMateriallyEqual(config, localPayload, remoteRow)) {
        applyLocalState(database, config, remoteRow, row.record_id)
        markResolved(database, row)
        continue
      }

      if (remoteRow && remoteShouldWin(localUpdatedAt, remoteUpdatedAt)) {
        logSync('remote row won reconciliation by updated_at', {
          table: config.tableName,
          recordId: String(row.record_id),
          localUpdatedAt,
          remoteUpdatedAt,
        })
        applyLocalState(database, config, remoteRow, row.record_id)
        markResolved(database, row)
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

        markResolved(database, row)
        affectedTables.add(config.tableName)
      } catch (error) {
        markOutboxRow(database, row.id, {
          status: 'error',
          attempts: Number(row.attempts ?? 0) + 1,
          lastError: error instanceof Error ? error.message : String(error),
        })
      }
    }

    for (const tableName of affectedTables) {
      const state = getSyncState(database, tableName)
      upsertSyncState(database, tableName, {
        lastPulledAt: state?.last_pulled_at ?? DEFAULT_WATERMARK,
        lastSyncAt: new Date().toISOString(),
      })
    }
  }

  async function performSync({ foreground = false } = {}) {
    const database = getDatabase()
    logSync('perform sync started')
    const client = await getTursoClient()

    refreshCounts(database)
    logSync('local queue counts before sync', {
      pendingWrites: status.pendingWrites,
      conflictedWrites: status.conflictedWrites,
    })

    if (!client) {
      endSync()
      setStatus('offline')
      return getStatusSnapshot(database)
    }

    beginSync({ foreground })
    await ensureRemoteInfrastructure(client)
    hardDeleteCycleCounter++
    const runHardDeletes = hardDeleteCycleCounter % 8 === 0
    const { changedTables, remoteCounts } = await detectChangedTables(database, client, {
      includeHardDeleteCounts: runHardDeletes,
    })

    if (changedTables.size > 0) {
      await pullRemoteChanges(database, client, changedTables)
    } else {
      logSync('no changes detected, skipping pull')
    }
    if (runHardDeletes && remoteCounts.size > 0) {
      await runHardDeleteReconciliation(database, client, remoteCounts)
    }
    await repairMissingProductImages(database, client)
    logSync('remote pull phase completed')
    await flushOutbox(database, client)
    logSync('outbox flush completed')

    if (onFlushOrderQueue) {
      try {
        await onFlushOrderQueue(client)
        logSync('order queue flush completed')
      } catch (error) {
        logSync('order queue flush failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    status.status = 'online'
    status.isSyncing = false
    status.lastError = null
    status.lastCheckedAt = new Date().toISOString()
    status.lastSyncedAt = status.lastCheckedAt
    logSync('sync finished successfully', {
      lastSyncedAt: status.lastSyncedAt,
    })

    return getStatusSnapshot(database)
  }

  async function triggerSync(options = {}) {
    if (syncPromise) {
      logSync('reusing in-flight sync promise')
      return syncPromise
    }

    logSync('trigger sync requested')
    syncPromise = performSync(options)
      .catch((error) => {
        logSync('sync failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        invalidateCachedClient()
        endSync()
        setStatus('offline', error)
        return getStatusSnapshot(getDatabase())
      })
      .finally(() => {
        logSync('sync promise cleared')
        syncPromise = null
      })

    return syncPromise
  }

  async function heartbeat() {
    return triggerSync({ foreground: false })
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

  async function repairMissingProductImages(database, client) {
    const config = replicatedTablesByName.products
    if (!config) {
      return
    }

    const candidateIds = database
      .prepare(
        `SELECT p.${quoteIdentifier(config.primaryKey)} AS id
           FROM ${quoteIdentifier(config.tableName)} p
          WHERE TRIM(COALESCE(p.image, '')) = ''
            AND NOT EXISTS (
              SELECT 1
                FROM sync_outbox so
               WHERE so.table_name = ?
                 AND so.record_id = CAST(p.${quoteIdentifier(config.primaryKey)} AS TEXT)
                 AND so.status IN (${OUTBOX_OPEN_STATUSES.map(() => '?').join(', ')})
            )
          ORDER BY p.${quoteIdentifier(config.primaryKey)} ASC
          LIMIT ?`,
      )
      .all(config.tableName, ...OUTBOX_OPEN_STATUSES, PRODUCT_IMAGE_REPAIR_BATCH_SIZE)
      .map((row) => String(row.id))

    if (candidateIds.length === 0) {
      return
    }

    const remoteColumns = await getRemoteTableColumns(client, config.tableName)
    const effectiveWatermarkColumn = resolveCompatibleWatermarkColumn(config, remoteColumns)
    const placeholders = candidateIds.map(() => '?').join(', ')
    const remoteRows = await fetchRemoteRows(
      client,
      `SELECT ${buildRemoteSelectColumns(config, remoteColumns, effectiveWatermarkColumn)}
         FROM ${quoteIdentifier(config.tableName)}
        WHERE ${quoteIdentifier(config.primaryKey)} IN (${placeholders})
          AND TRIM(COALESCE(image, '')) != ''
        ORDER BY ${quoteIdentifier(config.primaryKey)} ASC`,
      candidateIds.map((id) => coerceRecordId(id)),
    )

    let repairedCount = 0

    for (const row of remoteRows) {
      const localRow = selectRowByPrimaryKey(database, config, row[config.primaryKey])
      if (!localRow) {
        continue
      }

      if (String(localRow.image ?? '').trim()) {
        continue
      }

      upsertLocalRow(database, config, row)
      repairedCount++
    }

    if (repairedCount > 0) {
      logSync('repaired blank local product images from remote', {
        repairedCount,
      })
    }
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

    const operation = existing?.operation === 'INSERT' && change.operation === 'UPDATE' ? 'INSERT' : change.operation
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
    if (
      !config ||
      config.tableName === 'sync_outbox' ||
      config.tableName === 'sync_state' ||
      config.tableName === 'order_items' ||
      config.tableName === 'orders'
    ) {
      if (config?.tableName === 'orders' || config?.tableName === 'order_items') {
        logSync('ignoring generic outbox capture for desktop aggregate-owned table', {
          table: config.tableName,
        })
      }
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
