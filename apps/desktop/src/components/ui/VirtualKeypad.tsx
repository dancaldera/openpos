import { useTranslation } from '../../hooks/useTranslation'

interface VirtualKeypadProps {
  onDigitPress: (digit: string) => void
  onBackspace: () => void
  disabled?: boolean
  size?: 'default' | 'large'
}

export function VirtualKeypad({ onDigitPress, onBackspace, disabled = false, size = 'default' }: VirtualKeypadProps) {
  const { t } = useTranslation()

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
  const containerClass = isLarge ? 'max-w-72' : 'max-w-48'
  const gridClass = isLarge ? 'gap-3 p-4' : 'gap-2 p-3'
  const buttonTextClass = isLarge ? 'text-3xl' : 'text-lg'

  return (
    <div class={`w-full ${containerClass} mx-auto mt-3 px-1`}>
      <div class={`grid grid-cols-3 ${gridClass} bg-gray-100 rounded-lg border border-gray-300`}>
        {/* Numbers 1-9 */}
        {Array.from({ length: 9 }, (_, i) => i + 1).map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => handleDigitPress(num.toString())}
            disabled={disabled}
            class={`aspect-square rounded bg-blue-600 hover:bg-blue-700 text-white font-bold ${buttonTextClass} transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500`}
            aria-label={`Digit ${num}`}
          >
            {num}
          </button>
        ))}

        {/* Backspace button */}
        <button
          type="button"
          onClick={() => handleDigitPress('backspace')}
          disabled={disabled}
          class={`aspect-square rounded bg-red-500 hover:bg-red-600 text-white font-bold ${buttonTextClass} transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-500`}
          aria-label={t('auth.backspace')}
        >
          ⌫
        </button>

        {/* Zero button */}
        <button
          type="button"
          onClick={() => handleDigitPress('0')}
          disabled={disabled}
          class={`aspect-square rounded bg-blue-600 hover:bg-blue-700 text-white font-bold ${buttonTextClass} transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500`}
          aria-label="Digit 0"
        >
          0
        </button>

        {/* Empty space for grid layout */}
        <div class="aspect-square"></div>
      </div>
    </div>
  )
}
