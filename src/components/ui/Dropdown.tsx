import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

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
}

export default function Dropdown({
  trigger,
  items,
  align = 'right',
  width = 'w-56',
  isOpen: controlledOpen,
  onOpenChange,
}: DropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [dropDirection, setDropDirection] = useState<'down' | 'up'>('down')
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
      calculateDropDirection()
    }
    setIsOpen(!isOpen)
  }

  const closeDropdown = () => {
    setIsOpen(false)
  }

  const calculateDropDirection = () => {
    if (!dropdownRef.current) return

    const rect = dropdownRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const menuHeight = items.length * 40 + 16 // Approximate height: 40px per item + padding
    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top

    // If there's not enough space below but enough above, drop up
    if (spaceBelow < menuHeight && spaceAbove > menuHeight) {
      setDropDirection('up')
    } else {
      setDropDirection('down')
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown()
      }
    }

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDropdown()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscapeKey)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isOpen])

  const handleItemClick = (item: DropdownItem) => {
    if (!item.disabled) {
      item.onClick()
      closeDropdown()
    }
  }

  const getVariantClasses = (variant: DropdownItem['variant'] = 'default') => {
    const baseClasses =
      'w-full text-left px-3 py-2 text-sm rounded-md transition-colors duration-200 flex items-center space-x-2 min-w-0'

    switch (variant) {
      case 'danger':
        return `${baseClasses} text-red-700 hover:bg-red-50 hover:text-red-800 focus:bg-red-50 focus:text-red-800`
      default:
        return `${baseClasses} text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900`
    }
  }

  const alignmentClasses = align === 'left' ? 'left-0' : 'right-0'
  const positionClasses =
    dropDirection === 'up' ? `${alignmentClasses} bottom-full mb-2` : `${alignmentClasses} top-full mt-2`

  return (
    <div class="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={toggleDropdown}
        class="cursor-pointer"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="dropdown-menu"
      >
        {trigger}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          id="dropdown-menu"
          class={`absolute ${positionClasses} ${width} min-w-max bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1`}
          style="animation: fadeIn 0.15s ease-out"
        >
          {items.map((item, index) => (
            <div key={item.id}>
              {item.separator && index > 0 && <div class="border-t border-gray-100 my-1" />}
              <button
                type="button"
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
                class={`${getVariantClasses(item.variant)} ${
                  item.disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1'
                }`}
              >
                {item.icon && <span class="text-base flex-shrink-0">{item.icon}</span>}
                <span class="flex-1 truncate text-left">{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

export { Dropdown }
