// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact'
import type { ComponentChildren } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

const authState = { isAuthenticated: false, isLoading: false }
const mocks = vi.hoisted(() => ({
  initializeTheme: vi.fn(async () => {}),
  initializeLanguage: vi.fn(async () => {}),
  bindWebAssignedConnection: vi.fn(async () => null),
  startDbStatusMonitor: vi.fn(),
  stopDbStatusMonitor: vi.fn(),
  updateStart: vi.fn(),
  updateStop: vi.fn(),
  initializeAppSettings: vi.fn(async () => {}),
  initializeAuth: vi.fn(async () => {}),
}))

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({ ...authState }),
}))

vi.mock('./lib/db-status', () => ({
  startDbStatusMonitor: mocks.startDbStatusMonitor,
  stopDbStatusMonitor: mocks.stopDbStatusMonitor,
}))

vi.mock('./services/connections', () => ({
  bindWebAssignedConnection: mocks.bindWebAssignedConnection,
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
  languageActions: { initializeLanguage: mocks.initializeLanguage },
}))

vi.mock('./stores/theme/themeStore', () => ({
  initializeTheme: mocks.initializeTheme,
}))

vi.mock('./components/Layout', () => ({
  default: ({
    children,
    currentPage,
    onNavigate,
  }: {
    children?: ComponentChildren
    currentPage: string
    onNavigate: (page: string) => void
  }) => (
    <div data-testid="layout" data-page={currentPage}>
      {['dashboard', 'orders', 'products', 'customers', 'members', 'analytics', 'settings'].map((page) => (
        <button key={page} type="button" onClick={() => onNavigate(page)}>
          {`go-${page}`}
        </button>
      ))}
      <button type="button" onClick={() => onNavigate('mystery')}>
        go-mystery
      </button>
      {children}
    </div>
  ),
}))

vi.mock('./components/ui/PageLoader', () => ({
  FullPageLoader: () => <div data-testid="loader">loading</div>,
}))

vi.mock('sonner', () => ({
  Toaster: () => <div data-testid="toaster" />,
}))

vi.mock('./pages/Dashboard', () => ({
  default: ({ onNavigate }: { onNavigate: (page: string) => void }) => (
    <div data-testid="page-Dashboard">
      <button type="button" onClick={() => onNavigate('orders')}>
        dashboard-go-orders
      </button>
    </div>
  ),
}))

vi.mock('./pages/Orders', () => ({ default: () => <div data-testid="page-Orders" /> }))
vi.mock('./pages/Products', () => ({ default: () => <div data-testid="page-Products" /> }))
vi.mock('./pages/Customers', () => ({ default: () => <div data-testid="page-Customers" /> }))
vi.mock('./pages/Members', () => ({ default: () => <div data-testid="page-Members" /> }))
vi.mock('./pages/Analytics', () => ({ default: () => <div data-testid="page-Analytics" /> }))
vi.mock('./pages/Settings', () => ({ default: () => <div data-testid="page-Settings" /> }))
vi.mock('./pages/SignIn', () => ({ default: () => <div data-testid="page-SignIn" /> }))
vi.mock('./pages/ConnectionSetup', () => ({ default: () => <div data-testid="page-ConnectionSetup" /> }))
vi.mock('./pages/FirstRunSync', () => ({ default: () => <div data-testid="page-FirstRunSync" /> }))

const { default: App } = await import('./App')

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function resetAll() {
  authState.isAuthenticated = false
  authState.isLoading = false
  Object.values(mocks).forEach((mock) => {
    mock.mockClear()
  })
  mocks.bindWebAssignedConnection.mockResolvedValue(null)
  mocks.initializeAppSettings.mockResolvedValue(undefined)
  mocks.initializeAuth.mockResolvedValue(undefined)
  mocks.initializeLanguage.mockResolvedValue(undefined)
  mocks.initializeTheme.mockResolvedValue(undefined)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetAll()
})

describe('App web startup', () => {
  it('shows a loader first, then the sign-in page', async () => {
    render(<App />)

    expect(screen.getByTestId('loader')).toBeTruthy()

    expect(await screen.findByTestId('page-SignIn')).toBeTruthy()
    expect(mocks.initializeTheme).toHaveBeenCalledTimes(1)
    expect(mocks.initializeLanguage).toHaveBeenCalledTimes(1)
    expect(mocks.bindWebAssignedConnection).toHaveBeenCalledTimes(1)
    expect(mocks.startDbStatusMonitor).toHaveBeenCalledTimes(1)
    expect(mocks.initializeAppSettings).toHaveBeenCalledWith(true)
    expect(mocks.initializeAuth).toHaveBeenCalledTimes(1)
  })

  it('keeps the auth loader visible while auth is loading', async () => {
    authState.isLoading = true

    render(<App />)

    expect(screen.getByTestId('loader')).toBeTruthy()

    authState.isLoading = false
  })

  it('continues when binding the assigned connection fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.bindWebAssignedConnection.mockRejectedValueOnce(new Error('no store'))

    render(<App />)

    expect(await screen.findByTestId('page-SignIn')).toBeTruthy()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('shows a startup error when initialization fails', async () => {
    mocks.initializeAppSettings.mockRejectedValueOnce(new Error('settings broken'))

    render(<App />)

    expect(await screen.findByText('OpenPOS failed to start')).toBeTruthy()
    expect(screen.getByText('settings broken')).toBeTruthy()
  })

  it('shows a startup error for non-Error failures', async () => {
    mocks.initializeAppSettings.mockRejectedValueOnce('kaput')

    render(<App />)

    expect(await screen.findByText('OpenPOS failed to start')).toBeTruthy()
    expect(screen.getByText('kaput')).toBeTruthy()
  })

  it('reloads when the startup error retry is clicked', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { reload } })
    mocks.initializeAppSettings.mockRejectedValueOnce(new Error('settings broken'))

    render(<App />)

    fireEvent.click(await screen.findByText('Retry'))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('stops monitors on unmount', async () => {
    const { unmount } = render(<App />)

    expect(await screen.findByTestId('page-SignIn')).toBeTruthy()

    unmount()

    expect(mocks.stopDbStatusMonitor).toHaveBeenCalled()
    expect(mocks.updateStop).toHaveBeenCalled()
  })

  it('ignores late startup results after unmount', async () => {
    let release: ((value: null) => void) | undefined
    mocks.bindWebAssignedConnection.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )

    const { unmount } = render(<App />)
    unmount()
    await waitFor(() => expect(mocks.updateStop).toHaveBeenCalled())
    if (!release) throw new Error('bind was not called')
    release(null)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.initializeAppSettings).not.toHaveBeenCalled()
  })

  it('skips the loading update when unmounting mid-initialization', async () => {
    const pending = deferred<void>()
    mocks.initializeAppSettings.mockReturnValueOnce(pending.promise)

    const { unmount } = render(<App />)
    await waitFor(() => expect(mocks.initializeAppSettings).toHaveBeenCalled())
    unmount()
    await waitFor(() => expect(mocks.updateStop).toHaveBeenCalled())
    pending.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.initializeAuth).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('page-SignIn')).toBeNull()
  })
})

describe('App web navigation', () => {
  it('renders the dashboard shell once authenticated', async () => {
    authState.isAuthenticated = true

    render(<App />)

    expect(await screen.findByTestId('layout')).toBeTruthy()
    expect(screen.getByTestId('page-Dashboard')).toBeTruthy()
  })

  it('navigates between pages and handles unknown pages', async () => {
    authState.isAuthenticated = true

    render(<App />)

    expect(await screen.findByTestId('page-Dashboard')).toBeTruthy()

    for (const page of ['orders', 'products', 'customers', 'members', 'analytics', 'settings']) {
      fireEvent.click(screen.getByText(`go-${page}`))
      expect(screen.getByTestId(`page-${page[0]?.toUpperCase()}${page.slice(1)}`)).toBeTruthy()
    }

    fireEvent.click(screen.getByText('go-mystery'))

    expect(screen.getByText('This page is under construction.')).toBeTruthy()
    expect(screen.getByText('mystery')).toBeTruthy()
  })

  it('navigates from the dashboard action', async () => {
    authState.isAuthenticated = true

    render(<App />)

    expect(await screen.findByTestId('page-Dashboard')).toBeTruthy()

    fireEvent.click(screen.getByText('dashboard-go-orders'))

    expect(screen.getByTestId('page-Orders')).toBeTruthy()
  })

  it('returns to sign-in when authentication is lost', async () => {
    authState.isAuthenticated = true

    const { rerender } = render(<App />)
    expect(await screen.findByTestId('page-Dashboard')).toBeTruthy()

    fireEvent.click(screen.getByText('go-orders'))
    expect(screen.getByTestId('page-Orders')).toBeTruthy()

    authState.isAuthenticated = false
    rerender(<App />)

    expect(await screen.findByTestId('page-SignIn')).toBeTruthy()
  })
})
