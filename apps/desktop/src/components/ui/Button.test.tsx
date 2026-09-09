// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { Button } from './Button'

afterEach(cleanup)

describe('Button', () => {
  it('renders variants, sizes, and states', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Save</Button>)

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.getAttribute('type')).toBe('button')
    expect(button.className).toContain('bg-accent')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <Button variant="danger" size="lg" type="submit">
        Delete
      </Button>,
    )
    const danger = screen.getByRole('button', { name: 'Delete' })
    expect(danger.getAttribute('type')).toBe('submit')
    expect(danger.className).toContain('bg-danger')
    expect(danger.className).toContain('px-6')

    rerender(
      <Button variant="secondary" size="sm" disabled class="extra">
        Off
      </Button>,
    )
    const disabled = screen.getByRole('button', { name: 'Off' }) as HTMLButtonElement
    expect(disabled.disabled).toBe(true)
    expect(disabled.className).toContain('opacity-50')
    expect(disabled.className).toContain('extra')
  })

  it('renders ghost and outline variants', () => {
    render(
      <div>
        <Button variant="ghost">Ghost</Button>
        <Button variant="outline">Outline</Button>
      </div>,
    )
    expect(screen.getByRole('button', { name: 'Ghost' }).className).toContain('bg-transparent')
    expect(screen.getByRole('button', { name: 'Outline' }).className).toContain('border-fog-border')
  })
})
