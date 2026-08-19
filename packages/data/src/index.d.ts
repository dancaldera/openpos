import type { ReplicatedTableConfig, ReplicatedDeleteStrategy } from './internal/types'

export type { ReplicatedDeleteStrategy, ReplicatedTableConfig } from './internal/types'

export const schema: Record<string, unknown>
export const users: unknown
export const passwordRecoveryCodes: unknown
export const passwordResetTokens: unknown
export const passwordResetSettings: unknown
export const objectStorageSettings: unknown
export const connectionMeta: unknown
export const databaseSettings: unknown
export const products: unknown
export const customers: unknown
export const companySettings: unknown
export const orders: unknown
export const orderItems: unknown
export const productAttributes: unknown
export const productVariants: unknown
export const productVariantSettings: unknown
export const syncMetadata: unknown
export const syncOutbox: unknown
export const syncState: unknown
export const orderSyncQueue: unknown
export const replicatedTables: ReplicatedTableConfig[]
export const replicatedTablesByName: Record<string, ReplicatedTableConfig>

export interface MigrationResult {
  appliedCount: number
  skippedCount: number
  migrations: Array<{ name: string; file: string }>
}

export const migrationsDir: string
export const migrationsTable: string
export function applyLocalMigrations(client: unknown): MigrationResult
export function applyRemoteMigrations(client: unknown): Promise<MigrationResult>

export const DEMO_USER_EMAILS: string[]
export function generateConnectionKey(): string
export function generateConnectionSeed(): string
export function parseConnectionKey(input: string): string | null
export function parseConnectionSeed(input: string): string | null
export function normalizeConnectionSecret(input: string): string
export function hashConnectionSeed(seed: string): string
export function connectionFileStem(key: string): string
export function hostedDatabaseName(key: string): string
export function seedFreshStore(
  run: (sql: string, params?: unknown[]) => Promise<unknown> | unknown,
  input: {
    storeName: string
    adminName: string
    adminEmail: string
    adminPasswordHash: string
    connectionKey: string
    seedVerifier: string
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
