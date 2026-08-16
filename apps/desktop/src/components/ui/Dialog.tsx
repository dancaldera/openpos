import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { clsx } from '../../lib/utils'
import { registerFullSizeDialog } from '../../stores/ui/dialogStore'
import { Button } from './Button'

interface DialogProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ComponentChildren
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  closeOnOutsideClick?: boolean
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

type DialogKeyboardEvent = Pick<KeyboardEvent, 'key'>

export function handleDialogEscape(event: DialogKeyboardEvent, isOpen: boolean, onClose: () => void) {
  if (event.key === 'Escape' && isOpen) {
    onClose()
  }
}

export function handleDialogOutsideClick(closeOnOutsideClick: boolean, onClose: () => void) {
  if (closeOnOutsideClick) {
    onClose()
  }
}

export function Dialog({ isOpen, onClose, title, children, size = 'md', closeOnOutsideClick = true }: DialogProps) {
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
      handleDialogEscape(e, isOpen, onClose)
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || size !== 'full') return
    return registerFullSizeDialog()
  }, [isOpen, size])

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
        onClick={() => handleDialogOutsideClick(closeOnOutsideClick, onClose)}
        aria-label="Close dialog"
      />

      <div class="pointer-events-none relative z-10 flex min-h-full items-center justify-center p-4">
        <div
          class={clsx(
            'pointer-events-auto relative w-full bg-canvas rounded-cards border border-fog-border shadow-sm',
            'transition-all duration-200 transform',
            isAnimating ? 'scale-100 opacity-100' : 'scale-95 opacity-0',
            sizeClasses[size],
          )}
          role="dialog"
          aria-modal="true"
        >
          {title && (
            <div class="flex items-center justify-between p-6 border-b border-fog-border">
              <h3 class="text-lg font-semibold text-void">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                class="p-2 text-graphite hover:text-void focus:outline-none focus:ring-2 focus:ring-void rounded-buttons"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18 18 6M6 6l12 12" />
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
        <p class="text-graphite">{message}</p>
        <div class="flex justify-end space-x-3">
          <Button variant="secondary" onClick={onClose}>
            {cancelText}
          </Button>
          <Button variant={variant === 'danger' ? 'danger' : 'primary'} onClick={handleConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
