// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { DashboardSkeleton, FullPageLoader, PageLoader } from './PageLoader'

afterEach(cleanup)

describe('PageLoader', () => {
  it('renders a spinner without a message', () => {
    const { container } = render(<PageLoader />)
    expect(container.querySelector('svg')).toBeDefined()
    expect(container.querySelector('p')).toBeNull()
  })

  it('renders the message when provided', () => {
    render(<PageLoader message="Loading products" />)
    expect(screen.getByText('Loading products')).toBeDefined()
  })
})

describe('FullPageLoader', () => {
  it('renders a spinner without a message', () => {
    const { container } = render(<FullPageLoader />)
    expect(container.querySelector('svg')).toBeDefined()
    expect(container.querySelector('p')).toBeNull()
  })

  it('renders the message when provided', () => {
    render(<FullPageLoader message="Booting" />)
    expect(screen.getByText('Booting')).toBeDefined()
  })
})

describe('DashboardSkeleton', () => {
  it('renders skeleton blocks', () => {
    const { container } = render(<DashboardSkeleton />)
    const blocks = container.querySelectorAll('.animate-pulse')
    expect(blocks.length).toBeGreaterThan(0)
  })
})
