import { Button } from '@astryxdesign/core/Button'
import { Delete } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from '../../hooks/useTranslation'

type KeypadKeyboardEvent = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'> & {
  target?: EventTarget | null
  preventDefault: () => void
}

/** True when a key press should go to the focused field instead of the keypad. */
export function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as { tagName?: string; isContentEditable?: boolean; readOnly?: boolean }
  const tag = element.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return !element.readOnly
  return tag === 'SELECT' || Boolean(element.isContentEditable)
}

/** Maps physical digit and Backspace keys onto the keypad. Returns whether the key was handled. */
export function handlePinKeyDown(
  event: KeypadKeyboardEvent,
  options: { isDisabled: boolean; onDigit: (digit: string) => void; onBackspace: () => void },
): boolean {
  if (options.isDisabled) return false
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (isEditableKeyTarget(event.target ?? null)) return false

  if (/^[0-9]$/.test(event.key)) {
    event.preventDefault()
    options.onDigit(event.key)
    return true
  }

  if (event.key === 'Backspace') {
    event.preventDefault()
    options.onBackspace()
    return true
  }

  return false
}

interface PinKeypadProps {
  onDigit: (digit: string) => void
  onBackspace: () => void
  isDisabled?: boolean
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** Numeric keypad for PIN entry. Also listens to the physical keyboard while mounted. */
export function PinKeypad({ onDigit, onBackspace, isDisabled = false }: PinKeypadProps) {
  const { t } = useTranslation()
  const onDigitRef = useRef(onDigit)
  const onBackspaceRef = useRef(onBackspace)
  onDigitRef.current = onDigit
  onBackspaceRef.current = onBackspace

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handlePinKeyDown(event, {
        isDisabled,
        onDigit: (digit) => onDigitRef.current(digit),
        onBackspace: () => onBackspaceRef.current(),
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isDisabled])

  const digitButton = (digit: string) => (
    <Button key={digit} label={digit} size="lg" width="100%" isDisabled={isDisabled} onClick={() => onDigit(digit)} />
  )

  return (
    <fieldset className="m-0 grid grid-cols-3 gap-2 border-0 p-0" aria-label={t('auth.pinKeypad')}>
      {DIGITS.map(digitButton)}
      <span aria-hidden="true" />
      {digitButton('0')}
      <div className="flex items-center justify-center">
        <Button
          label={t('auth.backspace')}
          isIconOnly
          icon={<Delete size={20} />}
          variant="ghost"
          size="lg"
          isDisabled={isDisabled}
          onClick={onBackspace}
        />
      </div>
    </fieldset>
  )
}
