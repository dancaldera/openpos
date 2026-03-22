import { getApiUrl } from './api-config'
import {
  apiConfigured,
  apiReachable,
  conflictedCount,
  connectionMode,
  connectionStatus,
  lastApiCheck,
  lastApiError,
  lastConnectionAttempt,
  lastSuccessfulSync,
  lastSyncError,
  pendingCount,
  remoteConfigured,
  setApiState,
  setConnectionState,
} from './db'
import { requireDesktopApi } from './desktop'
import { isDesktop } from './platform'

export interface DbStatusSnapshot {
  status: typeof connectionStatus.value | 'remote' | 'local'
  mode: typeof connectionMode.value | 'sqlite' | 'turso'
  remoteConfigured: boolean
  apiConfigured?: boolean
  apiReachable?: boolean
  pendingWrites?: number
  conflictedWrites?: number
  lastCheckedAt?: string | null
  lastSyncedAt?: string | null
  lastError?: string | null
  apiLastCheckedAt?: string | null
  apiLastError?: string | null
}

export interface NormalizedDbStatusSnapshot {
  status: typeof connectionStatus.value
  mode: typeof connectionMode.value
  remoteConfigured: boolean
  apiConfigured: boolean
  apiReachable: boolean
  pendingWrites?: number
  conflictedWrites?: number
  lastCheckedAt: number | null
  lastSyncedAt: number | null
  lastError: string | null
  apiLastCheckedAt: number | null
  apiLastError: string | null
}

let webStatusTimer: ReturnType<typeof setInterval> | null = null
let webStatusRequest: Promise<void> | null = null
let desktopStatusTimer: ReturnType<typeof setInterval> | null = null

function getLastCheckedAt(): string | undefined {
  return lastConnectionAttempt.value > 0 ? new Date(lastConnectionAttempt.value).toISOString() : undefined
}

function normalizeStatus(status: DbStatusSnapshot['status']): typeof connectionStatus.value {
  if (status === 'remote') return 'online'
  if (status === 'local') return 'offline'
  return status
}

function normalizeMode(mode: DbStatusSnapshot['mode']): typeof connectionMode.value {
  if (mode === 'api') return 'api'
  return 'mirror'
}

export function normalizeDbStatusSnapshot(snapshot: DbStatusSnapshot): NormalizedDbStatusSnapshot {
  const status = normalizeStatus(snapshot.status)
  const mode = normalizeMode(snapshot.mode)
  const lastCheckedAt = snapshot.lastCheckedAt ? Date.parse(snapshot.lastCheckedAt) : null
  const lastSyncedAt = snapshot.lastSyncedAt ? Date.parse(snapshot.lastSyncedAt) : null
  const apiLastCheckedAt = snapshot.apiLastCheckedAt ? Date.parse(snapshot.apiLastCheckedAt) : null

  return {
    status,
    mode,
    remoteConfigured: snapshot.remoteConfigured,
    apiConfigured: snapshot.apiConfigured ?? mode === 'api',
    apiReachable: snapshot.apiReachable ?? (mode === 'api' ? status !== 'error' : false),
    pendingWrites: snapshot.pendingWrites,
    conflictedWrites: snapshot.conflictedWrites,
    lastCheckedAt,
    lastSyncedAt,
    lastError: snapshot.lastError ?? null,
    apiLastCheckedAt: apiLastCheckedAt ?? (mode === 'api' ? lastCheckedAt : null),
    apiLastError: snapshot.apiLastError ?? (mode === 'api' && status === 'error' ? (snapshot.lastError ?? null) : null),
  }
}

function applyDbStatusSnapshot(snapshot: DbStatusSnapshot): void {
  const normalized = normalizeDbStatusSnapshot(snapshot)

  setConnectionState(normalized.status, {
    mode: normalized.mode,
    remoteConfigured: normalized.remoteConfigured,
    pendingWrites: normalized.pendingWrites,
    conflictedWrites: normalized.conflictedWrites,
    lastCheckedAt: normalized.lastCheckedAt,
    lastSyncedAt: normalized.lastSyncedAt,
    error: normalized.lastError,
  })

  setApiState({
    configured: normalized.apiConfigured,
    reachable: normalized.apiReachable,
    lastCheckedAt: normalized.apiLastCheckedAt,
    error: normalized.apiLastError,
  })
}

async function refreshDesktopDbStatus(): Promise<void> {
  applyDbStatusSnapshot(await requireDesktopApi().connectivity.getStatus())
}

async function refreshWebDbStatus(): Promise<void> {
  if (webStatusRequest) {
    return webStatusRequest
  }

  webStatusRequest = (async () => {
    try {
      const response = await fetch(getApiUrl('/api/db-status'))
      if (!response.ok) {
        throw new Error(`db-status request failed with ${response.status}`)
      }

      applyDbStatusSnapshot((await response.json()) as DbStatusSnapshot)
    } catch (error) {
      console.warn('[db-status] Failed to load web DB status:', error)
      setConnectionState('error', {
        mode: 'api',
        remoteConfigured: false,
        lastCheckedAt: null,
        error: error instanceof Error ? error.message : String(error),
      })
      setApiState({
        configured: true,
        reachable: false,
        lastCheckedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      webStatusRequest = null
    }
  })()

  return webStatusRequest
}

export function getDbStatusSnapshot(): DbStatusSnapshot {
  return {
    status: connectionStatus.value,
    mode: connectionMode.value,
    remoteConfigured: remoteConfigured.value,
    apiConfigured: apiConfigured.value,
    apiReachable: apiReachable.value,
    pendingWrites: pendingCount.value,
    conflictedWrites: conflictedCount.value,
    lastCheckedAt: getLastCheckedAt(),
    lastSyncedAt: lastSuccessfulSync.value > 0 ? new Date(lastSuccessfulSync.value).toISOString() : undefined,
    lastError: lastSyncError.value,
    apiLastCheckedAt: lastApiCheck.value > 0 ? new Date(lastApiCheck.value).toISOString() : undefined,
    apiLastError: lastApiError.value,
  }
}

export function startDbStatusMonitor(intervalMs = 30_000): void {
  if (isDesktop) {
    void refreshDesktopDbStatus()

    if (desktopStatusTimer !== null) return

    desktopStatusTimer = setInterval(() => {
      void refreshDesktopDbStatus()
    }, intervalMs)
    return
  }

  void refreshWebDbStatus()

  if (webStatusTimer !== null) return

  webStatusTimer = setInterval(() => {
    void refreshWebDbStatus()
  }, intervalMs)
}

export function stopDbStatusMonitor(): void {
  if (isDesktop) {
    if (desktopStatusTimer !== null) {
      clearInterval(desktopStatusTimer)
      desktopStatusTimer = null
    }
    return
  }

  if (webStatusTimer !== null) {
    clearInterval(webStatusTimer)
    webStatusTimer = null
  }
}

export async function refreshConnectionStatus(): Promise<boolean> {
  if (isDesktop) {
    applyDbStatusSnapshot(await requireDesktopApi().connectivity.refresh())
    return connectionStatus.value === 'online'
  }

  await refreshWebDbStatus()
  return connectionStatus.value === 'online'
}
