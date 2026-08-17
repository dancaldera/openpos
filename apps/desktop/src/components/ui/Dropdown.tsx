import type { ComponentChildren } from 'preact'
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

// Matches Tailwind `w-48` and `mt-2` so the fixed menu lines up with the trigger.
const MENU_WIDTH = 192
const MENU_GAP = 8
const VIEWPORT_MARGIN = 8

export function Dropdown({ trigger, items, align = 'right' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // The menu is rendered in a portal with `position: fixed` so it is never
  // clipped by an ancestor's `overflow` (e.g. the scrollable table container).
  const updatePosition = () => {
    const triggerEl = triggerRef.current
    if (!triggerEl) {
      return
    }

    const rect = triggerEl.getBoundingClientRect()
    const rawLeft = align === 'left' ? rect.left : rect.right - MENU_WIDTH
    const maxLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN
    const left = Math.max(VIEWPORT_MARGIN, Math.min(rawLeft, maxLeft))

    let top = rect.bottom + MENU_GAP
    const menuHeight = menuRef.current?.offsetHeight ?? 0
    if (menuHeight > 0 && top + menuHeight > window.innerHeight - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, window.innerHeight - menuHeight - VIEWPORT_MARGIN)
    }

    setPosition({ top, left })
  }

  useLayoutEffect(() => {
    if (!isOpen) {
      return
    }

    updatePosition()

    const handleReposition = () => updatePosition()
    // Capture phase so scrolling inside any container (not just the window) repositions the menu.
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)

    return () => {
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [isOpen, align])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setIsOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const menu = createPortal(
    <div
      ref={menuRef}
      class="fixed z-50 w-48 rounded-cards shadow-sm bg-canvas border border-fog-border focus:outline-none"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
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
    </div>,
    document.body,
  )

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
      >
        {trigger}
      </button>

      {isOpen && menu}
    </div>
  )
}
