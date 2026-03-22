import { getApiUrl } from './api-config'
import {
  conflictedCount,
  connectionMode,
  connectionStatus,
  lastConnectionAttempt,
  lastSuccessfulSync,
  lastSyncError,
  pendingCount,
  remoteConfigured,
  setConnectionState,
} from './db'
import { requireDesktopApi } from './desktop'
import { isDesktop } from './platform'

export interface DbStatusSnapshot {
  status: typeof connectionStatus.value | 'remote' | 'local'
  mode: typeof connectionMode.value | 'sqlite' | 'turso'
  remoteConfigured: boolean
  pendingWrites?: number
  conflictedWrites?: number
  lastCheckedAt?: string | null
  lastSyncedAt?: string | null
  lastError?: string | null
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

function applyDbStatusSnapshot(snapshot: DbStatusSnapshot): void {
  setConnectionState(normalizeStatus(snapshot.status), {
    mode: normalizeMode(snapshot.mode),
    remoteConfigured: snapshot.remoteConfigured,
    pendingWrites: snapshot.pendingWrites,
    conflictedWrites: snapshot.conflictedWrites,
    lastCheckedAt: snapshot.lastCheckedAt ? Date.parse(snapshot.lastCheckedAt) : null,
    lastSyncedAt: snapshot.lastSyncedAt ? Date.parse(snapshot.lastSyncedAt) : null,
    error: snapshot.lastError ?? null,
  })
}

async function refreshDesktopDbStatus(): Promise<void> {
  applyDbStatusSnapshot(await requireDesktopApi().sync.getStatus())
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
    pendingWrites: pendingCount.value,
    conflictedWrites: conflictedCount.value,
    lastCheckedAt: getLastCheckedAt(),
    lastSyncedAt: lastSuccessfulSync.value > 0 ? new Date(lastSuccessfulSync.value).toISOString() : undefined,
    lastError: lastSyncError.value,
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
    applyDbStatusSnapshot(await requireDesktopApi().sync.trigger())
    return connectionStatus.value === 'online'
  }

  await refreshWebDbStatus()
  return connectionStatus.value === 'online'
}
