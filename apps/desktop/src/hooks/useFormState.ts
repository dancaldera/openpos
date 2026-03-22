import { useCallback, useState } from 'preact/hooks'

export type ValidationRule<T> = {
  required?: boolean
  validate?: (value: T[keyof T]) => string | undefined
  pattern?: RegExp
  min?: number
  max?: number
}

export type ValidationRules<T> = {
  [K in keyof T]?: ValidationRule<T>
}

export type FormErrors<T> = Partial<Record<keyof T, string>>

/**
 * Generic form state management hook.
 * Handles form data, validation, errors, and common form operations.
 *
 * @template T - The shape of the form data
 * @param initialValues - Initial form values
 * @param validationRules - Optional validation rules for each field
 *
 * @example
 * ```tsx
 * interface CustomerForm {
 *   firstName: string
 *   lastName: string
 *   email: string
 * }
 *
 * const {
 *   formData,
 *   errors,
 *   handleChange,
 *   validate,
 *   reset,
 *   setFieldValue
 * } = useFormState<CustomerForm>(
 *   { firstName: '', lastName: '', email: '' },
 *   {
 *     firstName: { required: true },
 *     lastName: { required: true },
 *     email: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }
 *   }
 * )
 * ```
 */
export function useFormState<T extends Record<string, unknown>>(
  initialValues: T,
  validationRules?: ValidationRules<T>,
) {
  const [formData, setFormData] = useState<T>(initialValues)
  const [errors, setErrors] = useState<FormErrors<T>>({})
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({})

  /**
   * Reset form to initial values and clear errors.
   */
  const reset = useCallback(() => {
    setFormData(initialValues)
    setErrors({})
    setTouched({})
  }, [initialValues])

  /**
   * Set the entire form data at once.
   */
  const setFormDataValues = useCallback((data: T) => {
    setFormData(data)
  }, [])

  /**
   * Set a single field value.
   */
  const setFieldValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    // Clear error when field is modified
    setErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[field]
      return newErrors
    })
  }, [])

  /**
   * Handle input change events.
   * Works with HTML input elements.
   */
  const handleChange = useCallback(
    (field: keyof T) => (e: Event) => {
      const target = e.target as HTMLInputElement
      const value = target.type === 'checkbox' ? (target.checked as T[keyof T]) : (target.value as T[keyof T])
      setFieldValue(field, value)
      setTouched((prev) => ({ ...prev, [field]: true }))
    },
    [setFieldValue],
  )

  /**
   * Validate a single field.
   */
  const validateField = useCallback(
    (field: keyof T): string | undefined => {
      if (!validationRules || !validationRules[field]) {
        return undefined
      }

      const rules = validationRules[field]
      if (!rules) return undefined
      const value = formData[field]

      // Required validation
      if (rules.required) {
        if (value === undefined || value === null || value === '') {
          return `${String(field)} is required`
        }
      }

      // Pattern validation (for strings)
      if (rules.pattern && typeof value === 'string') {
        if (!rules.pattern.test(value)) {
          return `${String(field)} format is invalid`
        }
      }

      // Min validation (for numbers)
      if (rules.min !== undefined && typeof value === 'number') {
        if (value < rules.min) {
          return `${String(field)} must be at least ${rules.min}`
        }
      }

      // Max validation (for numbers)
      if (rules.max !== undefined && typeof value === 'number') {
        if (value > rules.max) {
          return `${String(field)} must be at most ${rules.max}`
        }
      }

      // Custom validation
      if (rules.validate) {
        return rules.validate(value)
      }

      return undefined
    },
    [formData, validationRules],
  )

  /**
   * Validate all form fields.
   * Returns true if all validations pass.
   */
  const validate = useCallback((): boolean => {
    if (!validationRules) {
      return true
    }

    const newErrors: FormErrors<T> = {}
    let isValid = true

    Object.keys(validationRules).forEach((key) => {
      const field = key as keyof T
      const error = validateField(field)
      if (error) {
        newErrors[field] = error
        isValid = false
      }
    })

    setErrors(newErrors)
    return isValid
  }, [validationRules, validateField])

  /**
   * Validate a specific field and update errors.
   */
  const validateAndSetError = useCallback(
    (field: keyof T): boolean => {
      const error = validateField(field)
      setErrors((prev) => {
        if (error) {
          return { ...prev, [field]: error }
        }
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
      return !error
    },
    [validateField],
  )

  /**
   * Check if form has any errors.
   */
  const hasErrors = Object.keys(errors).length > 0

  return {
    formData,
    setFormData: setFormDataValues,
    setFieldValue,
    errors,
    setErrors,
    touched,
    handleChange,
    reset,
    validate,
    validateField,
    validateAndSetError,
    hasErrors,
  }
}

/**
 * Type-safe form change handler for selects.
 * Useful for dropdown/select elements.
 */
export function createSelectChangeHandler<T>(onChange: (value: T) => void) {
  return (e: Event) => {
    const target = e.target as HTMLSelectElement
    onChange(target.value as T)
  }
}

/**
 * Type-safe checkbox change handler.
 */
export function createCheckboxChangeHandler(onChange: (checked: boolean) => void) {
  return (e: Event) => {
    const target = e.target as HTMLInputElement
    onChange(target.checked)
  }
}
