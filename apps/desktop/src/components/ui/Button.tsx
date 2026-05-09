import type { ComponentChildren, JSX } from 'preact'
import { clsx } from '../../lib/utils'

interface ButtonProps {
  children: ComponentChildren
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  onClick?: () => void
  class?: string
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  type = 'button',
  onClick,
  class: className = '',
  ...props
}: ButtonProps & Omit<JSX.HTMLAttributes<HTMLButtonElement>, 'class'>) {
  const baseClasses = clsx(
    // Base layout and interactions
    'inline-flex items-center justify-center rounded-buttons font-medium',
    'border transition-colors duration-150',
    // Focus states
    'focus:outline-none focus:ring-2 focus:ring-void focus:ring-offset-2',
    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
  )

  const variants = {
    primary: clsx('bg-void text-canvas border-void', 'shadow-sm'),
    secondary: clsx('bg-canvas text-void border-fog-border', 'hover:bg-chalk', 'shadow-sm'),
    ghost: clsx('bg-transparent text-void border-transparent', 'hover:bg-chalk'),
    outline: clsx('bg-canvas text-void border-fog-border', 'hover:bg-chalk'),
    danger: clsx('bg-void text-canvas border-void', 'shadow-sm'),
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  }

  const classes = clsx(baseClasses, variants[variant], sizes[size], className)

  return (
    <button type={type} onClick={onClick} disabled={disabled} class={classes} {...props}>
      {children}
    </button>
  )
}
