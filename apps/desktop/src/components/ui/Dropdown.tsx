import type { ComponentChildren, JSX } from 'preact'
import { createPortal } from 'preact/compat'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
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

interface MenuPosition {
  top: number
  left: number
}

const MENU_WIDTH_PX = 192
const MENU_GAP_PX = 8

export function Dropdown({ trigger, items, align = 'right' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const updateMenuPosition = () => {
    const triggerEl = triggerRef.current
    if (!triggerEl) return

    const rect = triggerEl.getBoundingClientRect()
    const left =
      align === 'left'
        ? Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH_PX - 8))
        : Math.max(8, Math.min(rect.right - MENU_WIDTH_PX, window.innerWidth - MENU_WIDTH_PX - 8))

    setMenuPosition({
      top: rect.bottom + MENU_GAP_PX,
      left,
    })
  }

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPosition(null)
      return
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    // Capture scrolls from nested overflow containers (tables, main pane).
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen, align])

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setIsOpen(false)
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isOpen])

  const menu =
    isOpen && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            class={clsx(
              'fixed z-[100] w-48 rounded-cards shadow-sm',
              'bg-canvas border border-fog-border focus:outline-none',
            )}
            style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` } satisfies JSX.CSSProperties}
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
                      'hover:bg-chalk focus:outline-none focus:ring-2 focus:ring-accent',
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
          </div>,
          document.body,
        )
      : null

  return (
    <div class="relative inline-block text-left" ref={triggerRef}>
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
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {trigger}
      </button>
      {menu}
    </div>
  )
}
