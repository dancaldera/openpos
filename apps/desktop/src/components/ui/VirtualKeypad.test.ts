import { describe, expect, it, vi } from 'vitest'
import { handleVirtualKeypadKeyDown } from './VirtualKeypad'

function keyEvent(
  key: string,
  extras: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; target: EventTarget | null }> = {},
) {
  return {
    key,
    metaKey: extras.metaKey ?? false,
    ctrlKey: extras.ctrlKey ?? false,
    altKey: extras.altKey ?? false,
    target: extras.target ?? null,
    preventDefault: vi.fn(() => {}),
  }
}

describe('handleVirtualKeypadKeyDown', () => {
  it('enters digits 0-9 from the keyboard', () => {
    const onDigitPress = vi.fn(() => {})
    const onBackspace = vi.fn(() => {})
    const event = keyEvent('4')

    expect(handleVirtualKeypadKeyDown(event, { disabled: false, onDigitPress, onBackspace })).toBe(true)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(onDigitPress).toHaveBeenCalledWith('4')
    expect(onBackspace).not.toHaveBeenCalled()
  })

  it('deletes the last digit on Backspace', () => {
    const onDigitPress = vi.fn(() => {})
    const onBackspace = vi.fn(() => {})
    const event = keyEvent('Backspace')

    expect(handleVirtualKeypadKeyDown(event, { disabled: false, onDigitPress, onBackspace })).toBe(true)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(onBackspace).toHaveBeenCalledTimes(1)
    expect(onDigitPress).not.toHaveBeenCalled()
  })

  it('ignores keys while disabled, with modifiers, or while typing in a field', () => {
    const onDigitPress = vi.fn(() => {})
    const onBackspace = vi.fn(() => {})
    const input = { tagName: 'INPUT' } as unknown as EventTarget

    expect(handleVirtualKeypadKeyDown(keyEvent('1'), { disabled: true, onDigitPress, onBackspace })).toBe(false)
    expect(
      handleVirtualKeypadKeyDown(keyEvent('1', { metaKey: true }), { disabled: false, onDigitPress, onBackspace }),
    ).toBe(false)
    expect(
      handleVirtualKeypadKeyDown(keyEvent('1', { target: input }), { disabled: false, onDigitPress, onBackspace }),
    ).toBe(false)
    expect(handleVirtualKeypadKeyDown(keyEvent('a'), { disabled: false, onDigitPress, onBackspace })).toBe(false)

    expect(onDigitPress).not.toHaveBeenCalled()
    expect(onBackspace).not.toHaveBeenCalled()
  })
})
