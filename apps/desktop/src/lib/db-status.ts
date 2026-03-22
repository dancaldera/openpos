import { getApiUrl } from './api-config'
import {
  connectionMode,
  connectionStatus,
  lastConnectionAttempt,
  pendingCount,
  remoteConfigured,
  setConnectionState,
} from './db'
import { reconnectToTurso, startHealthCheck, stopHealthCheck } from './db-adapter'
import { isDesktop } from './platform'

export interface DbStatusSnapshot {
  status: typeof connectionStatus.value
  mode: typeof connectionMode.value
  remoteConfigured: boolean
  pendingWrites?: number
  lastCheckedAt?: string
}

let webStatusTimer: ReturnType<typeof setInterval> | null = null
let webStatusRequest: Promise<void> | null = null

function getLastCheckedAt(): string | undefined {
  return lastConnectionAttempt.value > 0 ? new Date(lastConnectionAttempt.value).toISOString() : undefined
}

function applyDbStatusSnapshot(snapshot: DbStatusSnapshot): void {
  setConnectionState(snapshot.status, {
    mode: snapshot.mode,
    remoteConfigured: snapshot.remoteConfigured,
    pendingWrites: snapshot.pendingWrites,
    lastCheckedAt: snapshot.lastCheckedAt ? Date.parse(snapshot.lastCheckedAt) : null,
  })
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
    lastCheckedAt: getLastCheckedAt(),
  }
}

export function startDbStatusMonitor(intervalMs = 30_000): void {
  if (isDesktop) {
    startHealthCheck(intervalMs)
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
    stopHealthCheck()
    return
  }

  if (webStatusTimer !== null) {
    clearInterval(webStatusTimer)
    webStatusTimer = null
  }
}

export async function refreshConnectionStatus(): Promise<boolean> {
  if (isDesktop) {
    return reconnectToTurso()
  }

  await refreshWebDbStatus()
  return connectionStatus.value === 'remote'
}
