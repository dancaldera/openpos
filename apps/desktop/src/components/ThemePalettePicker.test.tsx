// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemePalettePicker } from './ThemePalettePicker'

afterEach(cleanup)

describe('ThemePalettePicker', () => {
  it('marks the active palette and reports selections', () => {
    const onChange = vi.fn()
    render(<ThemePalettePicker value="ocean" onChange={onChange} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(11)
    const pressed = buttons.filter((button) => button.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(1)

    fireEvent.click(buttons[0])
    expect(onChange).toHaveBeenCalledWith('classic')
  })
})
