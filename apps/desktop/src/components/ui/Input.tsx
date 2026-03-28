import type { JSX } from 'preact'
import { clsx, generateId, iconWrapperClasses, inputBaseClasses, inputStateClasses } from '../../lib/utils'
import { FormField } from './FormField'

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
  min?: string | number
  max?: string | number
  step?: string | number
}

export function Input({
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
  const inputId = id || generateId('input')

  const sizes = {
    sm: leftIcon ? 'pl-10 pr-4 py-2 text-sm' : rightIcon ? 'pl-4 pr-10 py-2 text-sm' : 'px-4 py-2 text-sm',
    md: leftIcon ? 'pl-10 pr-4 py-2.5 text-sm' : rightIcon ? 'pl-4 pr-10 py-2.5 text-sm' : 'px-4 py-2.5 text-sm',
    lg: leftIcon ? 'pl-12 pr-5 py-3 text-base' : rightIcon ? 'pl-5 pr-12 py-3 text-base' : 'px-5 py-3 text-base',
  }

  const classes = clsx(inputBaseClasses(disabled), sizes[size], inputStateClasses(error), className)

  return (
    <FormField id={inputId} label={label} required={required} error={error} helperText={helperText}>
      <div class="relative">
        {leftIcon && (
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <div class={clsx('h-5 w-5 text-gray-400', iconWrapperClasses)}>{leftIcon}</div>
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

        {rightIcon && (
          <div class="absolute inset-y-0 right-0 pr-3 flex items-center">
            {onRightIconClick ? (
              <button
                type="button"
                class="cursor-pointer text-gray-400 hover:text-gray-600 transition-colors"
                onClick={onRightIconClick}
                aria-label="Right icon action"
              >
                <div class={clsx('h-4 w-4', iconWrapperClasses)}>{rightIcon}</div>
              </button>
            ) : (
              <div class="pointer-events-none text-gray-400">
                <div class={clsx('h-4 w-4', iconWrapperClasses)}>{rightIcon}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </FormField>
  )
}
