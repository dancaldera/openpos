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

export interface SyncRemoteConfig {
  configured: boolean
  url?: string
  authToken?: string
}

export interface SyncStatusSnapshot {
  status: 'online' | 'offline' | 'syncing' | 'error'
  isSyncing: boolean
  mode: 'mirror'
  remoteConfigured: boolean
  pendingWrites: number
  erroredWrites: number
  conflictedWrites: number
  lastCheckedAt: string | null
  lastSyncedAt: string | null
  lastError: string | null
}

export interface SyncManager {
  captureWrite(database: unknown, sql: string, params?: unknown[]): unknown
  getStatusSnapshot(database?: unknown): SyncStatusSnapshot
  getConflictSummary(database?: unknown): SyncConflictResult[]
  heartbeat(): Promise<SyncStatusSnapshot>
  start(intervalMs?: number): void
  stop(): void
  trackWrite(database: unknown, capturedWrite: unknown, result: { lastInsertRowid?: number } | null): void
  triggerSync(options?: { foreground?: boolean }): Promise<SyncStatusSnapshot>
}

export function createSyncManager(options: {
  getDatabase: () => unknown
  getRemoteConfig: () => SyncRemoteConfig
  onFlushOrderQueue?: (client: unknown) => Promise<void>
  getRemoteClient?: (config: SyncRemoteConfig) => Promise<unknown>
}): SyncManager

export function ensureLocalSyncSchema(database: unknown): void

export const replicatedTables: ReplicatedTableConfig[]
export const replicatedTablesByName: Record<string, ReplicatedTableConfig>
