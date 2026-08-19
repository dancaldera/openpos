import type { ReplicatedTableConfig, ReplicatedDeleteStrategy } from './internal/types'

export type { ReplicatedDeleteStrategy, ReplicatedTableConfig } from './internal/types'

export const schema: Record<string, unknown>
export const users: unknown
export const passwordRecoveryCodes: unknown
export const passwordResetTokens: unknown
export const passwordResetSettings: unknown
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
