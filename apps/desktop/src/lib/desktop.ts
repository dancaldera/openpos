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
  status: 'needsConnection' | 'syncingInitialData' | 'initialSyncFailed' | 'readyForSignIn'
  remoteConfigured: boolean
  apiConfigured?: boolean
  apiUrl?: string | null
  activeUserCount: number
  connectionKey?: string | null
  storeName?: string | null
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

export type UpdateFormat = 'appimage' | 'deb' | 'mac-zip' | null

export interface DesktopRuntimeConfigSummary {
  apiUrl: string
  connectionKey?: string
  configPath: string
  configSource: 'userData' | 'fallback' | 'env' | 'bundled'
  userDataConfigPath: string
}

export interface DesktopApi {
  getInfo(): Promise<{
    isDesktop: boolean
    isElectron: boolean
    version: string
    platform: string
    arch: string
    updateFormat: UpdateFormat
  }>
  hashPassword(password: string): Promise<string>
  verifyPassword(password: string, hash: string): Promise<boolean>
  encryptSecret(value: string): Promise<string>
  decryptSecret(value: string): Promise<string>
  printThermalReceipt(receiptData: string): Promise<string>
  getConfig(): Promise<DesktopRuntimeConfigSummary>
  setApiUrl(apiUrl: string): Promise<DesktopFirstRunStatus>
  resetSettings(resetKey: string): Promise<DesktopFirstRunStatus>
  sync: {
    getStatus(): Promise<DesktopSyncStatusSnapshot>
    trigger(): Promise<DesktopSyncStatusSnapshot>
    getConflicts(): Promise<DesktopSyncConflict[]>
    resetLocal(): Promise<DesktopSyncStatusSnapshot>
  }
  connectivity: {
    getStatus(): Promise<DesktopConnectivitySnapshot>
    refresh(): Promise<DesktopConnectivitySnapshot>
  }
  startup: {
    rendererReady(): void
    getStatus(): Promise<DesktopFirstRunStatus>
    initialize(): Promise<DesktopFirstRunStatus>
    retry(): Promise<DesktopFirstRunStatus>
  }
  connection: {
    getActive(): Promise<{ key: string; storeName: string } | null>
    connect(payload: { key: string; apiUrl: string }): Promise<{
      key: string
      storeName: string
      status: DesktopFirstRunStatus
    }>
    leave(): Promise<DesktopFirstRunStatus>
    factoryReset(): Promise<DesktopFirstRunStatus>
  }
  orders: {
    syncAggregate(orderId: string, operation: 'UPSERT' | 'DELETE'): Promise<{ queued: boolean }>
  }
  db: {
    query<T>(sql: string, params?: unknown[]): Promise<T[]>
    execute(sql: string, params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }>
    transaction(statements: DesktopDatabaseStatement[]): Promise<void>
  }
  images: {
    save(payload: { base64: string; mimeType: string }): Promise<{ key: string }>
    resolve(keys: string[]): Promise<Record<string, string>>
    delete(key: string): Promise<void>
  }
  theme: {
    get(): Promise<'dark' | 'light'>
    set(theme: 'system' | 'dark' | 'light'): Promise<void>
    onChange(cb: (theme: 'dark' | 'light') => void): () => void
  }
  navigation: {
    onNavigate(cb: (page: string) => void): () => void
  }
  updates: {
    openReleasePage(url: string): Promise<void>
    relaunch(): Promise<void>
    downloadAppImageUpdate(url: string, version: string, expectedSha256?: string): Promise<{ filePath: string }>
    downloadDebUpdate(url: string, version: string, expectedSha256?: string): Promise<{ filePath: string }>
    installDownloadedAppImage(tempPath: string): Promise<void>
    installDownloadedDeb(tempPath: string): Promise<void>
    restartFromInstalledAppImage(): Promise<void>
    restartFromInstalledDeb(): Promise<void>
    downloadMacZipUpdate(url: string, version: string, expectedSha256?: string): Promise<{ filePath: string }>
    installDownloadedMacZip(tempPath: string): Promise<void>
    restartFromUpdatedMacApp(): Promise<void>
    onStatusChange(listener: (event: DesktopUpdateStatusEvent) => void): () => void
  }
}

type DesktopPlatform = 'darwin' | 'win32' | 'linux' | 'web'

declare global {
  interface Window {
    __OPENPOS_DESKTOP__?: { isElectron?: boolean; platform?: DesktopPlatform }
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
