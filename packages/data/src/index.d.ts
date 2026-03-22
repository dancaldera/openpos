export type ReplicatedDeleteStrategy = 'soft' | 'hard'

export interface ReplicatedTableConfig {
  tableName: string
  primaryKey: string
  columns: string[]
  watermarkColumn: string
  deleteStrategy: ReplicatedDeleteStrategy
  pullOrder: number
}

export interface SyncOutboxRow {
  id: number
  table_name: string
  record_id: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  row_payload: string | null
  local_updated_at: string | null
  base_remote_updated_at: string | null
  status: 'pending' | 'synced' | 'conflict' | 'error'
  attempts: number
  last_error: string | null
  synced_at: string | null
  created_at: string
  updated_at: string
}

export interface SyncStateRow {
  table_name: string
  last_pulled_at: string | null
  last_sync_at: string | null
  updated_at: string
}

export interface SyncConflictResult {
  tableName: string
  recordId: string
  reason: string
  localUpdatedAt: string | null
  remoteUpdatedAt: string | null
}

export const replicatedTables: ReplicatedTableConfig[]
export const replicatedTablesByName: Record<string, ReplicatedTableConfig>
