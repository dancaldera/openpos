import { requireDesktopApi } from './desktop'
import { isDesktop } from './platform'

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!isDesktop) {
    const { query: apiQuery } = await import('./api-adapter')
    return apiQuery<T>(sql, params)
  }

  return requireDesktopApi().db.query<T>(sql, params)
}

export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<{ lastInsertId: number; rowsAffected: number }> {
  if (!isDesktop) {
    const { execute: apiExecute } = await import('./api-adapter')
    return apiExecute(sql, params)
  }

  return requireDesktopApi().db.execute(sql, params)
}

export async function transaction(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
  if (!isDesktop) {
    const { execute: apiExecute } = await import('./api-adapter')
    for (const { sql, params = [] } of statements) {
      await apiExecute(sql, params)
    }
    return
  }

  await requireDesktopApi().db.transaction(statements)
}
