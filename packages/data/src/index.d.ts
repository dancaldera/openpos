import type { ReplicatedTableConfig, ReplicatedDeleteStrategy } from './internal/types'

export type { ReplicatedDeleteStrategy, ReplicatedTableConfig } from './internal/types'

export const schema: Record<string, unknown>
export const users: unknown
export const products: unknown
export const customers: unknown
export const companySettings: unknown
export const orders: unknown
export const orderItems: unknown
export const productAttributes: unknown
export const productVariants: unknown
export const productVariantSettings: unknown
export const replicatedTables: ReplicatedTableConfig[]
export const replicatedTablesByName: Record<string, ReplicatedTableConfig>
