// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { signOutMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
}))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { name: 'Ada Admin', email: 'ada@example.com', role: 'admin' },
    signOut: signOutMock,
  }),
}))

vi.mock('../hooks/usePlatform', () => ({
  usePlatform: () => ({ isMac: true, isWindows: false, isLinux: false, isDesktop: false }),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: false,
}))

vi.mock('../lib/desktop', () => ({
  getDesktopApi: () => undefined,
}))

const Layout = (await import('./Layout')).default

afterEach(() => {
  cleanup()
  signOutMock.mockClear()
})

describe('Layout on web', () => {
  it('renders without desktop-only integrations', () => {
    const onNavigate = vi.fn()
    const { container } = render(
      <Layout currentPage="orders" onNavigate={onNavigate}>
        <p>Web child</p>
      </Layout>,
    )

    expect(screen.getByText('Web child')).toBeDefined()
    expect(screen.getAllByText('navigation.orders')).toHaveLength(2)
    // No desktop badges are rendered on web.
    expect(container.innerHTML).not.toContain('update.')
    expect(screen.queryByText('Offline')).toBeNull()

    const dashboard = screen.getAllByText('navigation.dashboard')
    fireEvent.click(dashboard[dashboard.length - 1])
    expect(onNavigate).toHaveBeenCalledWith('dashboard')

    fireEvent.click(screen.getByRole('button', { name: 'navigation.signOut' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'navigation.signOut' })[1])
    expect(signOutMock).toHaveBeenCalledTimes(1)
  })
})
