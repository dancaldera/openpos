// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const authState: { isAuthenticated: boolean; isLoading: boolean; user: { role: 'admin' | 'manager' | 'user' } | null } =
  {
    isAuthenticated: false,
    isLoading: false,
    user: null,
  }
const STORE = { id: 'store-1', name: 'Harbor', slug: 'harbor' }
const mocks = vi.hoisted(() => ({
  initializeTheme: vi.fn(async () => {}),
  initializeLanguage: vi.fn(async () => {}),
  resolveWebStore: vi.fn(async (): Promise<{ id: string; name: string; slug: string } | null> => STORE),
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
  languageActions: { initializeLanguage: mocks.initializeLanguage },
}))

vi.mock('./stores/theme/themeStore', () => ({
  initializeTheme: mocks.initializeTheme,
  resolvedTheme: { value: 'light' },
}))

vi.mock('./components/shell/AppFrame', () => ({
  AppFrame: ({ children, section }: { children?: ReactNode; section: string }) => (
    <div data-testid="layout" data-section={section}>
      {children}
    </div>
  ),
}))

vi.mock('./components/shell/ToastBridge', () => ({ ToastBridge: () => null }))

vi.mock('./components/shell/FullPageStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./components/shell/FullPageStatus')>()),
  FullPageLoader: () => <div data-testid="loader">loading</div>,
}))

const section =
  (name: string) =>
  ({ params }: { params: string[] }) => <div data-testid={`page-${name}`} data-params={params.join('/')} />

vi.mock('./pages/Dashboard', () => ({ default: () => <div data-testid="page-Dashboard" /> }))
vi.mock('./pages/orders/OrdersSection', () => ({ default: section('Orders') }))
vi.mock('./pages/products/ProductsSection', () => ({ default: section('Products') }))
vi.mock('./pages/customers/CustomersSection', () => ({ default: section('Customers') }))
vi.mock('./pages/members/MembersSection', () => ({ default: section('Members') }))
vi.mock('./pages/Analytics', () => ({ default: () => <div data-testid="page-Analytics" /> }))
vi.mock('./pages/Settings', () => ({ default: () => <div data-testid="page-Settings" /> }))
vi.mock('./pages/NotFoundPage', () => ({ default: () => <div data-testid="page-NotFound" /> }))
vi.mock('./pages/SignIn', () => ({ default: () => <div data-testid="page-SignIn" /> }))
vi.mock('./pages/ConnectionSetup', () => ({
  default: ({ status, onResolved }: { status: unknown; onResolved: () => Promise<void> }) => (
    <div data-testid="page-ConnectionSetup" data-status={JSON.stringify(status)}>
      <button type="button" onClick={() => void onResolved()}>
        connection-resolved
      </button>
    </div>
  ),
}))
vi.mock('./pages/FirstRunSync', () => ({ default: () => <div data-testid="page-FirstRunSync" /> }))

const { default: App } = await import('./App')
const { currentPath, navigate } = await import('./lib/router')

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
  authState.user = null
  navigate('dashboard', { replace: true })
  Object.values(mocks).forEach((mock) => {
    mock.mockClear()
  })
  mocks.resolveWebStore.mockResolvedValue(STORE)
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
    expect(mocks.resolveWebStore).toHaveBeenCalledTimes(1)
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

  it('asks for a connection key when no store resolves, then signs in once connected', async () => {
    mocks.resolveWebStore.mockResolvedValueOnce(null)

    render(<App />)

    expect(await screen.findByTestId('page-ConnectionSetup')).toBeTruthy()
    expect(screen.getByTestId('page-ConnectionSetup').dataset.status).toBe('null')
    expect(mocks.startDbStatusMonitor).toHaveBeenCalledTimes(1)
    expect(mocks.initializeAppSettings).not.toHaveBeenCalled()
    expect(mocks.initializeAuth).not.toHaveBeenCalled()
    expect(mocks.updateStart).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('connection-resolved'))

    expect(await screen.findByTestId('page-SignIn')).toBeTruthy()
    expect(mocks.initializeAppSettings).toHaveBeenCalledWith(true)
    expect(mocks.initializeAuth).toHaveBeenCalledTimes(1)
  })

  it('shows a startup error when resolving the store fails', async () => {
    mocks.resolveWebStore.mockRejectedValueOnce(new Error('Server error'))

    render(<App />)

    expect(await screen.findByText('OpenPOS failed to start')).toBeTruthy()
    expect(screen.getByText('Server error')).toBeTruthy()
    expect(mocks.initializeAuth).not.toHaveBeenCalled()
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
    let release: ((value: typeof STORE | null) => void) | undefined
    mocks.resolveWebStore.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )

    const { unmount } = render(<App />)
    unmount()
    await waitFor(() => expect(mocks.updateStop).toHaveBeenCalled())
    if (!release) throw new Error('resolveWebStore was not called')
    release(STORE)
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
  it('renders the dashboard inside the shell once authenticated', async () => {
    authState.isAuthenticated = true

    render(<App />)

    expect(await screen.findByTestId('layout')).toBeTruthy()
    expect(screen.getByTestId('layout').dataset.section).toBe('dashboard')
    expect(screen.getByTestId('page-Dashboard')).toBeTruthy()
  })

  it('routes each section and passes nested params as pages', async () => {
    authState.isAuthenticated = true
    authState.user = { role: 'admin' }

    render(<App />)
    expect(await screen.findByTestId('page-Dashboard')).toBeTruthy()

    act(() => navigate('orders/new'))
    expect(screen.getByTestId('page-Orders').dataset.params).toBe('new')
    act(() => navigate('orders/abc/edit'))
    expect(screen.getByTestId('page-Orders').dataset.params).toBe('abc/edit')
    act(() => navigate('products/p1'))
    expect(screen.getByTestId('page-Products').dataset.params).toBe('p1')
    act(() => navigate('customers'))
    expect(screen.getByTestId('page-Customers').dataset.params).toBe('')
    act(() => navigate('members/new'))
    expect(screen.getByTestId('page-Members')).toBeTruthy()
    act(() => navigate('analytics'))
    expect(screen.getByTestId('page-Analytics')).toBeTruthy()
    act(() => navigate('settings'))
    expect(screen.getByTestId('page-Settings')).toBeTruthy()
    act(() => navigate('mystery'))
    expect(screen.getByTestId('page-NotFound')).toBeTruthy()
  })

  it('hides manager and admin sections from other roles', async () => {
    authState.isAuthenticated = true
    authState.user = { role: 'user' }

    render(<App />)
    expect(await screen.findByTestId('page-Dashboard')).toBeTruthy()

    act(() => navigate('members'))
    expect(screen.getByTestId('page-NotFound')).toBeTruthy()

    authState.user = { role: 'manager' }
    act(() => navigate('analytics'))
    expect(screen.getByTestId('page-NotFound')).toBeTruthy()
    act(() => navigate('members'))
    expect(screen.getByTestId('page-Members')).toBeTruthy()
  })

  it('keeps a deep link while auth initializes', async () => {
    navigate('orders/abc', { replace: true })
    authState.isAuthenticated = true

    render(<App />)

    expect((await screen.findByTestId('page-Orders')).dataset.params).toBe('abc')
  })

  it('returns to sign-in and resets the route when authentication is lost', async () => {
    authState.isAuthenticated = true

    const { rerender } = render(<App />)
    expect(await screen.findByTestId('page-Dashboard')).toBeTruthy()

    act(() => navigate('orders'))
    expect(screen.getByTestId('page-Orders')).toBeTruthy()

    authState.isAuthenticated = false
    rerender(<App />)

    expect(await screen.findByTestId('page-SignIn')).toBeTruthy()
    expect(currentPath.value).toBe('dashboard')
  })
})
