import { beforeEach, describe, expect, it } from 'vitest'
import {
  apiConfigured,
  apiReachable,
  conflictedCount,
  connectionMode,
  connectionStatus,
  erroredCount,
  lastApiCheck,
  lastApiError,
  lastConnectionAttempt,
  lastSuccessfulSync,
  lastSyncError,
  pendingCount,
  remoteConfigured,
  setApiState,
  setConnectionState,
  syncInProgress,
} from './db'

function reset() {
  setConnectionState('offline')
  setApiState({ configured: false, reachable: false, lastCheckedAt: 0, error: null })
  lastApiCheck.value = 0
  lastApiError.value = null
  syncInProgress.value = false
  remoteConfigured.value = false
  lastConnectionAttempt.value = 0
  lastSuccessfulSync.value = 0
  lastSyncError.value = null
  lastApiCheck.value = 0
  lastApiError.value = null
  pendingCount.value = 0
  erroredCount.value = 0
  conflictedCount.value = 0
}

describe('setConnectionState', () => {
  beforeEach(reset)

  it('applies a full snapshot', () => {
    setConnectionState('online', {
      mode: 'api',
      isSyncing: true,
      remoteConfigured: true,
      lastCheckedAt: 1000,
      lastSyncedAt: 2000,
      pendingWrites: 3,
      erroredWrites: 1,
      conflictedWrites: 2,
      error: 'boom',
    })

    expect(connectionStatus.value).toBe('online')
    expect(connectionMode.value).toBe('api')
    expect(syncInProgress.value).toBe(true)
    expect(remoteConfigured.value).toBe(true)
    expect(lastConnectionAttempt.value).toBe(1000)
    expect(lastSuccessfulSync.value).toBe(2000)
    expect(pendingCount.value).toBe(3)
    expect(erroredCount.value).toBe(1)
    expect(conflictedCount.value).toBe(2)
    expect(lastSyncError.value).toBe('boom')
  })

  it('keeps previous values when options are omitted', () => {
    setConnectionState('online', { isSyncing: true, remoteConfigured: true, pendingWrites: 5 })

    setConnectionState('syncing', {})

    expect(connectionStatus.value).toBe('syncing')
    expect(syncInProgress.value).toBe(true)
    expect(remoteConfigured.value).toBe(true)
    expect(pendingCount.value).toBe(5)
  })

  it('resets nullable timestamps and errors with null', () => {
    setConnectionState('online', { lastCheckedAt: 1000, lastSyncedAt: 2000, error: 'boom' })

    setConnectionState('error', { lastCheckedAt: null, lastSyncedAt: null, error: null })

    expect(lastConnectionAttempt.value).toBe(0)
    expect(lastSuccessfulSync.value).toBe(0)
    expect(lastSyncError.value).toBeNull()
  })

  it('toggles the syncing flag both ways', () => {
    setConnectionState('syncing', { isSyncing: true })

    expect(syncInProgress.value).toBe(true)

    setConnectionState('online', { isSyncing: false })

    expect(syncInProgress.value).toBe(false)
  })
})

describe('setApiState', () => {
  beforeEach(reset)

  it('applies api health details', () => {
    setApiState({ configured: true, reachable: true, lastCheckedAt: 4000, error: 'tls' })

    expect(apiConfigured.value).toBe(true)
    expect(apiReachable.value).toBe(true)
    expect(lastApiCheck.value).toBe(4000)
    expect(lastApiError.value).toBe('tls')
  })

  it('keeps previous values when options are omitted', () => {
    setApiState({ configured: true, reachable: true })

    setApiState({})

    expect(apiConfigured.value).toBe(true)
    expect(apiReachable.value).toBe(true)
  })

  it('resets nullable api fields with null', () => {
    setApiState({ lastCheckedAt: 4000, error: 'tls' })

    setApiState({ lastCheckedAt: null, error: null })

    expect(lastApiCheck.value).toBe(0)
    expect(lastApiError.value).toBeNull()
  })

  it('toggles configured and reachable independently', () => {
    setApiState({ configured: true })

    expect(apiConfigured.value).toBe(true)
    expect(apiReachable.value).toBe(false)

    setApiState({ configured: false, reachable: false })

    expect(apiConfigured.value).toBe(false)
    expect(apiReachable.value).toBe(false)
  })
})
