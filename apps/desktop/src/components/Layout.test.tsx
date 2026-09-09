// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'

const { authState, desktopApi } = vi.hoisted(() => ({
  authState: {
    user: { name: 'Ada Admin', email: 'ada@example.com', role: 'admin' } as {
      name: string
      email: string
      role: string
    } | null,
    signOut: vi.fn(),
  },
  desktopApi: {
    value: undefined as undefined | { navigation: { onNavigate: (cb: (page: string) => void) => () => void } },
    navCallback: null as null | ((page: string) => void),
    navCleanup: vi.fn(),
  },
}))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: authState.user, signOut: authState.signOut }),
}))

vi.mock('../hooks/usePlatform', () => ({
  usePlatform: () => ({ isMac: false, isWindows: false, isLinux: true, isDesktop: true }),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: true,
}))

vi.mock('../lib/desktop', () => ({
  getDesktopApi: () => desktopApi.value,
}))

const Layout = (await import('./Layout')).default
const { setSidebarCollapsed } = await import('../stores/ui/sidebarStore')

const adminUser = { name: 'Ada Admin', email: 'ada@example.com', role: 'admin' }
const managerUser = { name: 'Moe Manager', email: 'moe@example.com', role: 'manager' }
const cashierUser = { name: 'Cat Cashier', email: 'cat@example.com', role: 'cashier' }

afterEach(() => {
  cleanup()
  authState.user = adminUser
  authState.signOut.mockClear()
  desktopApi.value = undefined
  desktopApi.navCallback = null
  desktopApi.navCleanup.mockClear()
  localStorage.clear()
  setSidebarCollapsed(false)
})

describe('Layout', () => {
  it('navigates through the sidebar and renders children', () => {
    const onNavigate = vi.fn()
    render(
      <Layout currentPage="dashboard" onNavigate={onNavigate}>
        <p>Child content</p>
      </Layout>,
    )

    expect(screen.getByText('Child content')).toBeDefined()
    // The active item label also heads the page header.
    expect(screen.getAllByText('navigation.dashboard')).toHaveLength(2)
    expect(screen.getByText('navigation.analytics')).toBeDefined()
    expect(screen.getByText('Ada Admin')).toBeDefined()

    const products = screen.getAllByText('navigation.products')
    fireEvent.click(products[products.length - 1])
    expect(onNavigate).toHaveBeenCalledWith('products')
  })

  it('filters role-restricted menu items', () => {
    authState.user = managerUser
    const { unmount } = render(
      <Layout currentPage="dashboard" onNavigate={() => {}}>
        <p>Child</p>
      </Layout>,
    )
    expect(screen.queryByText('navigation.members')).toBeDefined()
    expect(screen.queryByText('navigation.analytics')).toBeNull()
    unmount()
    cleanup()

    authState.user = cashierUser
    render(
      <Layout currentPage="dashboard" onNavigate={() => {}}>
        <p>Child</p>
      </Layout>,
    )
    expect(screen.queryByText('navigation.members')).toBeNull()
    expect(screen.queryByText('navigation.analytics')).toBeNull()
  })

  it('falls back for signed-out users and unknown pages', () => {
    authState.user = null
    render(
      <Layout currentPage="nope" onNavigate={() => {}}>
        <p>Child</p>
      </Layout>,
    )
    expect(screen.getByText('User')).toBeDefined()
    expect(screen.queryByText('navigation.members')).toBeNull()
  })

  it('opens the mobile drawer and toggles the sidebar', () => {
    const { container } = render(
      <Layout currentPage="dashboard" onNavigate={() => {}}>
        <p>Child</p>
      </Layout>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByRole('dialog')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'navigation.toggleSidebar' }))
    expect(localStorage.getItem('sidebar_collapsed')).toBe('1')
    expect(container.innerHTML).toContain('w-[4.5rem]')

    // Keyboard shortcut toggles back
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(localStorage.getItem('sidebar_collapsed')).toBe('0')
    fireEvent.keyDown(window, { key: 'b' })
    expect(localStorage.getItem('sidebar_collapsed')).toBe('0')
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true })
    expect(localStorage.getItem('sidebar_collapsed')).toBe('0')
  })

  it('forwards desktop navigation events and cleans up', () => {
    desktopApi.value = {
      navigation: {
        onNavigate: (cb: (page: string) => void) => {
          desktopApi.navCallback = cb
          return desktopApi.navCleanup
        },
      },
    }
    const onNavigate = vi.fn()
    const { unmount } = render(
      <Layout currentPage="dashboard" onNavigate={onNavigate}>
        <p>Child</p>
      </Layout>,
    )

    desktopApi.navCallback?.('orders')
    expect(onNavigate).toHaveBeenCalledWith('orders')
    unmount()
    expect(desktopApi.navCleanup).toHaveBeenCalled()
  })

  it('confirms sign-out through the dialog', () => {
    render(
      <Layout currentPage="dashboard" onNavigate={() => {}}>
        <p>Child</p>
      </Layout>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'navigation.signOut' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'navigation.signOut' })[1])
    expect(authState.signOut).toHaveBeenCalledTimes(1)
  })

  it('cancels sign-out', () => {
    render(
      <Layout currentPage="dashboard" onNavigate={() => {}}>
        <p>Child</p>
      </Layout>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'navigation.signOut' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(authState.signOut).not.toHaveBeenCalled()
  })
})
