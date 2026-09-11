// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/platform', () => ({
  isDesktop: false,
}))

const { UpdateBadge } = await import('./UpdateBadge')

afterEach(cleanup)

describe('UpdateBadge on web', () => {
  it('renders nothing without the desktop shell', () => {
    const { container } = render(<UpdateBadge />)
    expect(container.innerHTML).toBe('')
  })
})
