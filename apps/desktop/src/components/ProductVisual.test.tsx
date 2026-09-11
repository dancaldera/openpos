// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it } from 'vitest'
import { ProductVisual } from './ProductVisual'

afterEach(cleanup)

describe('ProductVisual', () => {
  it('renders product images when available', () => {
    render(<ProductVisual name="Cola" imageUrl="https://img.example.com/cola.png" />)

    const image = screen.getByRole('img', { name: 'Cola' }) as HTMLImageElement
    expect(image.src).toBe('https://img.example.com/cola.png')
  })

  it('falls back to category icons', () => {
    const { rerender } = render(<ProductVisual name="Milk" product={{ category: 'Dairy' } as never} />)
    expect(screen.getByText('🥛')).toBeDefined()

    rerender(<ProductVisual name="Mystery" product={{ category: 'Unknown' } as never} />)
    expect(screen.getByText('📦')).toBeDefined()

    rerender(<ProductVisual name="Plain" />)
    expect(screen.getByText('📦')).toBeDefined()
  })
})
