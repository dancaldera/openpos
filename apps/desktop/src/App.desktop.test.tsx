// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopFirstRunStatus } from './lib/desktop'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  initialize: vi.fn(),
  retry: vi.fn(),
  startDbStatusMonitor: vi.fn(),
  stopDbStatusMonitor: vi.fn(),
  updateStart: vi.fn(),
  updateStop: vi.fn(),
  initializeAppSettings: vi.fn(async () => {}),
  initializeAuth: vi.fn(async () => {}),
  resolveWebStore: vi.fn(),
}))

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false }),
}))

vi.mock('./lib/platform', () => ({
  isDesktop: true,
}))

vi.mock('./lib/desktop', () => ({
  getDesktopApi: () => undefined,
  requireDesktopApi: () => ({
    startup: { getStatus: mocks.getStatus, initialize: mocks.initialize, retry: mocks.retry },
  }),
}))

vi.mock('./lib/db-status', () => ({
  startDbStatusMonitor: mocks.startDbStatusMonitor,
  stopDbStatusMonitor: mocks.stopDbStatusMonitor,
}))

vi.mock('./services/connections', () => ({
  resolveWebStore: mocks.resolveWebStore,
}))

vi.mock('./services/update-service', () => ({
  updateService: { start: mocks.updateStart, stop: mocks.updateStop },
}))

vi.mock('./stores/appSettings/appSettingsStore', () => ({
  appSettingsStore: { initialize: mocks.initializeAppSettings },
}))

vi.mock('./stores/auth/authActions', () => ({
  authActions: { initializeAuth: mocks.initializeAuth },
}))

vi.mock('./stores/language/languageActions', () => ({
  languageActions: { initializeLanguage: vi.fn(async () => {}) },
}))

vi.mock('./stores/theme/themeStore', () => ({
  initializeTheme: vi.fn(async () => {}),
}))

vi.mock('./components/Layout', () => ({ default: () => <div data-testid="layout" /> }))
vi.mock('./components/ui/PageLoader', () => ({
  FullPageLoader: () => <div data-testid="loader">loading</div>,
}))
vi.mock('sonner', () => ({ Toaster: () => null }))
vi.mock('./pages/Dashboard', () => ({ default: () => null }))
vi.mock('./pages/Orders', () => ({ default: () => null }))
vi.mock('./pages/Products', () => ({ default: () => null }))
vi.mock('./pages/Customers', () => ({ default: () => null }))
vi.mock('./pages/Members', () => ({ default: () => null }))
vi.mock('./pages/Analytics', () => ({ default: () => null }))
vi.mock('./pages/Settings', () => ({ default: () => null }))
vi.mock('./pages/SignIn', () => ({ default: () => <div data-testid="page-SignIn" /> }))
vi.mock('./pages/ConnectionSetup', () => ({
  default: ({
    status,
    onResolved,
  }: {
    status: DesktopFirstRunStatus | null
    onResolved: (status?: DesktopFirstRunStatus) => Promise<void>
  }) => (
    <div data-testid="page-ConnectionSetup" data-status={status?.status}>
      <button type="button" onClick={() => void onResolved()}>
        resolved-without-status
      </button>
      <button type="button" onClick={() => void onResolved(statusOf('syncingInitialData'))}>
        resolved-syncing
      </button>
    </div>
  ),
}))
vi.mock('./pages/FirstRunSync', () => ({
  default: ({
    status,
    isRetrying,
    onRetry,
  }: {
    status: DesktopFirstRunStatus
    isRetrying: boolean
    onRetry: () => Promise<void>
  }) => (
    <div data-testid="page-FirstRunSync" data-status={status.status} data-retrying={String(isRetrying)}>
      <span data-testid="first-run-error">{status.lastError ?? ''}</span>
      <button type="button" onClick={() => void onRetry()}>
        retry
      </button>
    </div>
  ),
}))

function statusOf(status: DesktopFirstRunStatus['status'], lastError?: string | null): DesktopFirstRunStatus {
  return { status, remoteConfigured: true, activeUserCount: 0, lastError }
}

const { default: App } = await import('./App')

afterEach(() => {
  cleanup()
  for (const mock of Object.values(mocks)) {
    mock.mockReset()
  }
  mocks.initializeAppSettings.mockResolvedValue(undefined)
  mocks.initializeAuth.mockResolvedValue(undefined)
})

describe('App desktop startup', () => {
  it('goes straight to sign-in when the device is ready', async () => {
    mocks.getStatus.mockResolvedValueOnce(statusOf('readyForSignIn'))

    render(<App />)

    expect(await screen.findByTestId('page-SignIn')).toBeTruthy()
    expect(mocks.initializeAppSettings).toHaveBeenNthCalledWith(1)
    expect(mocks.initializeAppSettings).toHaveBeenNthCalledWith(2, true)
    expect(mocks.initializeAuth).toHaveBeenCalledTimes(1)
    expect(mocks.updateStart).toHaveBeenCalledTimes(1)
    expect(mocks.startDbStatusMonitor).toHaveBeenCalledTimes(1)
    expect(mocks.initialize).not.toHaveBeenCalled()
    expect(mocks.resolveWebStore).not.toHaveBeenCalled()
  })

  it('initializes before sign-in when the first sync has not finished', async () => {
    mocks.getStatus.mockResolvedValueOnce(statusOf('syncingInitialData'))
    mocks.initialize.mockResolvedValueOnce(statusOf('readyForSignIn'))

    render(<App />)

    expect(await screen.findByTestId('page-SignIn')).toBeTruthy()
    expect(mocks.initialize).toHaveBeenCalledTimes(1)
  })

  it('shows the first-run sync screen when initialization fails, then retries into sign-in', async () => {
    mocks.getStatus.mockResolvedValueOnce(statusOf('syncingInitialData'))
    mocks.initialize.mockResolvedValueOnce(statusOf('initialSyncFailed', 'offline'))
    let finishRetry!: (status: DesktopFirstRunStatus) => void
    mocks.retry.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRetry = resolve
      }),
    )

    render(<App />)

    const page = await screen.findByTestId('page-FirstRunSync')
    expect(page.dataset.status).toBe('initialSyncFailed')
    expect(screen.getByTestId('first-run-error').textContent).toBe('offline')

    fireEvent.click(screen.getByText('retry'))

    await waitFor(() => expect(screen.getByTestId('page-FirstRunSync').dataset.retrying).toBe('true'))
    expect(screen.getByTestId('page-FirstRunSync').dataset.status).toBe('syncingInitialData')
    expect(screen.getByTestId('first-run-error').textContent).toBe('')

    finishRetry(statusOf('readyForSignIn'))

    expect(await screen.findByTestId('page-SignIn')).toBeTruthy()
    expect(mocks.initializeAuth).toHaveBeenCalledTimes(1)
  })

  it('stays on the first-run screen when a retry fails again', async () => {
    mocks.getStatus.mockResolvedValueOnce(statusOf('initialSyncFailed', 'offline'))
    mocks.initialize.mockResolvedValueOnce(statusOf('initialSyncFailed', 'offline'))
    mocks.retry.mockResolvedValueOnce(statusOf('initialSyncFailed', 'still offline'))

    render(<App />)
    fireEvent.click(await screen.findByText('retry'))

    await waitFor(() => expect(screen.getByTestId('first-run-error').textContent).toBe('still offline'))
    expect(screen.getByTestId('page-FirstRunSync').dataset.retrying).toBe('false')
    expect(mocks.initializeAuth).not.toHaveBeenCalled()
  })

  it.each([
    [new Error('ipc closed'), 'ipc closed'],
    ['kaput', 'kaput'],
  ])('shows the startup error when a retry throws %s', async (failure, message) => {
    mocks.getStatus.mockResolvedValueOnce(statusOf('initialSyncFailed'))
    mocks.initialize.mockResolvedValueOnce(statusOf('initialSyncFailed'))
    mocks.retry.mockRejectedValueOnce(failure)

    render(<App />)
    fireEvent.click(await screen.findByText('retry'))

    expect(await screen.findByText('OpenPOS failed to start')).toBeTruthy()
    expect(screen.getByText(message)).toBeTruthy()
  })

  it('shows connection setup when the device has no store', async () => {
    mocks.getStatus.mockResolvedValueOnce(statusOf('needsConnection'))

    render(<App />)

    const page = await screen.findByTestId('page-ConnectionSetup')
    expect(page.dataset.status).toBe('needsConnection')
    expect(mocks.initialize).not.toHaveBeenCalled()
    expect(mocks.initializeAuth).not.toHaveBeenCalled()
  })

  it('re-reads the startup status after connecting without one', async () => {
    mocks.getStatus.mockResolvedValueOnce(statusOf('needsConnection')).mockResolvedValueOnce(statusOf('readyForSignIn'))

    render(<App />)
    fireEvent.click(await screen.findByText('resolved-without-status'))

    expect(await screen.findByTestId('page-SignIn')).toBeTruthy()
    expect(mocks.getStatus).toHaveBeenCalledTimes(2)
    expect(mocks.initializeAuth).toHaveBeenCalledTimes(1)
  })

  it('moves to the first-run sync screen when connecting returns a syncing status', async () => {
    mocks.getStatus.mockResolvedValueOnce(statusOf('needsConnection'))

    render(<App />)
    fireEvent.click(await screen.findByText('resolved-syncing'))

    expect((await screen.findByTestId('page-FirstRunSync')).dataset.status).toBe('syncingInitialData')
    expect(mocks.getStatus).toHaveBeenCalledTimes(1)
    expect(mocks.initializeAuth).not.toHaveBeenCalled()
  })

  it('ignores the startup status when unmounted while it loads', async () => {
    let release!: (status: DesktopFirstRunStatus) => void
    mocks.getStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )

    const { unmount } = render(<App />)
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled())
    unmount()
    release(statusOf('syncingInitialData'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.initialize).not.toHaveBeenCalled()
    expect(mocks.updateStop).toHaveBeenCalled()
  })

  it('ignores the initialize result when unmounted while it runs', async () => {
    let release!: (status: DesktopFirstRunStatus) => void
    mocks.getStatus.mockResolvedValueOnce(statusOf('syncingInitialData'))
    mocks.initialize.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )

    const { unmount } = render(<App />)
    await waitFor(() => expect(mocks.initialize).toHaveBeenCalled())
    unmount()
    release(statusOf('readyForSignIn'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.initializeAuth).not.toHaveBeenCalled()
  })
})
