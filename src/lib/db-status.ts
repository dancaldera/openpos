import { getApiUrl } from './api-config'
import { type ConnectionStatus, connectionStatus, lastConnectionAttempt, pendingCount } from './db'
import { isTauri } from './platform'

export type DbStatusMode = 'api' | 'sqlite' | 'turso'

export interface DbStatusSnapshot {
  status: ConnectionStatus
  mode: DbStatusMode
  remoteConfigured: boolean
  pendingWrites?: number
  lastCheckedAt?: string
}

function getDesktopMode(status: ConnectionStatus): DbStatusMode {
  return status === 'remote' || status === 'syncing' ? 'turso' : 'sqlite'
}

export function getInitialDbStatusSnapshot(): DbStatusSnapshot {
  if (isTauri) {
    const status = connectionStatus.value
    return {
      status,
      mode: getDesktopMode(status),
      remoteConfigured: false,
      pendingWrites: pendingCount.value,
      lastCheckedAt: lastConnectionAttempt.value > 0 ? new Date(lastConnectionAttempt.value).toISOString() : undefined,
    }
  }

  return {
    status: 'syncing',
    mode: 'api',
    remoteConfigured: false,
  }
}

async function getWebDbStatusSnapshot(): Promise<DbStatusSnapshot> {
  try {
    const response = await fetch(getApiUrl('/api/db-status'))
    if (!response.ok) {
      throw new Error(`db-status request failed with ${response.status}`)
    }

    return (await response.json()) as DbStatusSnapshot
  } catch (error) {
    console.warn('[db-status] Failed to load web DB status:', error)
    return {
      status: 'error',
      mode: 'api',
      remoteConfigured: false,
    }
  }
}

async function getDesktopDbStatusSnapshot(): Promise<DbStatusSnapshot> {
  const { invoke } = await import('@tauri-apps/api/core')

  try {
    const backendSnapshot = await invoke<DbStatusSnapshot>('get_db_status')
    const status = connectionStatus.value

    return {
      status,
      mode: getDesktopMode(status),
      remoteConfigured: backendSnapshot.remoteConfigured,
      pendingWrites: pendingCount.value,
      lastCheckedAt: lastConnectionAttempt.value > 0 ? new Date(lastConnectionAttempt.value).toISOString() : undefined,
    }
  } catch (error) {
    console.warn('[db-status] Failed to load desktop DB status:', error)
    const status = connectionStatus.value

    return {
      status,
      mode: getDesktopMode(status),
      remoteConfigured: false,
      pendingWrites: pendingCount.value,
      lastCheckedAt: lastConnectionAttempt.value > 0 ? new Date(lastConnectionAttempt.value).toISOString() : undefined,
    }
  }
}

export async function getDbStatusSnapshot(): Promise<DbStatusSnapshot> {
  if (isTauri) {
    return getDesktopDbStatusSnapshot()
  }

  return getWebDbStatusSnapshot()
}
