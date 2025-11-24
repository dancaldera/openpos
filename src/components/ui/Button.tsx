import type { ComponentChildren, JSX } from 'preact'

interface ButtonProps {
  children: ComponentChildren
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  onClick?: () => void
  class?: string
}

function clsx(...classes: (string | undefined | boolean)[]): string {
  return classes.filter(Boolean).join(' ')
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  type = 'button',
  onClick,
  class: className = '',
  ...props
}: ButtonProps & JSX.HTMLAttributes<HTMLButtonElement>) {
  const baseClasses = clsx(
    // Base layout and interactions
    'inline-flex items-center justify-center rounded-xl font-medium',
    'border transition-colors duration-150',
    // Focus states
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
  )

  const variants = {
    primary: clsx(
      'bg-blue-600 text-white border-blue-600',
      'hover:bg-blue-700 hover:border-blue-700',
      'focus:ring-blue-500',
      'shadow-sm hover:shadow-md',
    ),
    secondary: clsx(
      'bg-white text-gray-700 border-gray-300',
      'hover:bg-gray-50 hover:border-gray-400',
      'focus:ring-gray-500',
      'shadow-sm hover:shadow-md',
    ),
    ghost: clsx(
      'bg-transparent text-gray-700 border-transparent',
      'hover:bg-gray-100 hover:text-gray-900',
      'focus:ring-gray-500',
    ),
    outline: clsx(
      'bg-white text-gray-700 border-gray-300',
      'hover:bg-gray-50 hover:border-gray-400',
      'focus:ring-gray-500',
    ),
    danger: clsx(
      'bg-red-500 text-white border-red-500',
      'hover:bg-red-600 hover:border-red-600',
      'focus:ring-red-500',
      'shadow-sm hover:shadow-md',
    ),
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
