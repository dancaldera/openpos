/**
 * Turso client singleton for the API server.
 */

import { createClient } from '@libsql/client'

interface QueryableClient {
  execute(sql: string, params?: unknown[]): Promise<{
    columns: string[]
    rows: Array<Record<string, unknown> | unknown[]>
    lastInsertRowid?: number | bigint
    rowsAffected?: number | bigint
  }>
}

let _client: QueryableClient | null = null

function coerceBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString()
  }
  if (Array.isArray(value)) {
    return value.map(coerceBigInts)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = coerceBigInts(entry)
    }
    return out
  }
  return value
}

export interface TursoConfig {
  url?: string
  authToken?: string
  configured: boolean
}

export function getTursoConfig(): TursoConfig {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  return {
    url: url || undefined,
    authToken: authToken || undefined,
    configured: Boolean(url && authToken),
  }
}

export function getTursoClient(): QueryableClient {
  if (_client) return _client

  const { url, authToken, configured } = getTursoConfig()

  if (!configured || !url || !authToken) {
    throw new Error(
      'Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables. ' +
        'Set these in your Vercel project settings or local .env file.',
    )
  }

  _client = createClient({ url, authToken, intMode: 'bigint' }) as QueryableClient
  return _client
}

/** Run a SELECT query and return typed rows as objects with column names. */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = getTursoClient()
  const result = await client.execute(sql, params)

  const columns = result.columns
  return result.rows.map((row: Record<string, unknown> | unknown[]) => {
    if (!Array.isArray(row)) {
      return coerceBigInts(row) as T
    }

    const obj: Record<string, unknown> = {}
    columns.forEach((col: string, i: number) => {
      obj[col] = row[i]
    })
    return coerceBigInts(obj) as T
  })
}

/** Run an INSERT/UPDATE/DELETE and return metadata. */
export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<{ lastInsertId: number; rowsAffected: number }> {
  const client = getTursoClient()
  const result = await client.execute(sql, params)
  const rawId = result.lastInsertRowid
  const lastInsertId = typeof rawId === 'bigint' ? Number(rawId) : (rawId ?? 0)
  return {
    lastInsertId,
    rowsAffected: typeof result.rowsAffected === 'bigint' ? Number(result.rowsAffected) : (result.rowsAffected ?? 0),
  }
}

export async function probeTursoConnection(): Promise<boolean> {
  const { configured } = getTursoConfig()
  if (!configured) return false

  try {
    await getTursoClient().execute('SELECT 1')
    return true
  } catch {
    return false
  }
}
