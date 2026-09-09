// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/preact'

vi.mock('../../lib/platform', () => ({
  isDesktop: false,
}))

const { DbStatusBadge } = await import('./DbStatusBadge')

afterEach(cleanup)

describe('DbStatusBadge on web', () => {
  it('renders nothing without the desktop shell', () => {
    const { container } = render(<DbStatusBadge />)
    expect(container.innerHTML).toBe('')
  })
})
