import type { ComponentChildren, JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { clsx } from '../../lib/utils'

interface SidebarItem {
  id: string
  label: string
  icon: ComponentChildren
  onClick?: () => void
  active?: boolean
  badge?: string | number
}

interface SidebarProps {
  items?: SidebarItem[]
  title?: string
  width?: 'sm' | 'md' | 'lg'
  mobileOpen?: boolean
  onMobileClose?: () => void
  footer?: ComponentChildren | ((args: Record<string, never>) => ComponentChildren)
  class?: string
  isMac?: boolean
}

export function Sidebar({
  items = [],
  title = 'Titanic POS',
  width = 'md',
  mobileOpen = false,
  onMobileClose,
  footer,
  class: className = '',
  isMac = false,
  ...props
}: SidebarProps & Omit<JSX.DetailedHTMLProps<JSX.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, 'class'>) {
  const widths = {
    sm: 'w-48',
    md: 'w-64',
    lg: 'w-80',
  }

  useEffect(() => {
    if (!mobileOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mobileOpen, onMobileClose])

  const navContent = () => (
    <>
      {/* Header */}
      <div class={clsx('p-4', isMac && !mobileOpen && 'pt-10')}>
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-semibold tracking-[-0.01em] text-void">{title}</h1>
          {mobileOpen && (
            <button
              type="button"
              onClick={onMobileClose}
              class="ml-auto p-2 rounded-buttons text-graphite hover:text-void hover:bg-chalk transition-colors"
              aria-label="Close menu"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav class="flex-1 p-3">
        <ul class="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  item.onClick?.()
                  onMobileClose?.()
                }}
                class={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-buttons transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-void',
                  item.active ? 'bg-void text-canvas' : 'text-graphite hover:text-void hover:bg-chalk',
                )}
              >
                <span class="w-5 h-5 flex-shrink-0">{item.icon}</span>
                <span class="flex-1 text-left text-sm font-medium">{item.label}</span>
                {item.badge && (
                  <span class="bg-void text-canvas text-xs rounded-buttons px-2 py-0.5 min-w-5 text-center">
                    {item.badge}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      {footer && <div class="p-4 border-t border-fog-border">{typeof footer === 'function' ? footer({}) : footer}</div>}
    </>
  )

  const baseColors = isMac ? 'macos-sidebar text-void' : 'bg-canvas text-void'

  return (
    <>
      {/* Desktop sidebar */}
      <div
        class={clsx(
          widths[width],
          baseColors,
          'border-r border-fog-border',
          'hidden md:flex flex-col transition-all duration-300',
          className,
        )}
        {...props}
      >
        {navContent()}
      </div>

      {/* Mobile overlay + drawer */}
      {mobileOpen && (
        <div class="fixed inset-0 z-40 md:hidden" aria-modal="true" role="dialog">
          <div class="absolute inset-0 bg-void/50 backdrop-blur-sm" onClick={onMobileClose} aria-hidden="true" />
          <div
            class={clsx(
              'absolute left-0 top-0 bottom-0 w-72',
              baseColors,
              'border-r border-fog-border flex flex-col',
              'animate-[slideInLeft_200ms_ease-out]',
            )}
          >
            {navContent()}
          </div>
        </div>
      )}
    </>
  )
}
