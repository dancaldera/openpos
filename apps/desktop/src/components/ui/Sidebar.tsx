import type { ComponentChildren, JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { clsx } from '../../lib/utils'
import { AppLogo } from './AppLogo'

interface SidebarItem {
  id: string
  label: string
  icon: ComponentChildren
  onClick?: () => void
  active?: boolean
  badge?: string | number
}

interface SidebarFooterRenderArgs {
  collapsed: boolean
}

interface SidebarProps {
  items?: SidebarItem[]
  title?: string
  width?: 'sm' | 'md' | 'lg'
  collapsed?: boolean
  onToggleCollapsed?: () => void
  toggleLabel?: string
  mobileOpen?: boolean
  onMobileClose?: () => void
  footer?: ComponentChildren | ((args: SidebarFooterRenderArgs) => ComponentChildren)
  class?: string
  isMac?: boolean
}

export function Sidebar({
  items = [],
  title = 'Titanic POS',
  width = 'md',
  collapsed = false,
  onToggleCollapsed,
  toggleLabel = 'Toggle sidebar',
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

  const navContent = (isMobileDrawer: boolean) => {
    const isCollapsed = collapsed && !isMobileDrawer

    return (
      <>
        {/* Header */}
        <div class={clsx('p-4', isMac && !isMobileDrawer && 'pt-10')}>
          <div class={clsx('flex items-center', isCollapsed ? 'justify-center' : 'justify-between')}>
            <div class={clsx('flex items-center gap-2 min-w-0', isCollapsed && 'justify-center')}>
              <AppLogo class="h-8 w-8 shrink-0" />
              <h1 class={clsx('text-xl font-semibold tracking-[-0.01em] text-void truncate', isCollapsed && 'hidden')}>
                {title}
              </h1>
            </div>
            {isMobileDrawer ? (
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
            ) : (
              onToggleCollapsed && (
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  class={clsx(
                    'shrink-0 rounded-buttons p-2 text-graphite transition-colors hover:bg-chalk hover:text-void',
                    !collapsed && 'ml-auto',
                  )}
                  aria-label={toggleLabel}
                  title={toggleLabel}
                  aria-expanded={!collapsed}
                >
                  {collapsed ? (
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  ) : (
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                    </svg>
                  )}
                </button>
              )
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
                  title={isCollapsed ? item.label : undefined}
                  class={clsx(
                    'flex w-full items-center gap-3 rounded-buttons pr-3 py-2.5 transition-colors duration-200',
                    isMac ? 'pl-[18px]' : 'pl-[14px]',
                    'focus:outline-none focus:ring-2 focus:ring-accent',
                    item.active ? 'bg-accent text-canvas' : 'text-graphite hover:text-void hover:bg-chalk',
                  )}
                >
                  <span class="h-5 w-5 shrink-0">{item.icon}</span>
                  <span
                    class={clsx(
                      'min-w-0 text-left text-sm font-medium whitespace-nowrap',
                      isCollapsed ? 'hidden' : 'flex-1',
                    )}
                  >
                    {item.label}
                  </span>
                  {item.badge && !isCollapsed && (
                    <span class="bg-accent text-canvas text-xs rounded-buttons px-2 py-0.5 min-w-5 text-center">
                      {item.badge}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        {footer && (
          <div class="border-t border-fog-border p-4">
            {typeof footer === 'function' ? footer({ collapsed: isCollapsed }) : footer}
          </div>
        )}
      </>
    )
  }

  const baseColors = 'bg-canvas text-void'
  const collapsedWidth = isMac ? 'w-20' : 'w-[4.5rem]'

  return (
    <>
      {/* Desktop sidebar */}
      <div
        class={clsx(
          collapsed ? collapsedWidth : widths[width],
          baseColors,
          'border-r border-fog-border',
          'hidden md:flex shrink-0 flex-col overflow-visible transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          className,
        )}
        {...props}
      >
        {navContent(false)}
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
            {navContent(true)}
          </div>
        </div>
      )}
    </>
  )
}
