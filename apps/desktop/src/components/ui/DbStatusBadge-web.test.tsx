// @vitest-environment happy-dom

import { cleanup, render } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
