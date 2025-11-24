import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import Button from './Button'

interface DialogProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ComponentChildren
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

interface DialogConfirmProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'primary'
}

function clsx(...classes: (string | undefined | boolean)[]): string {
  return classes.filter(Boolean).join(' ')
}

export default function Dialog({ isOpen, onClose, title, children, size = 'md' }: DialogProps) {
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true)
    } else {
      setIsAnimating(false)
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full',
  }

  return (
    <div class="fixed inset-0 z-50 overflow-y-auto">
      <button
        type="button"
        class={clsx(
          'fixed inset-0 bg-black/50 transition-opacity duration-200',
          isAnimating ? 'opacity-100' : 'opacity-0',
          'border-0 p-0 cursor-pointer',
        )}
        onClick={onClose}
        aria-label="Close dialog"
      />

      <div class="relative z-10 flex min-h-full items-center justify-center p-4">
        <div
          class={clsx(
            'relative w-full bg-white rounded-lg shadow-xl',
            'transition-all duration-200 transform',
            isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
            sizeClasses[size],
          )}
          role="dialog"
          aria-modal="true"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onClose()
            }
          }}
        >
          {title && (
            <div class="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 class="text-lg font-semibold text-gray-900">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                class="p-2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <title>Close</title>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          <div class="p-6">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function DialogConfirm({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
}: DialogConfirmProps) {
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div class="space-y-4">
        <p class="text-gray-700">{message}</p>
        <div class="flex justify-end space-x-3">
          <Button variant="secondary" onClick={onClose}>
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'primary' : 'primary'}
            onClick={handleConfirm}
            class={variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : ''}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
