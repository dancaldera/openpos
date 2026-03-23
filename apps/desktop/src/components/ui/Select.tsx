import type { JSX } from 'preact'
import { clsx, generateId } from '../../lib/utils'
import { FormField } from './FormField'
import { ChevronDownIcon } from './icons'

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

export function Select({
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
  const selectId = id || generateId('select')

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
    <FormField id={selectId} label={label} required={required} error={error} helperText={helperText}>
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
            <ChevronDownIcon class={clsx('w-4 h-4', disabled ? 'text-gray-400' : 'text-gray-600')} />
          </span>
        )}
      </div>
    </FormField>
  )
}
