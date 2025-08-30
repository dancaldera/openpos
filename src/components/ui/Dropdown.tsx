import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'

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
  width?: string
  isOpen?: boolean
  onOpenChange?: (isOpen: boolean) => void
  /** Use portal for better positioning in constrained containers like tables */
  usePortal?: boolean
}

export default function Dropdown({
  trigger,
  items,
  align = 'right',
  // width = 'w-56', // Currently unused - could be used for future menu width customization
  isOpen: controlledOpen,
  onOpenChange,
  usePortal = false,
}: DropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [dropDirection, setDropDirection] = useState<'down' | 'up'>('down')
  const [position, setPosition] = useState({ top: 0, left: 0, right: undefined as number | undefined })
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isControlled = controlledOpen !== undefined

  const isOpen = isControlled ? controlledOpen : internalOpen

  const setIsOpen = (open: boolean) => {
    if (isControlled) {
      onOpenChange?.(open)
    } else {
      setInternalOpen(open)
    }
  }

  const toggleDropdown = () => {
    if (!isOpen) {
      // Calculate position before opening
      calculatePosition()
    }
    setIsOpen(!isOpen)
  }

  const closeDropdown = () => {
    setIsOpen(false)
  }

  const calculatePosition = () => {
    if (!dropdownRef.current) return

    const rect = dropdownRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const menuHeight = items.length * 48 + 16 // More accurate height: 48px per item + padding
    const menuWidth = 224 // Approximate width for w-56
    
    // Calculate vertical position
    const spaceBelow = viewportHeight - rect.bottom - 10 // 10px margin
    const spaceAbove = rect.top - 10 // 10px margin
    
    let top = rect.bottom + 8 // 8px offset below
    let direction: 'down' | 'up' = 'down'
    
    // If there's not enough space below but enough above, drop up
    if (spaceBelow < menuHeight && spaceAbove >= menuHeight) {
      top = rect.top - menuHeight - 8 // 8px offset above
      direction = 'up'
    } else if (spaceBelow < menuHeight && spaceAbove < menuHeight) {
      // Not enough space either way - prefer down but adjust height
      top = Math.max(10, Math.min(rect.bottom + 8, viewportHeight - menuHeight - 10))
    }
    
    // Calculate horizontal position
    let left = align === 'left' ? rect.left : rect.right - menuWidth
    let right: number | undefined = undefined
    
    // Ensure menu doesn't go off screen horizontally
    if (left < 10) {
      left = 10
    } else if (left + menuWidth > viewportWidth - 10) {
      left = viewportWidth - menuWidth - 10
    }
    
    setDropDirection(direction)
    setPosition({ top, left, right })
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      // If click is inside the trigger container, ignore
      const clickedInsideTrigger = dropdownRef.current?.contains(target)
      // If using portal and click is inside the menu, ignore
      const clickedInsideMenu = menuRef.current?.contains(target)

      if (!clickedInsideTrigger && !clickedInsideMenu) {
        closeDropdown()
      }
    }

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDropdown()
      }
    }

    const handleScroll = () => {
      if (isOpen && usePortal) {
        calculatePosition()
      }
    }

    const handleResize = () => {
      if (isOpen) {
        calculatePosition()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscapeKey)
      window.addEventListener('scroll', handleScroll, true)
      window.addEventListener('resize', handleResize)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscapeKey)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen, usePortal])

  const handleItemClick = (item: DropdownItem) => {
    if (!item.disabled) {
      item.onClick()
      closeDropdown()
    }
  }

  const getVariantClasses = (variant: DropdownItem['variant'] = 'default') => {
    const baseClasses =
      'w-full text-left px-3 py-3 text-sm rounded-md transition-colors duration-200 flex items-center space-x-2 min-w-0 hover:scale-[1.01]'

    switch (variant) {
      case 'danger':
        return `${baseClasses} text-red-700 hover:bg-red-50 hover:text-red-800 focus:bg-red-50 focus:text-red-800 hover:shadow-sm`
      default:
        return `${baseClasses} text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900 hover:shadow-sm`
    }
  }

  // Menu content component
  const MenuContent = () => (
    <div
      ref={menuRef}
      id="dropdown-menu"
      class={`${
        usePortal ? 'fixed' : 'absolute'
      } bg-white rounded-xl shadow-xl border border-gray-200/80 backdrop-blur-sm z-[99999] py-2 min-w-[200px] max-w-[280px]`}
      style={
        usePortal
          ? {
              top: `${position.top}px`,
              left: `${position.left}px`,
              animation: 'dropdownFadeIn 0.2s ease-out',
              maxHeight: '320px',
              overflowY: 'auto',
            }
          : {
              animation: 'dropdownFadeIn 0.2s ease-out',
              maxHeight: '320px',
              overflowY: 'auto',
              [align === 'left' ? 'left' : 'right']: '0',
              [dropDirection === 'up' ? 'bottom' : 'top']: '100%',
              [dropDirection === 'up' ? 'marginBottom' : 'marginTop']: '8px',
            }
      }
    >
      {items.map((item, index) => (
        <div key={item.id}>
          {item.separator && index > 0 && <div class="border-t border-gray-100 my-1 mx-2" />}
          <button
            type="button"
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            class={`${getVariantClasses(item.variant)} ${
              item.disabled
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-1'
            } mx-2`}
          >
            {item.icon && <span class="text-base flex-shrink-0 w-5 text-center">{item.icon}</span>}
            <span class="flex-1 truncate text-left font-medium">{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  )

  // alignmentClasses and positionClasses removed - using portal positioning instead

  return (
    <>
      <div class="relative inline-block" ref={dropdownRef}>
        <button
          type="button"
          onClick={toggleDropdown}
          class="cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-1 rounded-md transition-all duration-200"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls="dropdown-menu"
        >
          {trigger}
        </button>

        {isOpen && !usePortal && <MenuContent />}
      </div>

      {isOpen && usePortal && typeof document !== 'undefined' && createPortal(<MenuContent />, document.body)}

      <style jsx>{`
        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  )
}

export { Dropdown }
