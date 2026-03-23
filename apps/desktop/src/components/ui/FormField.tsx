import type { JSX } from 'preact'

interface FormFieldProps {
  id: string
  label?: string
  required?: boolean
  error?: string
  helperText?: string
  children: JSX.Element
}

/**
 * Shared wrapper for form fields with label, error, and helper text
 */
export function FormField({ id, label, required, error, helperText, children }: FormFieldProps) {
  return (
    <div class="w-full">
      {label && (
        <label for={id} class="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span class="text-red-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && <p class="mt-2 text-sm text-red-600">{error}</p>}
      {helperText && !error && <p class="mt-1 text-sm text-gray-600">{helperText}</p>}
    </div>
  )
}
