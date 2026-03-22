import { requestApiJson } from './api-client'
import { isDesktop } from './platform'

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (isDesktop) {
    throw new Error('query() should not be called from api-adapter in desktop mode')
  }

  const data = await requestApiJson<{ rows: T[] }>('/api/query', {
    method: 'POST',
    requireAuth: true,
    body: { sql, params },
  })

  return data.rows as T[]
}

export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<{ lastInsertId: number; rowsAffected: number }> {
  if (isDesktop) {
    throw new Error('execute() should not be called from api-adapter in desktop mode')
  }

  const data = await requestApiJson<{ lastInsertId?: number; rowsAffected?: number }>('/api/execute', {
    method: 'POST',
    requireAuth: true,
    body: { sql, params },
  })

  return {
    lastInsertId: data.lastInsertId || 0,
    rowsAffected: data.rowsAffected || 0,
  }
}
