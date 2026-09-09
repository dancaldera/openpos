// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../lib/platform', () => ({
  isDesktop: true,
}))

const { DbStatusBadge } = await import('./DbStatusBadge')
const {
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
} = await import('../../lib/db')
const { openFullSizeDialogCount } = await import('../../stores/ui/dialogStore')

function resetSignals() {
  apiConfigured.value = false
  apiReachable.value = false
  conflictedCount.value = 0
  connectionMode.value = 'mirror'
  connectionStatus.value = 'offline'
  erroredCount.value = 0
  lastApiCheck.value = 0
  lastApiError.value = null
  lastConnectionAttempt.value = 0
  lastSuccessfulSync.value = 0
  lastSyncError.value = null
  pendingCount.value = 0
  remoteConfigured.value = false
  openFullSizeDialogCount.value = 0
}

afterEach(() => {
  cleanup()
  resetSignals()
})

function openPopover() {
  fireEvent.click(screen.getAllByRole('button')[0])
}

describe('DbStatusBadge', () => {
  it('toggles the popover with default offline details', () => {
    render(<DbStatusBadge />)
    expect(screen.getByText('Offline')).toBeDefined()

    openPopover()
    expect(screen.getByText('Data Connectivity')).toBeDefined()
    expect(screen.getByText('Not configured')).toBeDefined()
    expect(screen.getByText('Local SQLite mirror')).toBeDefined()
    expect(screen.queryByText('Last check')).toBeNull()

    const backdrop = document.querySelector('.fixed.inset-0.-z-10')
    fireEvent.click(backdrop as Element)
    expect(screen.queryByText('Data Connectivity')).toBeNull()
  })

  it('flags queued and failed writes while offline', () => {
    erroredCount.value = 2
    lastSyncError.value = 'sync down'
    const { unmount } = render(<DbStatusBadge />)
    expect(screen.getByText('Offline · 2 failed')).toBeDefined()
    openPopover()
    expect(screen.getByText('2 retrying')).toBeDefined()
    expect(screen.getByText('sync down')).toBeDefined()
    unmount()
    cleanup()

    resetSignals()
    pendingCount.value = 4
    render(<DbStatusBadge />)
    expect(screen.getByText('Offline · 4 queued')).toBeDefined()
  })

  it('shows conflicts and full sync history when online', () => {
    const now = Date.now()
    connectionStatus.value = 'online'
    conflictedCount.value = 1
    pendingCount.value = 2
    erroredCount.value = 0
    apiConfigured.value = true
    apiReachable.value = true
    remoteConfigured.value = true
    lastConnectionAttempt.value = now - 1000
    lastApiCheck.value = now - 2000
    lastSuccessfulSync.value = now - 3000
    lastSyncError.value = 'stale'
    lastApiError.value = 'api down'
    render(<DbStatusBadge />)

    expect(screen.getByText('Online · 1 conflicts')).toBeDefined()
    openPopover()
    expect(screen.getByText('Reachable')).toBeDefined()
    expect(screen.getByText('Yes')).toBeDefined()
    expect(screen.getByText('Last check')).toBeDefined()
    expect(screen.getByText('API check')).toBeDefined()
    expect(screen.getByText('Last sync')).toBeDefined()
    expect(screen.getByText('2 queued')).toBeDefined()
    expect(screen.getByText('stale')).toBeDefined()
    expect(screen.getByText('api down')).toBeDefined()
  })

  it('hides a duplicated API error', () => {
    connectionStatus.value = 'online'
    lastSyncError.value = 'same'
    lastApiError.value = 'same'
    render(<DbStatusBadge />)
    openPopover()
    expect(screen.getByText('Last error')).toBeDefined()
    expect(screen.queryByText('API error')).toBeNull()
  })

  it('shows the API connection panel in API mode', () => {
    connectionMode.value = 'api'
    apiConfigured.value = true
    apiReachable.value = false
    render(<DbStatusBadge />)
    openPopover()
    expect(screen.getByText('API Connection')).toBeDefined()
    expect(screen.getByText('API server')).toBeDefined()
    expect(screen.getByText('Unavailable')).toBeDefined()
  })

  it('spins while syncing', () => {
    connectionStatus.value = 'syncing'
    render(<DbStatusBadge />)
    expect(screen.getByText('Syncing')).toBeDefined()
    expect(document.querySelector('.animate-spin')).toBeDefined()
    openPopover()
    expect(screen.getAllByText('Syncing')).toHaveLength(2)
  })

  it('reports the error status', () => {
    connectionStatus.value = 'error'
    render(<DbStatusBadge />)
    expect(screen.getByText('Error')).toBeDefined()
  })

  it('closes the popover on outside clicks', () => {
    render(<DbStatusBadge />)
    openPopover()
    expect(screen.getByText('Data Connectivity')).toBeDefined()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('Data Connectivity')).toBeNull()
  })

  it('renders nothing while a full-size dialog is open', () => {
    openFullSizeDialogCount.value = 1
    const { container } = render(<DbStatusBadge />)
    expect(container.innerHTML).toBe('')
  })

  it('ticks relative times while the popover stays open', () => {
    vi.useFakeTimers()
    try {
      render(<DbStatusBadge />)
      openPopover()
      expect(screen.getByText('Data Connectivity')).toBeDefined()
      vi.advanceTimersByTime(5000)
      expect(screen.getByText('Data Connectivity')).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
