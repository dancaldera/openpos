export interface StoreSqlClient {
  execute(statement: string | { sql: string; args?: unknown[] }): Promise<{ rows: ArrayLike<unknown>[] | unknown[] }>
}

export interface StoreMigrationResult {
  appliedCount: number
  skippedCount: number
  migrations: Array<{ name: string; file: string }>
}

export const DEMO_USER_EMAILS: string[]
export const migrations: Array<{ name: string; sql: string }>
export const migrationsTable: string
export function applyStoreMigrations(client: StoreSqlClient): Promise<StoreMigrationResult>
export function latestMigrationName(): string | null
export function generateConnectionKey(): string
export function parseConnectionKey(input: string): string | null
export function normalizeConnectionSecret(input: string): string
export function ensureStoreOwner(
  run: (sql: string, params?: unknown[]) => Promise<unknown> | unknown,
  input: {
    storeName: string
    adminName: string
    adminEmail: string
    adminPasswordHash: string
    now?: string
  },
): Promise<void>
export function readConnectionMeta(
  query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>> | Array<Record<string, unknown>>,
): Promise<Record<string, unknown> | null>
export function writeConnectionMeta(
  run: (sql: string, params?: unknown[]) => Promise<unknown> | unknown,
  input: {
    connectionKey: string
    seedVerifier: string
    storeName: string
    now?: string
  },
): Promise<void>
