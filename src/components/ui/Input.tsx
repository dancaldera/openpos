import type { JSX } from 'preact'

interface InputProps {
  label?: string
  placeholder?: string
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'search'
  value?: string
  disabled?: boolean
  required?: boolean
  error?: string
  helperText?: string
  size?: 'sm' | 'md' | 'lg'
  onInput?: (e: Event) => void
  onChange?: (e: Event) => void
  onFocus?: (e: Event) => void
  onBlur?: (e: Event) => void
  class?: string
  id?: string
  leftIcon?: JSX.Element
  rightIcon?: JSX.Element
  onRightIconClick?: () => void
  pattern?: string
  inputMode?: string
  maxLength?: number
}

function clsx(...classes: (string | undefined | boolean)[]): string {
  return classes.filter(Boolean).join(' ')
}

export default function Input({
  label,
  placeholder,
  type = 'text',
  value,
  disabled = false,
  required = false,
  error,
  helperText,
  size = 'md',
  onInput,
  onChange,
  onFocus,
  onBlur,
  class: className = '',
  id,
  leftIcon,
  rightIcon,
  onRightIconClick,
  ...props
}: InputProps & Omit<JSX.HTMLAttributes<HTMLInputElement>, 'size'>) {
  const inputId = id || `input-${Math.random().toString(36).substring(2, 11)}`

  const baseClasses = clsx(
    'w-full rounded-xl border transition-colors duration-150',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'bg-white',
  )

  const sizes = {
    sm: leftIcon ? 'pl-10 pr-4 py-2 text-sm' : rightIcon ? 'pl-4 pr-10 py-2 text-sm' : 'px-4 py-2 text-sm',
    md: leftIcon ? 'pl-10 pr-4 py-2.5 text-sm' : rightIcon ? 'pl-4 pr-10 py-2.5 text-sm' : 'px-4 py-2.5 text-sm',
    lg: leftIcon ? 'pl-12 pr-5 py-3 text-base' : rightIcon ? 'pl-5 pr-12 py-3 text-base' : 'px-5 py-3 text-base',
  }

  const stateClasses = error
    ? clsx('border-red-500 text-red-900 placeholder-red-300', 'focus:ring-red-500 focus:border-red-500')
    : clsx(
        'border-gray-300 text-gray-900 placeholder-gray-500',
        'focus:ring-blue-500 focus:border-blue-500',
        'hover:border-gray-400',
      )

  const classes = clsx(baseClasses, sizes[size], stateClasses, className)

  return (
    <div class="w-full">
      {label && (
        <label for={inputId} class="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span class="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div class="relative">
        {/* Left Icon */}
        {leftIcon && (
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <div class="h-5 w-5 text-gray-400 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full">
              {leftIcon}
            </div>
          </div>
        )}

        <input
          id={inputId}
          type={type}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          required={required}
          onInput={onInput}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          class={classes}
          {...props}
        />

        {/* Right Icon */}
        {rightIcon && (
          <div class="absolute inset-y-0 right-0 pr-3 flex items-center">
            {onRightIconClick ? (
              <button
                type="button"
                class="cursor-pointer text-gray-400 hover:text-gray-600 transition-colors"
                onClick={onRightIconClick}
                aria-label="Right icon action"
              >
                <div class="h-4 w-4 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full">{rightIcon}</div>
              </button>
            ) : (
              <div class="pointer-events-none text-gray-400">
                <div class="h-4 w-4 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full">{rightIcon}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p class="mt-2 text-sm text-red-600">{error}</p>}

      {helperText && !error && <p class="mt-1 text-sm text-gray-600">{helperText}</p>}
    </div>
  )
}
