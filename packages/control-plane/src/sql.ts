export type SqlValue = string | number | bigint | boolean | null | Uint8Array | ArrayBuffer

export interface SqlResult {
  columns: string[]
  rows: ArrayLike<unknown>[]
  rowsAffected: number
}

/** The subset of the libsql client used here; any libsql `Client` satisfies it. */
export interface SqlClient {
  execute(statement: string | { sql: string; args?: SqlValue[] }): Promise<SqlResult>
  close?(): void
}

export interface DataPlaneConfig {
  url: string
  authToken?: string
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString()
  }
  return value
}

export async function all<T = Record<string, unknown>>(
  db: SqlClient,
  sql: string,
  args: SqlValue[] = [],
): Promise<T[]> {
  const result = await db.execute({ sql, args })
  return result.rows.map((row) => {
    const out: Record<string, unknown> = {}
    result.columns.forEach((column, index) => {
      out[column] = normalizeValue((row as ArrayLike<unknown>)[index])
    })
    return out as T
  })
}

export async function first<T = Record<string, unknown>>(
  db: SqlClient,
  sql: string,
  args: SqlValue[] = [],
): Promise<T | null> {
  return (await all<T>(db, sql, args))[0] ?? null
}

export async function run(db: SqlClient, sql: string, args: SqlValue[] = []): Promise<number> {
  const result = await db.execute({ sql, args })
  return Number(result.rowsAffected)
}

/** Adapters for the @openpos/data helpers, which take (sql, params) callbacks. */
export function runner(db: SqlClient) {
  return (sql: string, params: unknown[] = []) => run(db, sql, params as SqlValue[])
}

export function querier(db: SqlClient) {
  return (sql: string, params: unknown[] = []) => all(db, sql, params as SqlValue[])
}
