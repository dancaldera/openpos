import type { JSX } from 'preact'
import { clsx, generateId, inputBaseClasses, inputStateClasses } from '../../lib/utils'
import { FormField } from './FormField'

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

export function Textarea({
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
  const textareaId = id || generateId('textarea')

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base',
  } as const

  const classes = clsx(inputBaseClasses(disabled), 'resize-vertical', sizes[size], inputStateClasses(error), className)

  return (
    <FormField id={textareaId} label={label} required={required} error={error} helperText={helperText}>
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
    </FormField>
  )
}
