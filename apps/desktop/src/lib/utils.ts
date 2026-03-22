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
 * Generate a unique ID for form elements
 * @param prefix - Prefix for the ID (e.g., 'input', 'select')
 * @returns A unique ID string
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 11)}`
}
