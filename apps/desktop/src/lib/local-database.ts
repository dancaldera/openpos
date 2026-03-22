import { requireDesktopApi } from './desktop'

export interface LocalDatabaseClient {
  select<T>(sql: string, params?: unknown[]): Promise<T>
  execute(sql: string, params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }>
}

export default class Database implements LocalDatabaseClient {
  async select<T>(sql: string, params: unknown[] = []): Promise<T> {
    return requireDesktopApi().db.query<T>(sql, params) as Promise<T>
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ lastInsertId: number; rowsAffected: number }> {
    return requireDesktopApi().db.execute(sql, params)
  }

  static async load(_path: string): Promise<Database> {
    return new Database()
  }
}
