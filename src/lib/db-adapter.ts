import type Database from '@tauri-apps/plugin-sql'
import type { Connection as TursoClient } from '@tursodatabase/serverless'
import { db } from './db'

// Re-export db for convenience
export { db } from './db'

/**
 * Execute a SELECT query and return results
 * Normalizes the API between Turso and Tauri SQL
 */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { client, isRemote } = await db.getClient()

  if (isRemote) {
    // Turso: client.execute returns { rows: [...], rowsAffected, lastInsertRowid }
    const tursoClient = client as TursoClient
    const result = await tursoClient.execute(sql, params)
    // Turso returns rows as arrays with column names as properties
    return result.rows as T[]
  }

  // Tauri SQL: db.select returns the array directly
  const tauriDb = client as Database
  return tauriDb.select<T[]>(sql, params)
}

/**
 * Execute an INSERT, UPDATE, or DELETE query
 * Returns the last insert ID and rows affected
 */
export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<{ lastInsertId: number; rowsAffected: number }> {
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

  // Tauri SQL: db.execute returns { lastInsertId, rowsAffected }
  const tauriDb = client as Database
  const result = await tauriDb.execute(sql, params)
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
  const { client, isRemote } = await db.getClient()

  if (isRemote) {
    // Turso: batch execute
    const tursoClient = client as TursoClient
    for (const { sql, params = [] } of statements) {
      await tursoClient.execute(sql, params)
    }
  } else {
    // Tauri SQL: use transaction
    const tauriDb = client as Database
    // Tauri SQL doesn't have explicit transaction method, so we execute sequentially
    // SQLite auto-commits each statement, but we can wrap in BEGIN/COMMIT
    await tauriDb.execute('BEGIN TRANSACTION')
    try {
      for (const { sql, params = [] } of statements) {
        await tauriDb.execute(sql, params)
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
 * Reset database connections (useful for testing)
 */
export function resetConnections(): void {
  db.reset()
}
