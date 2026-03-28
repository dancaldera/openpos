/**
 * Shared SVG icons for UI components
 */

interface IconProps {
  class?: string
}

export function SpinnerIcon({ class: className }: IconProps) {
  return (
    <svg class={className} fill="none" viewBox="0 0 24 24" role="img" aria-hidden="true">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function ChevronDownIcon({ class: className }: IconProps) {
  return (
    <svg class={className} viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <path d="M5.75 10.75L8 13L10.25 10.75" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.25 5.25L8 3L5.75 5.25" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CloseIcon({ class: className }: IconProps) {
  return (
    <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <title>Close</title>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export function MailIcon({ class: className }: IconProps) {
  return (
    <svg
      class={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

export function ChevronLeftIcon({ class: className }: IconProps) {
  return (
    <svg class={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <title>Toggle sidebar</title>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
}
