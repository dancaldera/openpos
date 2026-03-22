import { describe, expect, it } from 'bun:test'
import { normalizeDbStatusSnapshot } from './db-status'

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
      remoteConfigured: true,
      apiConfigured: true,
      apiReachable: true,
      pendingWrites: undefined,
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
      remoteConfigured: true,
      apiConfigured: true,
      apiReachable: false,
      pendingWrites: 3,
      conflictedWrites: 1,
      lastCheckedAt: Date.parse('2026-03-21T11:00:00.000Z'),
      lastSyncedAt: Date.parse('2026-03-21T10:55:00.000Z'),
      lastError: 'Remote sync unavailable',
      apiLastCheckedAt: Date.parse('2026-03-21T10:59:00.000Z'),
      apiLastError: 'connect ECONNREFUSED',
    })
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
    expect(normalized.remoteConfigured).toBe(false)
    expect(normalized.apiConfigured).toBe(false)
    expect(normalized.apiReachable).toBe(false)
    expect(normalized.lastError).toBe('Missing Turso credentials')
  })
})
