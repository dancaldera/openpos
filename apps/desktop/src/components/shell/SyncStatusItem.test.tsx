// @vitest-environment happy-dom

import { SideNav, SideNavSection } from '@astryxdesign/core/SideNav'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ platform: { isDesktop: true } }))

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))
vi.mock('../../lib/platform', () => ({
  get isDesktop() {
    return mocks.platform.isDesktop
  },
}))

const { SyncStatusItem, getSyncStatusViewModel } = await import('./SyncStatusItem')
const db = await import('../../lib/db')

const t = (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key)

const base = {
  status: 'offline' as const,
  mode: 'mirror' as const,
  pending: 0,
  errors: 0,
  conflicts: 0,
  apiConfigured: false,
  apiReachable: false,
  remoteConfigured: false,
  lastCheckedAt: 0,
  lastApiCheckedAt: 0,
  lastSyncedAt: 0,
  lastError: null,
  lastApiError: null,
}

function resetSignals() {
  db.apiConfigured.value = false
  db.apiReachable.value = false
  db.conflictedCount.value = 0
  db.connectionMode.value = 'mirror'
  db.connectionStatus.value = 'offline'
  db.erroredCount.value = 0
  db.lastApiCheck.value = 0
  db.lastApiError.value = null
  db.lastConnectionAttempt.value = 0
  db.lastSuccessfulSync.value = 0
  db.lastSyncError.value = null
  db.pendingCount.value = 0
  db.remoteConfigured.value = false
}

function renderItem() {
  return render(
    <SideNav aria-label="nav">
      <SideNavSection title="footer" isHeaderHidden>
        <SyncStatusItem />
      </SideNavSection>
    </SideNav>,
  )
}

afterEach(() => {
  cleanup()
  resetSignals()
  mocks.platform.isDesktop = true
})

describe('getSyncStatusViewModel', () => {
  it('describes the default offline mirror state', () => {
    const vm = getSyncStatusViewModel(base, t)
    expect(vm.label).toBe('sync.status.offline')
    expect(vm.dotVariant).toBe('neutral')
    expect(vm.title).toBe('sync.mirrorTitle')
    expect(vm.modeLabel).toBe('sync.mode.mirror')
    expect(vm.apiStatus).toBe('sync.api.notConfigured')
    expect(vm.remoteLabel).toBe('common.no')
    expect(vm.pendingLabel).toBe('sync.none')
    expect(vm.lastSyncedAt).toBeNull()
  })

  it('flags failed and queued writes while offline', () => {
    expect(getSyncStatusViewModel({ ...base, errors: 2 }, t).label).toBe('sync.offlineFailed {"count":2}')
    expect(getSyncStatusViewModel({ ...base, errors: 2 }, t).dotVariant).toBe('warning')
    expect(getSyncStatusViewModel({ ...base, pending: 4 }, t).label).toBe('sync.offlineQueued {"count":4}')
  })

  it('shows conflicts, API state, and hides a duplicated API error', () => {
    const vm = getSyncStatusViewModel(
      {
        ...base,
        status: 'online',
        mode: 'api',
        conflicts: 1,
        apiConfigured: true,
        apiReachable: true,
        remoteConfigured: true,
        lastError: 'down',
        lastApiError: 'down',
        lastSyncedAt: 1000,
      },
      t,
    )
    expect(vm.label).toBe('sync.withConflicts {"status":"sync.status.online","count":1}')
    expect(vm.dotVariant).toBe('warning')
    expect(vm.title).toBe('sync.apiTitle')
    expect(vm.apiStatus).toBe('sync.api.reachable')
    expect(vm.conflictsLabel).toBe('sync.needReview {"count":1}')
    expect(vm.apiError).toBeNull()
    expect(vm.lastSyncedAt).toBe(1000)
  })

  it('pulses while syncing and reports errors', () => {
    expect(getSyncStatusViewModel({ ...base, status: 'syncing' }, t).isPulsing).toBe(true)
    const error = getSyncStatusViewModel({ ...base, status: 'error', errors: 1, apiConfigured: true }, t)
    expect(error.dotVariant).toBe('error')
    expect(error.apiStatus).toBe('sync.api.unavailable')
    expect(error.errorsLabel).toBe('sync.retrying {"count":1}')
  })
})

describe('SyncStatusItem', () => {
  it('renders nothing on the web', () => {
    mocks.platform.isDesktop = false
    renderItem()
    expect(screen.queryByText('sync.status.offline')).toBeNull()
  })

  it('shows the status with a dot and opens details from its menu', () => {
    const now = Date.now()
    db.connectionStatus.value = 'online'
    db.pendingCount.value = 2
    db.lastSuccessfulSync.value = now - 3000
    db.lastConnectionAttempt.value = now - 1000
    db.lastApiCheck.value = now - 2000
    db.lastSyncError.value = 'stale'
    db.lastApiError.value = 'api down'
    renderItem()

    expect(screen.getAllByText('sync.status.online').length).toBeGreaterThan(0)
    expect(document.querySelector('.astryx-status-dot[aria-label="sync.status.online"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'sync.details' }))

    expect(screen.getByText('sync.mirrorTitle')).toBeTruthy()
    expect(screen.getByText('sync.lastSync')).toBeTruthy()
    expect(screen.getByText('sync.lastCheck')).toBeTruthy()
    expect(screen.getByText('sync.apiCheck')).toBeTruthy()
    expect(screen.getByText('sync.queued {"count":2}')).toBeTruthy()
    expect(screen.getByText('stale')).toBeTruthy()
    expect(screen.getByText('api down')).toBeTruthy()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
