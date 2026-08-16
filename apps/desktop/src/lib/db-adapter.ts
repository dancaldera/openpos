import { requestApiJson } from './api-client'
import { requireDesktopApi } from './desktop'
import { isDesktop } from './platform'

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!isDesktop) {
    const data = await requestApiJson<{ rows: T[] }>('/api/query', {
      method: 'POST',
      requireAuth: true,
      body: { sql, params },
    })
    return data.rows as T[]
  }

  return requireDesktopApi().db.query<T>(sql, params)
}

export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<{ lastInsertId: number; rowsAffected: number }> {
  if (!isDesktop) {
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

  return requireDesktopApi().db.execute(sql, params)
}

export async function transaction(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
  if (!isDesktop) {
    for (const { sql, params = [] } of statements) {
      const data = await requestApiJson<{ lastInsertId?: number; rowsAffected?: number }>('/api/execute', {
        method: 'POST',
        requireAuth: true,
        body: { sql, params },
      })
      void data
    }
    return
  }

  await requireDesktopApi().db.transaction(statements)
}
