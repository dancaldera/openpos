import { useEffect, useRef } from 'preact/hooks'
import { useTranslation } from '../../hooks/useTranslation'
import { clsx } from '../../lib/utils'

interface VirtualKeypadProps {
  onDigitPress: (digit: string) => void
  onBackspace: () => void
  disabled?: boolean
  size?: 'default' | 'large'
}

type KeypadKeyboardEvent = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'> & {
  target?: EventTarget | null
  preventDefault: () => void
}

export function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as { tagName?: string; isContentEditable?: boolean }
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(element.isContentEditable)
}

export function handleVirtualKeypadKeyDown(
  event: KeypadKeyboardEvent,
  options: {
    disabled: boolean
    onDigitPress: (digit: string) => void
    onBackspace: () => void
  },
): boolean {
  if (options.disabled) return false
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (isEditableKeyTarget(event.target ?? null)) return false

  if (/^[0-9]$/.test(event.key)) {
    event.preventDefault()
    options.onDigitPress(event.key)
    return true
  }

  if (event.key === 'Backspace') {
    event.preventDefault()
    options.onBackspace()
    return true
  }

  return false
}

export function VirtualKeypad({ onDigitPress, onBackspace, disabled = false, size = 'default' }: VirtualKeypadProps) {
  const { t } = useTranslation()
  const onDigitPressRef = useRef(onDigitPress)
  const onBackspaceRef = useRef(onBackspace)
  onDigitPressRef.current = onDigitPress
  onBackspaceRef.current = onBackspace

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleVirtualKeypadKeyDown(event, {
        disabled,
        onDigitPress: (digit) => onDigitPressRef.current(digit),
        onBackspace: () => onBackspaceRef.current(),
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [disabled])

  const handleDigitPress = (value: string) => {
    if (!disabled) {
      if (value === 'backspace') {
        onBackspace()
      } else {
        onDigitPress(value)
      }
    }
  }

  const isLarge = size === 'large'
  const buttonTextClass = isLarge ? 'text-3xl' : 'text-lg'
  const buttonBase = clsx(
    'aspect-square rounded-buttons font-bold transition-colors',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'focus:outline-none focus:ring-2 focus:ring-accent',
    buttonTextClass,
  )

  return (
    <div class={clsx('w-full mx-auto mt-3 px-1', isLarge ? 'max-w-72' : 'max-w-48')}>
      <div
        class={clsx(
          'grid grid-cols-3 bg-chalk rounded-cards border border-fog-border',
          isLarge ? 'gap-3 p-4' : 'gap-2 p-3',
        )}
      >
        {Array.from({ length: 9 }, (_, i) => i + 1).map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => handleDigitPress(num.toString())}
            disabled={disabled}
            class={clsx(buttonBase, 'bg-accent text-canvas')}
            aria-label={`Digit ${num}`}
          >
            {num}
          </button>
        ))}

        <button
          type="button"
          onClick={() => handleDigitPress('backspace')}
          disabled={disabled}
          class={clsx(buttonBase, 'bg-accent text-canvas')}
          aria-label={t('auth.backspace')}
        >
          ⌫
        </button>

        <button
          type="button"
          onClick={() => handleDigitPress('0')}
          disabled={disabled}
          class={clsx(buttonBase, 'bg-accent text-canvas')}
          aria-label="Digit 0"
        >
          0
        </button>

        <div class="aspect-square" />
      </div>
    </div>
  )
}
