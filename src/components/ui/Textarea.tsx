import type { JSX } from 'preact'

interface TextareaProps {
  label?: string
  placeholder?: string
  value?: string
  disabled?: boolean
  required?: boolean
  error?: string
  helperText?: string
  size?: 'sm' | 'md' | 'lg'
  rows?: number
  onInput?: (e: Event) => void
  onChange?: (e: Event) => void
  onFocus?: (e: Event) => void
  onBlur?: (e: Event) => void
  class?: string
  id?: string
}

function clsx(...classes: (string | undefined | boolean)[]): string {
  return classes.filter(Boolean).join(' ')
}

export default function Textarea({
  label,
  placeholder,
  value,
  disabled = false,
  required = false,
  error,
  helperText,
  size = 'md',
  rows = 3,
  onInput,
  onChange,
  onFocus,
  onBlur,
  class: className = '',
  id,
  ...props
}: TextareaProps & Omit<JSX.HTMLAttributes<HTMLTextAreaElement>, 'size'>) {
  const textareaId = id || `textarea-${Math.random().toString(36).substring(2, 11)}`

  const baseClasses = clsx(
    'w-full rounded-xl border transition-colors duration-150 resize-vertical',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'bg-white',
  )

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base',
  } as const

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
        <label for={textareaId} class="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span class="text-red-500 ml-1">*</span>}
        </label>
      )}

      <textarea
        id={textareaId}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        required={required}
        rows={rows}
        onInput={onInput}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        class={classes}
        {...props}
      />

      {error && <p class="mt-2 text-sm text-red-600">{error}</p>}

      {helperText && !error && <p class="mt-1 text-sm text-gray-600">{helperText}</p>}
    </div>
  )
}
