export type ReplicatedDeleteStrategy = 'soft' | 'hard'

export interface ReplicatedTableConfig {
  tableName: string
  primaryKey: string
  columns: string[]
  watermarkColumn: string
  deleteStrategy: ReplicatedDeleteStrategy
  pullOrder: number
}
