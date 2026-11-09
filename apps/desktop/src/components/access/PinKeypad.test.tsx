// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../hooks/useTranslation', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { PinKeypad, handlePinKeyDown, isEditableKeyTarget } = await import('./PinKeypad')

afterEach(cleanup)

function keyEvent(key: string, extra: Partial<KeyboardEvent> & { target?: EventTarget | null } = {}) {
  return { key, metaKey: false, ctrlKey: false, altKey: false, preventDefault: vi.fn(), ...extra }
}

describe('isEditableKeyTarget', () => {
  it('treats editable fields as editable and read-only inputs as not', () => {
    const inputEl = document.createElement('input')
    expect(isEditableKeyTarget(inputEl)).toBe(true)
    inputEl.readOnly = true
    expect(isEditableKeyTarget(inputEl)).toBe(false)
    expect(isEditableKeyTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableKeyTarget(document.createElement('select'))).toBe(true)
    expect(isEditableKeyTarget(document.createElement('div'))).toBe(false)
    expect(isEditableKeyTarget(null)).toBe(false)
  })
})

describe('handlePinKeyDown', () => {
  it('maps digits and backspace, ignoring modifiers, disabled state, and editable targets', () => {
    const onDigit = vi.fn()
    const onBackspace = vi.fn()
    const options = { isDisabled: false, onDigit, onBackspace }

    expect(handlePinKeyDown(keyEvent('7'), options)).toBe(true)
    expect(onDigit).toHaveBeenCalledWith('7')
    expect(handlePinKeyDown(keyEvent('Backspace'), options)).toBe(true)
    expect(onBackspace).toHaveBeenCalledTimes(1)
    expect(handlePinKeyDown(keyEvent('a'), options)).toBe(false)
    expect(handlePinKeyDown(keyEvent('1', { metaKey: true }), options)).toBe(false)
    expect(handlePinKeyDown(keyEvent('1', { target: document.createElement('input') }), options)).toBe(false)
    expect(handlePinKeyDown(keyEvent('1'), { ...options, isDisabled: true })).toBe(false)
    expect(onDigit).toHaveBeenCalledTimes(1)
  })
})

describe('PinKeypad', () => {
  it('renders digit buttons and listens to the keyboard', () => {
    const onDigit = vi.fn()
    const onBackspace = vi.fn()
    render(<PinKeypad onDigit={onDigit} onBackspace={onBackspace} />)

    for (const digit of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(screen.getByRole('button', { name: digit })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    fireEvent.click(screen.getByRole('button', { name: 'auth.backspace' }))
    fireEvent.keyDown(window, { key: '8' })

    expect(onDigit.mock.calls).toEqual([['5'], ['8']])
    expect(onBackspace).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('ignores the keyboard while disabled', () => {
    const onDigit = vi.fn()
    render(<PinKeypad onDigit={onDigit} onBackspace={vi.fn()} isDisabled />)
    fireEvent.keyDown(window, { key: '8' })
    expect(onDigit).not.toHaveBeenCalled()
  })
})
