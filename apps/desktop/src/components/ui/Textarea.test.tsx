// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Textarea } from './Textarea'

afterEach(cleanup)

describe('Textarea', () => {
  it('renders with generated ids and forwards events', () => {
    const onInput = vi.fn()
    render(<Textarea label="Notes" placeholder="Write…" value="hi" onInput={onInput} />)

    const area = screen.getByPlaceholderText('Write…') as HTMLTextAreaElement
    expect(area.getAttribute('id')).toMatch(/^textarea-/)
    expect(area.value).toBe('hi')
    fireEvent.input(area, { target: { value: 'hello' } })
    expect(onInput).toHaveBeenCalled()
  })

  it('honors explicit ids, sizes, states, and remaining events', () => {
    const events = { onChange: vi.fn(), onFocus: vi.fn(), onBlur: vi.fn() }
    render(
      <Textarea
        id="custom-area"
        label="Bio"
        size="lg"
        rows={5}
        disabled
        required
        error="Too short"
        helperText="Ignored when errored"
        {...events}
      />,
    )

    const area = document.getElementById('custom-area') as HTMLTextAreaElement
    expect(area).toBeDefined()
    expect(area.disabled).toBe(true)
    expect(area.getAttribute('rows')).toBe('5')
    expect(screen.getByText('Too short')).toBeDefined()
    fireEvent.change(area)
    fireEvent.focus(area)
    fireEvent.blur(area)
    expect(events.onChange).toHaveBeenCalled()
    expect(events.onFocus).toHaveBeenCalled()
    expect(events.onBlur).toHaveBeenCalled()
  })
})
