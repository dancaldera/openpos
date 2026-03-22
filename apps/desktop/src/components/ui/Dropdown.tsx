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
}

export default function Dropdown({ trigger, items, align = 'right' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const alignment = align === 'left' ? 'left-0' : 'right-0'

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
          class={`
            absolute ${alignment} z-50 mt-2 w-48 rounded-md shadow-lg
            bg-white border border-gray-200 focus:outline-none
          `}
          role="menu"
        >
          <div class="py-1">
            {items.map((item) => {
              if (item.separator) {
                return <hr key={item.id} class="my-1 border-gray-200" />
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
                  class={`
                    w-full px-4 py-2 text-left text-sm flex items-center space-x-2
                    hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500
                    ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    ${item.variant === 'danger' ? 'text-red-600 hover:text-red-700' : 'text-gray-700'}
                  `}
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
