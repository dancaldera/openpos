import type { ComponentChildren, JSX } from 'preact'
import { useState } from 'preact/hooks'

interface SidebarItem {
  id: string
  label: string
  icon: string
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
}

function clsx(...classes: (string | undefined | boolean)[]): string {
  return classes.filter(Boolean).join(' ')
}

export default function Sidebar({
  items = [],
  title = 'Titanic POS',
  width = 'md',
  collapsible = false,
  defaultCollapsed = false,
  footer,
  class: className = '',
  ...props
}: SidebarProps & JSX.HTMLAttributes<HTMLDivElement>) {
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
        'bg-gray-900 text-white border-r border-gray-700',
        'flex flex-col transition-all duration-300',
        className,
      )}
      {...props}
    >
      {/* Header */}
      <div class="p-4 border-b border-gray-700">
        <div class="flex items-center justify-between">
          {!isCollapsed && <h1 class="text-xl font-bold text-blue-400">{title}</h1>}
          {collapsible && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              class="p-2 rounded-lg hover:bg-gray-800 transition-colors"
              aria-label="Toggle sidebar"
            >
              <svg
                class={clsx('w-4 h-4 transition-transform', isCollapsed && 'rotate-180')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <title>Toggle sidebar</title>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav class="flex-1 p-4">
        <ul class="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={item.onClick}
                class={clsx(
                  'w-full flex items-center px-3 py-2.5 rounded-lg transition-colors',
                  'hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500',
                  item.active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white',
                  isCollapsed ? 'justify-center' : 'space-x-3',
                )}
              >
                <span class="text-lg">{item.icon}</span>
                {!isCollapsed && (
                  <>
                    <span class="flex-1 text-left font-medium">{item.label}</span>
                    {item.badge && (
                      <span class="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
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
        <div class="p-4 border-t border-gray-700">
          {typeof footer === 'function' ? footer({ isCollapsed }) : footer}
        </div>
      )}
    </div>
  )
}
