import type { ComponentChildren, JSX } from 'preact'
import { clsx } from '../../lib/utils'

interface FormProps {
  children: ComponentChildren
  onSubmit?: (e: Event) => void
  spacing?: 'sm' | 'md' | 'lg'
  class?: string
}

export function Form({
  children,
  onSubmit,
  spacing = 'md',
  class: className = '',
  ...props
}: FormProps & JSX.HTMLAttributes<HTMLFormElement>) {
  const spacings = {
    sm: 'space-y-3',
    md: 'space-y-4',
    lg: 'space-y-6',
  }

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    onSubmit?.(e)
  }

  return (
    <form class={clsx(spacings[spacing], className)} onSubmit={handleSubmit} {...props}>
      {children}
    </form>
  )
}
