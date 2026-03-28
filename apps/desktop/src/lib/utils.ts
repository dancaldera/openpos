/**
 * Utility functions shared across UI components
 */

type SignalLike<T> = {
  value: T
  peek(): T
}

/**
 * Conditionally join class names together
 * Filters out falsy values (undefined, false, empty strings)
 * Handles Preact signals by unwrapping them
 */
export function clsx(...classes: (string | undefined | boolean | SignalLike<string | undefined>)[]): string {
  return classes
    .map((c) => {
      if (c && typeof c === 'object' && 'value' in c) {
        return c.value
      }
      return c
    })
    .filter(Boolean)
    .join(' ')
}

/**
 * Common focus ring classes for form elements and buttons
 */
export const focusRingClasses = 'focus:outline-none focus:ring-2 focus:ring-offset-2'

/**
 * Common disabled state classes
 */
export const disabledClasses = 'opacity-50 cursor-not-allowed'

/**
 * Base classes shared by Input, Textarea, Select
 */
export function inputBaseClasses(disabled: boolean): string {
  return clsx(
    'w-full rounded-xl border transition-colors duration-150',
    focusRingClasses,
    disabled ? clsx(disabledClasses, 'bg-gray-100') : 'bg-white',
  )
}

/**
 * Error/normal state classes for form inputs
 */
export function inputStateClasses(error?: string): string {
  return error
    ? clsx('border-red-500 text-red-900 placeholder-red-300', 'focus:ring-red-500 focus:border-red-500')
    : clsx(
        'border-gray-300 text-gray-900 placeholder-gray-500',
        'focus:ring-blue-500 focus:border-blue-500',
        'hover:border-gray-400',
      )
}

/**
 * Standard icon wrapper classes for input icons
 */
export const iconWrapperClasses = 'flex items-center justify-center [&>svg]:w-full [&>svg]:h-full'

/**
 * Generate a unique ID for form elements
 * @param prefix - Prefix for the ID (e.g., 'input', 'select')
 * @returns A unique ID string
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Format a timestamp as relative time (e.g., "5m ago", "just now")
 */
export function formatRelativeTime(timestamp?: string): string {
  if (!timestamp) return 'not yet'

  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) return 'not yet'

  const diff = Math.floor((Date.now() - parsed) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}
