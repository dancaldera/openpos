export interface RuntimeConfig {
  tursoDatabaseUrl?: string
  tursoAuthToken?: string
  printerCommand?: string
  printerArgs?: string[]
}

export interface DesktopDatabaseStatement {
  sql: string
  params?: unknown[]
}

export interface DesktopSyncStatusSnapshot {
  status: 'online' | 'offline' | 'syncing' | 'error'
  mode: 'mirror'
  remoteConfigured: boolean
  pendingWrites: number
  conflictedWrites: number
  lastCheckedAt?: string | null
  lastSyncedAt?: string | null
  lastError?: string | null
}

export interface DesktopSyncConflict {
  tableName: string
  recordId: string
  reason: string
  localUpdatedAt?: string | null
  remoteUpdatedAt?: string | null
}

export interface DesktopApi {
  getInfo(): Promise<{ isDesktop: boolean; isElectron: boolean; version: string }>
  greet(name: string): Promise<string>
  hashPassword(password: string): Promise<string>
  verifyPassword(password: string, hash: string): Promise<boolean>
  getRuntimeConfig(): Promise<RuntimeConfig>
  printThermalReceipt(receiptData: string): Promise<string>
  sync: {
    getStatus(): Promise<DesktopSyncStatusSnapshot>
    trigger(): Promise<DesktopSyncStatusSnapshot>
    getConflicts(): Promise<DesktopSyncConflict[]>
  }
  db: {
    query<T>(sql: string, params?: unknown[]): Promise<T[]>
    execute(sql: string, params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }>
    transaction(statements: DesktopDatabaseStatement[]): Promise<void>
  }
}

declare global {
  interface Window {
    __OPENPOS_DESKTOP__?: { isElectron?: boolean }
    openposDesktop?: DesktopApi
  }
}

export function getDesktopApi(): DesktopApi | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.openposDesktop ?? null
}

export function requireDesktopApi(): DesktopApi {
  const api = getDesktopApi()
  if (!api) {
    throw new Error('Desktop API is not available in this runtime')
  }
  return api
}
