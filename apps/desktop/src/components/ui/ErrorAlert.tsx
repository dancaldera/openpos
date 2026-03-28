import type { ComponentChildren } from 'preact'
import { clsx } from '../../lib/utils'

interface ErrorAlertProps {
  children: ComponentChildren
  class?: string
}

export function ErrorAlert({ children, class: className }: ErrorAlertProps) {
  return (
    <div
      class={clsx(
        'bg-red-500/10 backdrop-blur-sm border border-red-400/20 text-red-700 px-4 py-3 rounded-xl',
        className,
      )}
    >
      <div class="flex items-center">
        <span class="text-red-500 mr-2" aria-hidden="true">
          ⚠️
        </span>
        {children}
      </div>
    </div>
  )
}
