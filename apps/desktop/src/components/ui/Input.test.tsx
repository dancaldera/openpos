// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import type { JSX } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Input } from './Input'

afterEach(cleanup)

const leftIcon = (<span data-testid="left-icon">L</span>) as JSX.Element
const rightIcon = (<span data-testid="right-icon">R</span>) as JSX.Element

describe('Input', () => {
  it('sizes with left, right, or no icons', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const { unmount: unmountLeft } = render(<Input label={`${size}-left`} size={size} leftIcon={leftIcon} />)
      expect(screen.getByTestId('left-icon')).toBeDefined()
      unmountLeft()

      const { unmount: unmountRight } = render(<Input label={`${size}-right`} size={size} rightIcon={rightIcon} />)
      expect(screen.getByTestId('right-icon')).toBeDefined()
      unmountRight()

      const { container, unmount: unmountPlain } = render(<Input label={`${size}-plain`} size={size} />)
      expect(container.querySelector('[data-testid$="-icon"]')).toBeNull()
      unmountPlain()
    }
  })

  it('forwards events, states, and right-icon actions', () => {
    const events = { onInput: vi.fn(), onChange: vi.fn(), onFocus: vi.fn(), onBlur: vi.fn() }
    const onRightIconClick = vi.fn()
    render(
      <Input
        id="user-input"
        label="Name"
        placeholder="Ada"
        value="Ada"
        disabled
        required
        error="Bad"
        rightIcon={rightIcon}
        onRightIconClick={onRightIconClick}
        {...events}
      />,
    )

    const input = document.getElementById('user-input') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(screen.getByText('Bad')).toBeDefined()
    fireEvent.input(input, { target: { value: 'A' } })
    fireEvent.change(input)
    fireEvent.focus(input)
    fireEvent.blur(input)
    expect(events.onInput).toHaveBeenCalled()
    expect(events.onChange).toHaveBeenCalled()
    expect(events.onFocus).toHaveBeenCalled()
    expect(events.onBlur).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Right icon action' }))
    expect(onRightIconClick).toHaveBeenCalled()
  })
})
