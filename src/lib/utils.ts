/**
 * Utility functions shared across UI components
 */

/**
 * Conditionally join class names together
 * Filters out falsy values (undefined, false, empty strings)
 */
export function clsx(...classes: (string | undefined | boolean)[]): string {
  return classes.filter(Boolean).join(' ')
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
