/**
 * Request-scoped data-plane client.
 *
 * Callers use query/execute. The active client comes from AsyncLocalStorage
 * (set per request after a connection is resolved), not from process env.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { createClient } from '@libsql/client'

export interface QueryableClient {
  execute(
    sql: string,
    params?: unknown[],
  ): Promise<{
    columns: string[]
    rows: Array<Record<string, unknown> | unknown[]>
    lastInsertRowid?: number | bigint
    rowsAffected?: number | bigint
  }>
}

export interface DataPlaneConfig {
  url: string
  authToken?: string
}

const dataPlaneStore = new AsyncLocalStorage<QueryableClient>()
const clients = new Map<string, QueryableClient>()

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

function clientCacheKey(config: DataPlaneConfig): string {
  return `${config.url}::${config.authToken || ''}`
}

export function createDataPlaneClient(config: DataPlaneConfig): QueryableClient {
  if (!config.url) {
    throw new Error('Store connection required')
  }

  const key = clientCacheKey(config)
  const cached = clients.get(key)
  if (cached) return cached

  const client = createClient({
    url: config.url,
    ...(config.authToken ? { authToken: config.authToken } : {}),
    intMode: 'bigint',
  }) as QueryableClient

  clients.set(key, client)
  return client
}

export function runWithDataPlane<T>(client: QueryableClient, fn: () => T | Promise<T>): Promise<T> {
  return Promise.resolve(dataPlaneStore.run(client, fn))
}

export function getTursoClient(): QueryableClient {
  const fromStore = dataPlaneStore.getStore()
  if (fromStore) return fromStore
  throw new Error('Store connection required')
}

export function mapQueryRows<T>(
  columns: string[],
  rows: Array<Record<string, unknown> | unknown[]>,
): T[] {
  return rows.map((row: Record<string, unknown> | unknown[]) => {
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

export async function queryWithClient<T>(
  client: QueryableClient,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await client.execute(sql, params)
  return mapQueryRows<T>(result.columns, result.rows)
}

export async function executeWithClient(
  client: QueryableClient,
  sql: string,
  params: unknown[] = [],
): Promise<{ lastInsertId: number; rowsAffected: number }> {
  const result = await client.execute(sql, params)
  const rawId = result.lastInsertRowid
  const lastInsertId = typeof rawId === 'bigint' ? Number(rawId) : (rawId ?? 0)
  return {
    lastInsertId,
    rowsAffected: typeof result.rowsAffected === 'bigint' ? Number(result.rowsAffected) : (result.rowsAffected ?? 0),
  }
}

/** Run a SELECT query and return typed rows as objects with column names. */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return queryWithClient<T>(getTursoClient(), sql, params)
}

/** Run an INSERT/UPDATE/DELETE and return metadata. */
export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<{ lastInsertId: number; rowsAffected: number }> {
  return executeWithClient(getTursoClient(), sql, params)
}

export async function probeDataPlane(config: DataPlaneConfig): Promise<boolean> {
  try {
    await createDataPlaneClient(config).execute('SELECT 1')
    return true
  } catch {
    return false
  }
}

export async function probeTursoConnection(): Promise<boolean> {
  const fromStore = dataPlaneStore.getStore()
  if (!fromStore) return false
  try {
    await fromStore.execute('SELECT 1')
    return true
  } catch {
    return false
  }
}

export function resetDataPlaneClientsForTests(): void {
  clients.clear()
}
