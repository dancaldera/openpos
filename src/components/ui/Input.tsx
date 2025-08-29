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
    // Base layout and glass effect
    'relative w-full rounded-xl transition-colors duration-150',
    'backdrop-blur-md bg-white/10 border border-white/20',
    // Accessible focus-visible ring (matches Button)
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white/10',
    'hover:bg-white/15',
    // Disabled state
    disabled ? 'opacity-40 cursor-not-allowed' : '',
    // Shadow for depth (no change on focus)
    'shadow-lg',
  )

  const sizes = {
    sm: leftIcon ? 'pl-10 pr-4 py-2 text-sm' : rightIcon ? 'pl-4 pr-10 py-2 text-sm' : 'px-4 py-2 text-sm',
    md: leftIcon ? 'pl-10 pr-4 py-2.5 text-sm' : rightIcon ? 'pl-4 pr-10 py-2.5 text-sm' : 'px-4 py-2.5 text-sm',
    lg: leftIcon ? 'pl-12 pr-5 py-3 text-base' : rightIcon ? 'pl-5 pr-12 py-3 text-base' : 'px-5 py-3 text-base',
  }

  const stateClasses = error
    ? clsx(
        'border-red-400/50',
        'bg-red-50/10',
        // Red focus ring when invalid
        'focus-visible:ring-red-500/60',
      )
    : clsx(
        'border-white/20',
        'hover:border-white/30',
        // Blue focus ring by default
        'focus-visible:ring-blue-500/60',
      )

  const classes = clsx(baseClasses, sizes[size], stateClasses, className)

  return (
    <div class="w-full">
      {label && (
        <label for={inputId} class="block text-sm font-medium text-gray-700 mb-2 drop-shadow-sm">
          {label}
          {required && <span class="text-red-500 ml-1 drop-shadow-sm">*</span>}
        </label>
      )}

      <div class="relative">
        {/* Left Icon */}
        {leftIcon && (
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
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
          <div class="absolute inset-y-0 right-0 pr-3 flex items-center z-10">
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

        {/* Glass highlight overlay */}
        <div
          class={clsx(
            'absolute inset-0 rounded-xl pointer-events-none z-0',
            'bg-gradient-to-b from-white/10 via-transparent to-transparent',
            'opacity-60',
          )}
        />
      </div>

      {error && (
        <div class="mt-2 p-2 rounded-lg bg-red-500/10 backdrop-blur-sm border border-red-400/20">
          <p class="text-sm text-red-600 flex items-center drop-shadow-sm">
            <span class="mr-2">⚠️</span>
            {error}
          </p>
        </div>
      )}

      {helperText && !error && <p class="mt-1 text-sm text-gray-600 drop-shadow-sm">{helperText}</p>}
    </div>
  )
}
