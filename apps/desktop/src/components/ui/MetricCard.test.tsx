// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it } from 'vitest'
import { MetricCard } from './MetricCard'

afterEach(cleanup)

describe('MetricCard', () => {
  it('renders label, value, and optional description', () => {
    const { rerender } = render(<MetricCard label="Sales" value={1250} description="Today" class="custom" />)

    expect(screen.getByText('Sales')).toBeDefined()
    expect(screen.getByText('1250')).toBeDefined()
    expect(screen.getByText('Today')).toBeDefined()

    rerender(<MetricCard label="Sales" value="$1,250" />)
    expect(screen.getByText('$1,250')).toBeDefined()
    expect(screen.queryByText('Today')).toBeNull()
  })
})
