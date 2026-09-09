// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { VirtualKeypad } from './VirtualKeypad'

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(cleanup)

describe('VirtualKeypad', () => {
  it('presses digits and backspace', () => {
    const onDigitPress = vi.fn()
    const onBackspace = vi.fn()
    render(<VirtualKeypad onDigitPress={onDigitPress} onBackspace={onBackspace} />)

    fireEvent.click(screen.getByRole('button', { name: 'Digit 1' }))
    expect(onDigitPress).toHaveBeenCalledWith('1')
    fireEvent.click(screen.getByRole('button', { name: 'Digit 0' }))
    expect(onDigitPress).toHaveBeenCalledWith('0')
    fireEvent.click(screen.getByRole('button', { name: 'auth.backspace' }))
    expect(onBackspace).toHaveBeenCalledTimes(1)
  })

  it('renders the large variant', () => {
    const { container } = render(
      <VirtualKeypad onDigitPress={() => {}} onBackspace={() => {}} size="large" />,
    )
    expect(container.querySelector('.max-w-72')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Digit 9' })).toBeDefined()
  })

  it('blocks presses while disabled', () => {
    const onDigitPress = vi.fn()
    const onBackspace = vi.fn()
    render(<VirtualKeypad onDigitPress={onDigitPress} onBackspace={onBackspace} disabled />)

    // Disabled buttons swallow clicks under happy-dom, so force the events
    // through to prove the guard itself blocks the presses.
    const digit = screen.getByRole('button', { name: 'Digit 5' })
    digit.removeAttribute('disabled')
    fireEvent.click(digit)
    const backspace = screen.getByRole('button', { name: 'auth.backspace' })
    backspace.removeAttribute('disabled')
    fireEvent.click(backspace)
    expect(onDigitPress).not.toHaveBeenCalled()
    expect(onBackspace).not.toHaveBeenCalled()
  })

  it('forwards physical keyboard events and unregisters on unmount', () => {
    const onDigitPress = vi.fn()
    const onBackspace = vi.fn()
    const { unmount } = render(<VirtualKeypad onDigitPress={onDigitPress} onBackspace={onBackspace} />)

    fireEvent.keyDown(window, { key: '7' })
    expect(onDigitPress).toHaveBeenCalledWith('7')
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(onBackspace).toHaveBeenCalledTimes(1)

    unmount()
    fireEvent.keyDown(window, { key: '8' })
    expect(onDigitPress).not.toHaveBeenCalledWith('8')
  })
})
