/**
 * Shared SVG icons for UI components
 */

interface IconProps {
  class?: string
  'aria-label'?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

export function SpinnerIcon({ class: className, ...props }: IconProps) {
  return (
    <svg class={className} fill="none" viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function ChevronDownIcon({ class: className, ...props }: IconProps) {
  return (
    <svg class={className} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" {...props}>
      <path d="M5.75 10.75L8 13L10.25 10.75" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.25 5.25L8 3L5.75 5.25" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CloseIcon({ class: className, ...props }: IconProps) {
  return (
    <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export function MailIcon({ class: className, ...props }: IconProps) {
  return (
    <svg
      class={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

export function ChevronLeftIcon({ class: className, ...props }: IconProps) {
  return (
    <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
}

export function EyeIcon({ class: className, 'aria-label': ariaLabel, ...props }: IconProps) {
  return (
    <svg
      class={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ariaLabel}
      {...props}
    >
      <title>{ariaLabel ?? 'Show'}</title>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EyeOffIcon({ class: className, 'aria-label': ariaLabel, ...props }: IconProps) {
  return (
    <svg
      class={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={ariaLabel}
      {...props}
    >
      <title>{ariaLabel ?? 'Hide'}</title>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  )
}
