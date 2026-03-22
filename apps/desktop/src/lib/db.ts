import { signal } from '@preact/signals'
import { isDesktop } from './platform'

export type ConnectionStatus = 'online' | 'offline' | 'syncing' | 'error'
export type DbStatusMode = 'api' | 'mirror'

export const connectionStatus = signal<ConnectionStatus>(isDesktop ? 'offline' : 'syncing')
export const connectionMode = signal<DbStatusMode>(isDesktop ? 'mirror' : 'api')
export const remoteConfigured = signal<boolean>(false)
export const lastConnectionAttempt = signal<number>(0)
export const lastSuccessfulSync = signal<number>(0)
export const lastSyncError = signal<string | null>(null)
export const pendingCount = signal<number>(0)
export const conflictedCount = signal<number>(0)

interface SetConnectionStateOptions {
  mode?: DbStatusMode
  remoteConfigured?: boolean
  lastCheckedAt?: number | null
  lastSyncedAt?: number | null
  pendingWrites?: number
  conflictedWrites?: number
  error?: string | null
}

function resolveConnectionMode(override?: DbStatusMode): DbStatusMode {
  if (override) return override
  return isDesktop ? 'mirror' : 'api'
}

export function setConnectionState(status: ConnectionStatus, options: SetConnectionStateOptions = {}): void {
  connectionStatus.value = status
  connectionMode.value = resolveConnectionMode(options.mode)

  if (typeof options.remoteConfigured === 'boolean') {
    remoteConfigured.value = options.remoteConfigured
  }

  if (typeof options.pendingWrites === 'number') {
    pendingCount.value = options.pendingWrites
  }

  if (typeof options.conflictedWrites === 'number') {
    conflictedCount.value = options.conflictedWrites
  }

  if (options.lastCheckedAt !== undefined) {
    lastConnectionAttempt.value = options.lastCheckedAt ?? 0
  }

  if (options.lastSyncedAt !== undefined) {
    lastSuccessfulSync.value = options.lastSyncedAt ?? 0
  }

  if (options.error !== undefined) {
    lastSyncError.value = options.error ?? null
  }
}
