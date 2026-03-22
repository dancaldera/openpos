import type { Connection as TursoClient } from '@tursodatabase/serverless'
import { type DbClient, db, pendingCount } from './db'
import { isDesktop } from './platform'

// Local desktop database instance type (mirrors the interface in db.ts without a static import)
type TauriDatabaseInstance = Exclude<DbClient, TursoClient>

// Re-export db for convenience
export { db } from './db'

// ---------------------------------------------------------------------------
// SQL introspection helpers
// ---------------------------------------------------------------------------

type WriteOperation = 'INSERT' | 'UPDATE' | 'DELETE'

interface WriteInfo {
  operation: WriteOperation
  tableName: string
  /** Best-effort record id extracted from WHERE id = ? clause */
  recordId: string | null
}

/**
 * Attempt to extract the write type and target table from a SQL string.
 * Returns null for SELECTs, DDL, transaction control, or unrecognised statements.
 */
function parseWriteInfo(sql: string): WriteInfo | null {
  const trimmed = sql.trim().toUpperCase()

  // Skip non-data-write statements
  if (
    trimmed.startsWith('SELECT') ||
    trimmed.startsWith('BEGIN') ||
    trimmed.startsWith('COMMIT') ||
    trimmed.startsWith('ROLLBACK') ||
    trimmed.startsWith('CREATE') ||
    trimmed.startsWith('DROP') ||
    trimmed.startsWith('ALTER') ||
    trimmed.startsWith('PRAGMA')
  ) {
    return null
  }

  const insertMatch = /^\s*INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i.exec(sql)
  if (insertMatch) {
    return { operation: 'INSERT', tableName: insertMatch[1], recordId: null }
  }

  const updateMatch = /^\s*UPDATE\s+(\w+)/i.exec(sql)
  if (updateMatch) {
    // Try to pull `id` value from a WHERE clause — handles both `WHERE id = ?`
    // (positional params) and `WHERE id = <literal>` patterns.
    const idMatch = /WHERE\s+(?:\w+\.)?id\s*=\s*(?:\?|(\d+))/i.exec(sql)
    return {
      operation: 'UPDATE',
      tableName: updateMatch[1],
      recordId: idMatch?.[1] ?? null,
    }
  }

  const deleteMatch = /^\s*DELETE\s+FROM\s+(\w+)/i.exec(sql)
  if (deleteMatch) {
    const idMatch = /WHERE\s+(?:\w+\.)?id\s*=\s*(?:\?|(\d+))/i.exec(sql)
    return {
      operation: 'DELETE',
      tableName: deleteMatch[1],
      recordId: idMatch?.[1] ?? null,
    }
  }

  return null
}

/**
 * Insert a row into pending_sync_queue using the LOCAL SQLite client directly,
 * bypassing the normal execute() path to avoid recursion.
 */
async function enqueueWrite(info: WriteInfo, sql: string, params: unknown[]): Promise<void> {
  const { client, isRemote } = await db.getClient()
  // Safety: only write to local SQLite
  if (isRemote) return

  const tauriDb = client as TauriDatabaseInstance

  // Resolve record_id: for positional params, the id is often the last param
  // in UPDATE/DELETE statements. We store it as a string for the TEXT column.
  let recordId: string | null = info.recordId
  if (recordId === null && info.operation !== 'INSERT' && params.length > 0) {
    // Heuristic: the last parameter is typically the id in WHERE id = ?
    recordId = String(params[params.length - 1])
  }

  await tauriDb.execute(
    `INSERT INTO pending_sync_queue
       (operation, table_name, record_id, payload, sql_statement)
     VALUES (?, ?, ?, ?, ?)`,
    [info.operation, info.tableName, recordId, JSON.stringify(params), sql],
  )

  // Bump the reactive pending count so the badge updates immediately
  pendingCount.value += 1
}

// ---------------------------------------------------------------------------
// Public adapter API
// ---------------------------------------------------------------------------

/**
 * Execute a SELECT query and return results
 * Normalizes the API between Turso/local desktop SQLite or API calls (web)
 */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!isDesktop) {
    // Web mode: delegate to API adapter
    const { query: apiQuery } = await import('./api-adapter')
    return apiQuery<T>(sql, params)
  }

  // Desktop mode: use Turso/SQLite directly
  const { client, isRemote } = await db.getClient()

  if (isRemote) {
    // Turso: client.execute returns { rows: [...], rowsAffected, lastInsertRowid }
    const tursoClient = client as TursoClient
    const result = await tursoClient.execute(sql, params)
    // Turso returns rows as arrays with column names as properties
    return result.rows as T[]
  }

  // Local desktop SQLite: db.select returns the array directly
  const tauriDb = client as TauriDatabaseInstance
  return tauriDb.select<T[]>(sql, params)
}

/**
 * Execute an INSERT, UPDATE, or DELETE query
 * Returns the last insert ID and rows affected
 *
 * When offline (local SQLite), also appends the write to pending_sync_queue
 * so it can be replayed against Turso on the next reconnect.
 */
export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<{ lastInsertId: number; rowsAffected: number }> {
  if (!isDesktop) {
    // Web mode: delegate to API adapter
    const { execute: apiExecute } = await import('./api-adapter')
    return apiExecute(sql, params)
  }

  // Desktop mode: use Turso/SQLite directly
  const { client, isRemote } = await db.getClient()

  if (isRemote) {
    // Turso: client.execute returns { rows: [], rowsAffected, lastInsertRowid }
    const tursoClient = client as TursoClient
    const result = await tursoClient.execute(sql, params)
    return {
      lastInsertId: result.lastInsertRowid ?? 0,
      rowsAffected: result.rowsAffected ?? 0,
    }
  }

  // Local desktop SQLite: db.execute returns { lastInsertId, rowsAffected }
  const tauriDb = client as TauriDatabaseInstance
  const result = await tauriDb.execute(sql, params)

  // Queue this write for later sync — unless it IS a queue write (avoid recursion)
  const writeInfo = parseWriteInfo(sql)
  if (writeInfo && writeInfo.tableName.toLowerCase() !== 'pending_sync_queue') {
    enqueueWrite(writeInfo, sql, params).catch((err: unknown) =>
      console.warn('[db-adapter] Failed to enqueue write for sync:', err),
    )
  }

  return {
    lastInsertId: result.lastInsertId ?? 0,
    rowsAffected: result.rowsAffected ?? 0,
  }
}

/**
 * Execute multiple statements in a transaction
 * Useful for batch operations
 */
export async function transaction(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
  if (!isDesktop) {
    // Web mode: delegate to API adapter (transaction handled server-side)
    const { execute: apiExecute } = await import('./api-adapter')
    for (const { sql, params = [] } of statements) {
      await apiExecute(sql, params)
    }
    return
  }

  // Desktop mode: use Turso/SQLite directly
  const { client, isRemote } = await db.getClient()

  if (isRemote) {
    // Turso: batch execute
    const tursoClient = client as TursoClient
    for (const { sql, params = [] } of statements) {
      await tursoClient.execute(sql, params)
    }
  } else {
    // Local desktop SQLite: use transaction
    const tauriDb = client as TauriDatabaseInstance
    // Tauri SQL doesn't have explicit transaction method, so we execute sequentially
    // SQLite auto-commits each statement, but we can wrap in BEGIN/COMMIT
    await tauriDb.execute('BEGIN TRANSACTION')
    try {
      for (const { sql, params = [] } of statements) {
        await tauriDb.execute(sql, params)

        // Queue each write inside the transaction
        const writeInfo = parseWriteInfo(sql)
        if (writeInfo && writeInfo.tableName.toLowerCase() !== 'pending_sync_queue') {
          // Fire-and-forget; failures are logged but don't abort the transaction
          enqueueWrite(writeInfo, sql, params ?? []).catch((err: unknown) =>
            console.warn('[db-adapter] Failed to enqueue transactional write:', err),
          )
        }
      }
      await tauriDb.execute('COMMIT')
    } catch (error) {
      await tauriDb.execute('ROLLBACK')
      throw error
    }
  }
}

/**
 * Check if currently connected to remote Turso database
 */
export function isRemoteConnection(): boolean {
  return db.isUsingRemote()
}

/**
 * Force reconnection to Turso (useful after network recovery)
 */
export async function reconnectToTurso(): Promise<boolean> {
  return db.reconnectToTurso()
}

/**
 * Start background health-check polling against Turso (no-op if not configured).
 */
export function startHealthCheck(intervalMs = 15_000): void {
  db.startHealthCheck(intervalMs)
}

/**
 * Stop the background health-check polling.
 */
export function stopHealthCheck(): void {
  db.stopHealthCheck()
}

/**
 * Reset database connections (useful for testing)
 */
export function resetConnections(): void {
  db.reset()
}
