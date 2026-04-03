import type { ComponentChildren, JSX } from 'preact'
import { useState } from 'preact/hooks'
import { clsx } from '../../lib/utils'
import { ChevronLeftIcon } from './icons'

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
  collapsible?: boolean
  defaultCollapsed?: boolean
  footer?: ComponentChildren | ((args: { isCollapsed: boolean }) => ComponentChildren)
  class?: string
  isMac?: boolean
}

export function Sidebar({
  items = [],
  title = 'Titanic POS',
  width = 'md',
  collapsible = false,
  defaultCollapsed = false,
  footer,
  class: className = '',
  isMac = false,
  ...props
}: SidebarProps & Omit<JSX.DetailedHTMLProps<JSX.HTMLAttributes<HTMLDivElement>, HTMLDivElement>, 'class'>) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)

  const widths = {
    sm: isCollapsed ? 'w-16' : 'w-48',
    md: isCollapsed ? 'w-16' : 'w-64',
    lg: isCollapsed ? 'w-16' : 'w-80',
  }

  return (
    <div
      class={clsx(
        widths[width],
        isMac ? 'macos-sidebar' : 'bg-gray-900',
        'text-white border-r border-white/10',
        'flex flex-col transition-all duration-300',
        className,
      )}
      {...props}
    >
      {/* Header */}
      <div class={clsx('p-4 border-b border-white/10', isMac && 'pt-10')}>
        <div class="flex items-center justify-between">
          {!isCollapsed && <h1 class="text-xl font-bold text-white/90">{title}</h1>}
          {collapsible && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              class="p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Toggle sidebar"
            >
              <ChevronLeftIcon class={clsx('w-4 h-4 transition-transform', isCollapsed && 'rotate-180')} />
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
                onClick={item.onClick}
                class={clsx(
                  'w-full flex items-center px-3 py-2 rounded-lg transition-colors',
                  'hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20',
                  item.active ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white',
                  isCollapsed ? 'justify-center' : 'gap-3',
                )}
              >
                <span class="w-5 h-5 flex-shrink-0">{item.icon}</span>
                {!isCollapsed && (
                  <>
                    <span class="flex-1 text-left text-sm font-medium">{item.label}</span>
                    {item.badge && (
                      <span class="bg-red-500/80 text-white text-xs rounded-full px-2 py-0.5 min-w-5 text-center">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      {footer && (
        <div class="p-4 border-t border-white/10">
          {typeof footer === 'function' ? footer({ isCollapsed }) : footer}
        </div>
      )}
    </div>
  )
}
