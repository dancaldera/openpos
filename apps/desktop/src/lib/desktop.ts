export interface DesktopDatabaseStatement {
  sql: string
  params?: unknown[]
}

export interface DesktopSyncStatusSnapshot {
  status: 'online' | 'offline' | 'syncing' | 'error'
  isSyncing: boolean
  mode: 'mirror'
  remoteConfigured: boolean
  pendingWrites: number
  erroredWrites: number
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

export interface DesktopConnectivitySnapshot extends DesktopSyncStatusSnapshot {
  apiConfigured: boolean
  apiReachable: boolean
  apiLastCheckedAt?: string | null
  apiLastError?: string | null
}

export interface DesktopFirstRunStatus {
  status: 'needsRemoteConfig' | 'syncingInitialData' | 'initialSyncFailed' | 'readyForSignIn'
  remoteConfigured: boolean
  activeUserCount: number
  lastError?: string | null
  lastCheckedAt?: string | null
  lastSyncedAt?: string | null
}

export interface DesktopUpdateStatusEvent {
  phase: 'downloading' | 'downloaded' | 'installing' | 'error'
  progress?: number | null
  filePath?: string
  message?: string
}

export interface DesktopApi {
  getInfo(): Promise<{ isDesktop: boolean; isElectron: boolean; version: string; platform: string; arch: string }>
  greet(name: string): Promise<string>
  hashPassword(password: string): Promise<string>
  verifyPassword(password: string, hash: string): Promise<boolean>
  printThermalReceipt(receiptData: string): Promise<string>
  getConfig(): Promise<{ apiUrl: string }>
  sync: {
    getStatus(): Promise<DesktopSyncStatusSnapshot>
    trigger(): Promise<DesktopSyncStatusSnapshot>
    getConflicts(): Promise<DesktopSyncConflict[]>
  }
  connectivity: {
    getStatus(): Promise<DesktopConnectivitySnapshot>
    refresh(): Promise<DesktopConnectivitySnapshot>
  }
  startup: {
    getStatus(): Promise<DesktopFirstRunStatus>
    initialize(): Promise<DesktopFirstRunStatus>
    retry(): Promise<DesktopFirstRunStatus>
  }
  orders: {
    syncAggregate(orderId: string, operation: 'UPSERT' | 'DELETE'): Promise<{ queued: boolean }>
  }
  db: {
    query<T>(sql: string, params?: unknown[]): Promise<T[]>
    execute(sql: string, params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }>
    transaction(statements: DesktopDatabaseStatement[]): Promise<void>
  }
  updates: {
    openReleasePage(url: string): Promise<void>
    relaunch(): Promise<void>
    downloadAppImageUpdate(url: string, version: string): Promise<{ filePath: string }>
    installDownloadedAppImage(tempPath: string): Promise<void>
    restartFromInstalledAppImage(): Promise<void>
    onStatusChange(listener: (event: DesktopUpdateStatusEvent) => void): () => void
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
