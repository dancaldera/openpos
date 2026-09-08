import type { ComponentChildren } from 'preact'
import { clsx } from '../../lib/utils'

interface ErrorAlertProps {
  children: ComponentChildren
  class?: string
}

export function ErrorAlert({ children, class: className }: ErrorAlertProps) {
  return (
    <div class={clsx('bg-chalk border border-fog-border text-void px-4 py-3 rounded-cards', className)}>
      <div class="flex items-center">
        <span class="text-void mr-2" aria-hidden="true">
          !
        </span>
        {children}
      </div>
    </div>
  )
}
