import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { useClickOutside } from '../../hooks/useClickOutside'
import { clsx } from '../../lib/utils'

export interface DropdownItem {
  id: string
  label: string
  icon?: string
  onClick: () => void
  variant?: 'default' | 'danger'
  disabled?: boolean
  separator?: boolean
}

interface DropdownProps {
  trigger: ComponentChildren
  items: DropdownItem[]
  align?: 'left' | 'right'
}

export function Dropdown({ trigger, items, align = 'right' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  useClickOutside(dropdownRef, () => setIsOpen(false))

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <div class="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsOpen(!isOpen)
          }
        }}
        class="bg-transparent border-0 p-0 cursor-pointer"
      >
        {trigger}
      </button>

      {isOpen && (
        <div
          class={clsx(
            'absolute z-50 mt-2 w-48 rounded-cards shadow-sm',
            'bg-canvas border border-fog-border focus:outline-none',
            align === 'left' ? 'left-0' : 'right-0',
          )}
          role="menu"
        >
          <div class="py-1">
            {items.map((item) => {
              if (item.separator) {
                return <hr key={item.id} class="my-1 border-fog-border" />
              }

              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    if (!item.disabled) {
                      item.onClick()
                      setIsOpen(false)
                    }
                  }}
                  disabled={item.disabled}
                  class={clsx(
                    'w-full px-4 py-2 text-left text-sm flex items-center space-x-2',
                    'hover:bg-chalk focus:outline-none focus:ring-2 focus:ring-void',
                    item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                    item.variant === 'danger' ? 'text-void' : 'text-graphite',
                  )}
                  role="menuitem"
                >
                  {item.icon && <span>{item.icon}</span>}
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
