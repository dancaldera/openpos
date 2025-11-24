import type { ComponentChildren, JSX } from 'preact'

interface FormProps {
  children: ComponentChildren
  onSubmit?: (e: Event) => void
  spacing?: 'sm' | 'md' | 'lg'
  class?: string
}

export default function Form({
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
    <form class={`${spacings[spacing]} ${className}`.trim()} onSubmit={handleSubmit} {...props}>
      {children}
    </form>
  )
}
