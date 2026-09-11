// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it } from 'vitest'
import { Link } from './Link'

afterEach(cleanup)

describe('Link', () => {
  it('renders an anchor with href and children', () => {
    render(
      <Link href="/orders" class="test-link">
        Orders
      </Link>,
    )

    const anchor = screen.getByRole('link', { name: 'Orders' })
    expect(anchor.getAttribute('href')).toBe('/orders')
    expect(anchor.className).toContain('test-link')
  })
})
