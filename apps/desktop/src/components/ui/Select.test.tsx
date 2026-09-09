// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { Select } from './Select'

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
]

afterEach(cleanup)

describe('Select', () => {
  it('renders options with placeholder and events', () => {
    const events = { onChange: vi.fn(), onFocus: vi.fn(), onBlur: vi.fn() }
    render(
      <Select label="Choice" placeholder="Pick one" value="a" options={options} required error="Bad" {...events} />,
    )

    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.required).toBe(true)
    expect(screen.getByText('Pick one')).toBeDefined()
    expect(screen.getByText('Bad')).toBeDefined()
    fireEvent.change(select, { target: { value: 'b' } })
    fireEvent.focus(select)
    fireEvent.blur(select)
    expect(events.onChange).toHaveBeenCalled()
    expect(events.onFocus).toHaveBeenCalled()
    expect(events.onBlur).toHaveBeenCalled()
  })

  it('renders a disabled single select with a muted chevron', () => {
    const { container } = render(<Select label="Choice" value="a" options={options} disabled />)

    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(container.querySelector('svg')).toBeDefined()
  })

  it('defaults to no options', () => {
    render(<Select label="Empty" options={undefined as never} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.querySelectorAll('option')).toHaveLength(0)
  })

  it('renders multiple selects without chevron or placeholder', () => {
    const { container } = render(
      <Select id="multi" label="Many" multiple value="" helperText="Help" disabled options={options} />,
    )

    const select = document.getElementById('multi') as HTMLSelectElement
    expect(select.multiple).toBe(true)
    expect(select.disabled).toBe(true)
    expect(screen.getByText('Help')).toBeDefined()
    expect(container.querySelector('svg')).toBeNull()
  })
})
