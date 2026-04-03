import type { JSX } from 'preact'

interface FormFieldProps {
  id: string
  label?: string
  required?: boolean
  error?: string
  helperText?: string
  children: JSX.Element
}

export function FormField({ id, label, required, error, helperText, children }: FormFieldProps) {
  return (
    <div class="w-full">
      {label && (
        <label for={id} class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          {label}
          {required && <span class="text-red-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && <p class="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {helperText && !error && <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{helperText}</p>}
    </div>
  )
}
