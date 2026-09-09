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
import { getDbStatusSnapshot, normalizeDbStatusSnapshot } from './db-status'

describe('normalizeDbStatusSnapshot', () => {
  it('maps web API snapshots into API reachability state', () => {
    const normalized = normalizeDbStatusSnapshot({
      status: 'remote',
      mode: 'api',
      remoteConfigured: true,
      lastCheckedAt: '2026-03-21T10:00:00.000Z',
    })

    expect(normalized).toEqual({
      status: 'online',
      mode: 'api',
      isSyncing: false,
      remoteConfigured: true,
      apiConfigured: true,
      apiReachable: true,
      pendingWrites: undefined,
      erroredWrites: undefined,
      conflictedWrites: undefined,
      lastCheckedAt: Date.parse('2026-03-21T10:00:00.000Z'),
      lastSyncedAt: null,
      lastError: null,
      apiLastCheckedAt: Date.parse('2026-03-21T10:00:00.000Z'),
      apiLastError: null,
    })
  })

  it('preserves desktop mirror and API health details independently', () => {
    const normalized = normalizeDbStatusSnapshot({
      status: 'offline',
      mode: 'mirror',
      remoteConfigured: true,
      apiConfigured: true,
      apiReachable: false,
      pendingWrites: 3,
      erroredWrites: 2,
      conflictedWrites: 1,
      lastCheckedAt: '2026-03-21T11:00:00.000Z',
      lastSyncedAt: '2026-03-21T10:55:00.000Z',
      lastError: 'Remote sync unavailable',
      apiLastCheckedAt: '2026-03-21T10:59:00.000Z',
      apiLastError: 'connect ECONNREFUSED',
    })

    expect(normalized).toEqual({
      status: 'offline',
      mode: 'mirror',
      isSyncing: false,
      remoteConfigured: true,
      apiConfigured: true,
      apiReachable: false,
      pendingWrites: 3,
      erroredWrites: 2,
      conflictedWrites: 1,
      lastCheckedAt: Date.parse('2026-03-21T11:00:00.000Z'),
      lastSyncedAt: Date.parse('2026-03-21T10:55:00.000Z'),
      lastError: 'Remote sync unavailable',
      apiLastCheckedAt: Date.parse('2026-03-21T10:59:00.000Z'),
      apiLastError: 'connect ECONNREFUSED',
    })
  })

  it('maps legacy local and sqlite values onto offline mirror state', () => {
    const normalized = normalizeDbStatusSnapshot({
      status: 'local',
      mode: 'sqlite',
      isSyncing: true,
      remoteConfigured: false,
    })

    expect(normalized.status).toBe('offline')
    expect(normalized.mode).toBe('mirror')
    expect(normalized.isSyncing).toBe(true)
    expect(normalized.apiConfigured).toBe(false)
    expect(normalized.apiReachable).toBe(false)
    expect(normalized.lastCheckedAt).toBeNull()
    expect(normalized.lastSyncedAt).toBeNull()
    expect(normalized.apiLastCheckedAt).toBeNull()
    expect(normalized.apiLastError).toBeNull()
  })

  it('derives syncing state from the status when isSyncing is omitted', () => {
    const syncing = normalizeDbStatusSnapshot({ status: 'syncing', mode: 'mirror', remoteConfigured: true })
    const online = normalizeDbStatusSnapshot({ status: 'online', mode: 'mirror', remoteConfigured: true })

    expect(syncing.isSyncing).toBe(true)
    expect(online.isSyncing).toBe(false)
  })

  it('falls back to the sync error for api errors in api mode', () => {
    const normalized = normalizeDbStatusSnapshot({
      status: 'error',
      mode: 'api',
      remoteConfigured: true,
      lastCheckedAt: '2026-03-21T10:00:00.000Z',
      lastError: 'connection refused',
    })

    expect(normalized.apiReachable).toBe(false)
    expect(normalized.apiLastCheckedAt).toBe(Date.parse('2026-03-21T10:00:00.000Z'))
    expect(normalized.apiLastError).toBe('connection refused')
  })

  it('keeps api reachable when an api snapshot carries no error', () => {
    const normalized = normalizeDbStatusSnapshot({
      status: 'online',
      mode: 'api',
      remoteConfigured: true,
    })

    expect(normalized.apiConfigured).toBe(true)
    expect(normalized.apiReachable).toBe(true)
    expect(normalized.apiLastError).toBeNull()
  })

  it('leaves api timestamps empty for healthy api snapshots', () => {
    const normalized = normalizeDbStatusSnapshot({
      status: 'online',
      mode: 'api',
      remoteConfigured: true,
    })

    expect(normalized.apiLastCheckedAt).toBeNull()
    expect(normalized.apiLastError).toBeNull()
  })

  it('prefers explicit api timestamps over sync fallbacks', () => {
    const normalized = normalizeDbStatusSnapshot({
      status: 'error',
      mode: 'api',
      remoteConfigured: true,
      lastCheckedAt: '2026-03-21T10:00:00.000Z',
      lastError: 'sync broke',
      apiLastCheckedAt: '2026-03-21T10:01:00.000Z',
      apiLastError: 'api broke',
    })

    expect(normalized.apiLastCheckedAt).toBe(Date.parse('2026-03-21T10:01:00.000Z'))
    expect(normalized.apiLastError).toBe('api broke')
  })

  it('reports no api error for failed mirror snapshots', () => {
    const normalized = normalizeDbStatusSnapshot({
      status: 'error',
      mode: 'mirror',
      remoteConfigured: false,
      lastError: 'mirror broke',
    })

    expect(normalized.apiLastCheckedAt).toBeNull()
    expect(normalized.apiLastError).toBeNull()
  })

  it('leaves the api error empty when an api snapshot has no message', () => {
    const normalized = normalizeDbStatusSnapshot({
      status: 'error',
      mode: 'api',
      remoteConfigured: true,
    })

    expect(normalized.apiLastError).toBeNull()
  })

  it('keeps mirror mode even when remote sync errors', () => {
    const normalized = normalizeDbStatusSnapshot({
      status: 'error',
      mode: 'turso',
      remoteConfigured: false,
      apiConfigured: false,
      apiReachable: false,
      lastError: 'Missing Turso credentials',
    })

    expect(normalized.status).toBe('error')
    expect(normalized.mode).toBe('mirror')
    expect(normalized.isSyncing).toBe(false)
    expect(normalized.remoteConfigured).toBe(false)
    expect(normalized.apiConfigured).toBe(false)
    expect(normalized.apiReachable).toBe(false)
    expect(normalized.lastError).toBe('Missing Turso credentials')
  })
})

describe('getDbStatusSnapshot', () => {
  beforeEach(() => {
    setConnectionState('online', {
      mode: 'api',
      isSyncing: true,
      remoteConfigured: true,
      lastCheckedAt: Date.parse('2026-03-21T10:00:00.000Z'),
      lastSyncedAt: Date.parse('2026-03-21T09:55:00.000Z'),
      pendingWrites: 2,
      erroredWrites: 1,
      conflictedWrites: 0,
      error: 'stale',
    })
    setApiState({
      configured: true,
      reachable: true,
      lastCheckedAt: Date.parse('2026-03-21T09:59:00.000Z'),
      error: 'api wobble',
    })
  })

  it('reflects live signal state', () => {
    const snapshot = getDbStatusSnapshot()

    expect(snapshot).toEqual({
      status: 'online',
      mode: 'api',
      isSyncing: true,
      remoteConfigured: true,
      apiConfigured: true,
      apiReachable: true,
      pendingWrites: 2,
      erroredWrites: 1,
      conflictedWrites: 0,
      lastCheckedAt: '2026-03-21T10:00:00.000Z',
      lastSyncedAt: '2026-03-21T09:55:00.000Z',
      lastError: 'stale',
      apiLastCheckedAt: '2026-03-21T09:59:00.000Z',
      apiLastError: 'api wobble',
    })
  })

  it('omits timestamps when no check has completed', () => {
    lastConnectionAttempt.value = 0
    lastSuccessfulSync.value = 0
    lastApiCheck.value = 0

    const snapshot = getDbStatusSnapshot()

    expect(snapshot.lastCheckedAt).toBeUndefined()
    expect(snapshot.lastSyncedAt).toBeUndefined()
    expect(snapshot.apiLastCheckedAt).toBeUndefined()
  })

  it('reads every exported signal so nothing drifts', () => {
    expect(connectionStatus.value).toBe('online')
    expect(connectionMode.value).toBe('api')
    expect(syncInProgress.value).toBe(true)
    expect(remoteConfigured.value).toBe(true)
    expect(apiConfigured.value).toBe(true)
    expect(apiReachable.value).toBe(true)
    expect(pendingCount.value).toBe(2)
    expect(erroredCount.value).toBe(1)
    expect(conflictedCount.value).toBe(0)
    expect(lastSyncError.value).toBe('stale')
    expect(lastApiError.value).toBe('api wobble')
  })
})
