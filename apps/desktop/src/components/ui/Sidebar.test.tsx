// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { Sidebar } from './Sidebar'

const items = [
  { id: 'dashboard', label: 'Dashboard', icon: <span>D</span>, onClick: vi.fn(), active: true, badge: 3 },
  { id: 'orders', label: 'Orders', icon: <span>O</span> },
]

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Sidebar', () => {
  it('renders desktop navigation with widths and interacts', () => {
    const onToggleCollapsed = vi.fn()
    const onMobileClose = vi.fn()
    const { unmount } = render(
      <Sidebar
        items={items}
        title="Shop"
        width="lg"
        onToggleCollapsed={onToggleCollapsed}
        toggleLabel="Collapse"
        footer={<div>Foot</div>}
        data-testid="side"
      />,
    )

    expect(screen.getByText('Shop')).toBeDefined()
    expect(screen.getByText('Foot')).toBeDefined()
    expect(screen.getByText('3')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('Dashboard'))
    expect(items[0].onClick).toHaveBeenCalled()
    expect(onMobileClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Orders'))
    unmount()
  })

  it('renders small width on mac with collapsed state and function footer', () => {
    const { container } = render(
      <Sidebar
        items={[{ id: 'a', label: 'A', icon: <span>A</span>, badge: 'new' }]}
        width="sm"
        collapsed
        isMac
        footer={({ collapsed }) => <div>{collapsed ? 'Mini' : 'Full'}</div>}
      />,
    )
    expect(screen.getByText('Mini')).toBeDefined()
    expect(container.innerHTML).toContain('w-20')
  })

  it('hides the toggle when no handler is given and supports custom class', () => {
    const { container } = render(<Sidebar items={items} class="extra" />)
    expect(screen.queryByRole('button', { name: 'Toggle sidebar' })).toBeNull()
    expect(container.innerHTML).toContain('extra')
  })

  it('opens the mobile drawer and closes it via X, backdrop, and Escape', () => {
    const onMobileClose = vi.fn()
    render(<Sidebar items={items} mobileOpen onMobileClose={onMobileClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(onMobileClose).toHaveBeenCalledTimes(1)

    const backdrop = document.querySelector('.backdrop-blur-sm')
    expect(backdrop).toBeDefined()
    fireEvent.click(backdrop as Element)
    expect(onMobileClose).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onMobileClose).toHaveBeenCalledTimes(3)

    // The desktop bar and the mobile drawer both render the items; use the drawer copy.
    const orders = screen.getAllByText('Orders')
    fireEvent.click(orders[orders.length - 1])
    expect(onMobileClose).toHaveBeenCalledTimes(4)
  })

  it('ignores non-escape keys and unregisters the mobile listener', () => {
    const onMobileClose = vi.fn()
    const { unmount } = render(<Sidebar items={items} mobileOpen onMobileClose={onMobileClose} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onMobileClose).not.toHaveBeenCalled()
    unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onMobileClose).not.toHaveBeenCalled()
  })

  it('renders nothing mobile when closed', () => {
    render(<Sidebar items={items} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders with all defaults', () => {
    render(<Sidebar />)
    expect(screen.getByText('Titanic POS')).toBeDefined()
  })
})
