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
        <label for={id} class="block text-sm font-medium text-void mb-1.5">
          {label}
          {required && <span class="text-void ml-1">*</span>}
        </label>
      )}
      {children}
      {error && <p class="mt-1.5 text-xs text-void">{error}</p>}
      {helperText && !error && <p class="mt-1 text-xs text-graphite">{helperText}</p>}
    </div>
  )
}
