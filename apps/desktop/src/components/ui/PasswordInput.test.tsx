// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { PasswordInput } = await import('./PasswordInput')

afterEach(cleanup)

function renderPassword(value = '', props: Record<string, unknown> = {}) {
  const onInput = vi.fn()
  const utils = render(<PasswordInput label="Password" value={value} onInput={onInput} {...props} />)
  return { onInput, ...utils }
}

describe('PasswordInput', () => {
  it('toggles visibility and forwards input', () => {
    const { onInput, container } = renderPassword('secret', {
      placeholder: 'pw',
      helperText: 'Help',
      autoComplete: 'new-password',
    })

    const input = container.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('type')).toBe('password')
    fireEvent.input(input, { target: { value: 'secret!' } })
    expect(onInput).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Right icon action' }))
    expect(input.getAttribute('type')).toBe('text')

    fireEvent.click(screen.getByRole('button', { name: 'Right icon action' }))
    expect(input.getAttribute('type')).toBe('password')
  })

  it('reports strength with hints for weak passwords', () => {
    renderPassword('abc', { showStrength: true, disabled: true })

    expect(document.querySelectorAll('li').length).toBe(5)
    expect(screen.getByText('members.passwordRequirementsHint')).toBeDefined()
  })

  it('confirms valid passwords and stays quiet when empty', () => {
    const { rerender } = renderPassword('Str0ng!pass', { showStrength: true })
    expect(screen.getByText('members.passwordValid')).toBeDefined()

    rerender(<PasswordInput label="Password" value="" onInput={vi.fn()} showStrength />)
    expect(screen.queryByText('members.passwordValid')).toBeNull()
    expect(screen.queryByText('members.passwordRequirementsHint')).toBeNull()
  })
})
