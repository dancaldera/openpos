/**
 * Turso client singleton for the API server.
 *
 * Uses @tursodatabase/serverless which works in both Node.js and
 * Vercel/Cloudflare edge environments.
 */

import { connect, type Connection } from '@tursodatabase/serverless'

let _client: Connection | null = null

export function getTursoClient(): Connection {
  if (_client) return _client

  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url || !authToken) {
    throw new Error(
      'Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables. ' +
        'Set these in your Vercel project settings or local .env file.',
    )
  }

  _client = connect({ url, authToken })
  return _client
}

/** Run a SELECT query and return typed rows. */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = getTursoClient()
  const result = await client.execute(sql, params)
  return result.rows as T[]
}

/** Run an INSERT/UPDATE/DELETE and return metadata. */
export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<{ lastInsertId: number; rowsAffected: number }> {
  const client = getTursoClient()
  const result = await client.execute(sql, params)
  return {
    lastInsertId: result.lastInsertRowid ?? 0,
    rowsAffected: result.rowsAffected ?? 0,
  }
}
