import type { JSX } from 'preact'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  label?: string
  placeholder?: string
  value?: string
  disabled?: boolean
  required?: boolean
  error?: string
  helperText?: string
  multiple?: boolean
  options: SelectOption[]
  onChange?: (e: Event) => void
  onFocus?: (e: Event) => void
  onBlur?: (e: Event) => void
  class?: string
  id?: string
}

function clsx(...classes: (string | undefined | boolean)[]): string {
  return classes.filter(Boolean).join(' ')
}

export default function Select({
  label,
  placeholder,
  value,
  disabled = false,
  required = false,
  error,
  helperText,
  multiple = false,
  options = [],
  onChange,
  onFocus,
  onBlur,
  class: className = '',
  id,
  ...props
}: SelectProps & Omit<JSX.HTMLAttributes<HTMLSelectElement>, 'size'>) {
  const selectId = id || `select-${Math.random().toString(36).substring(2, 11)}`

  const baseClasses = clsx(
    'w-full appearance-none rounded-xl border transition-colors duration-150',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'bg-white',
  )

  const stateClasses = error
    ? clsx('border-red-500 text-red-900', 'focus:ring-red-500 focus:border-red-500')
    : clsx('border-gray-300 text-gray-900', 'focus:ring-blue-500 focus:border-blue-500', 'hover:border-gray-400')

  const paddingClasses = multiple ? 'px-4 py-2.5 text-sm' : 'pl-4 pr-10 py-2.5 text-sm'

  return (
    <div class="w-full">
      {label && (
        <label for={selectId} class="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span class="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div class="relative">
        <select
          id={selectId}
          value={value}
          disabled={disabled}
          required={required}
          multiple={multiple}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          class={clsx(baseClasses, paddingClasses, stateClasses, className)}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {!multiple && (
          <span class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <svg
              class={clsx('w-4 h-4 text-gray-600', disabled && 'text-gray-400')}
              viewBox="0 0 16 16"
              aria-hidden="true"
              fill="none"
            >
              <path d="M5.75 10.75L8 13L10.25 10.75" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10.25 5.25L8 3L5.75 5.25" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>

      {error && <p class="mt-2 text-sm text-red-600">{error}</p>}

      {helperText && !error && <p class="mt-1 text-sm text-gray-600">{helperText}</p>}
    </div>
  )
}
