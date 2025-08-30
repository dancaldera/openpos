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

interface DialogHeaderProps {
  children: ComponentChildren
  onClose?: () => void
}

interface DialogBodyProps {
  children: ComponentChildren
}

interface DialogFooterProps {
  children: ComponentChildren
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

function DialogHeader({ children, onClose }: DialogHeaderProps) {
  return (
    <div class="flex items-center justify-between p-6 border-b-2 border-gray-300">
      <h3 class="text-lg font-semibold text-gray-800">{children}</h3>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          class="p-2 text-gray-600 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 hover:border-gray-400 hover:text-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            role="img"
            aria-label="Close dialog"
          >
            <title>Close</title>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

function DialogBody({ children }: DialogBodyProps) {
  return <div class="p-6 max-h-[70vh] overflow-y-auto">{children}</div>
}

function DialogFooter({ children }: DialogFooterProps) {
  return <div class="flex justify-end space-x-3 p-6 border-t-2 border-gray-300">{children}</div>
}

function Dialog({ isOpen, onClose, title, children, size = 'md' }: DialogProps) {
  // Keep the dialog mounted for close animation
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      // Small delay to trigger animation after mounting
      const timeout = setTimeout(() => setIsAnimating(true), 10)
      return () => clearTimeout(timeout)
    }

    // Start close animation
    setIsAnimating(false)
    // Unmount after animation completes
    const timeout = setTimeout(() => setShouldRender(false), 300)
    return () => clearTimeout(timeout)
  }, [isOpen])

  // Handle escape key to close dialog
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-[95vw] max-h-[95vh]',
  }

  if (!shouldRender) return null

  const handleOverlayClick = (e: any) => {
    // Only close if clicking the overlay itself, not child elements
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div 
      class={clsx('fixed inset-0 z-50 overflow-y-auto', isAnimating ? 'opacity-100' : 'opacity-0')}
      onClick={handleOverlayClick}
    >
      <div 
        class={clsx(
          'absolute inset-0',
          // Opaque overlay without transparency or blur
          'bg-black transition-all duration-300 ease-out',
        )}
        aria-label="Close dialog"
      />

      <div class="relative z-10 flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div
          class={clsx(
            // Opaque dialog card without transparency or blur
            'relative w-full bg-white border-2 border-gray-300 rounded-2xl shadow-2xl',
            'transition-all duration-300 ease-out transform will-change-transform will-change-opacity',
            'my-8 overflow-hidden text-left align-middle sm:my-8',
            isAnimating ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4',
            sizeClasses[size],
          )}
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          {title && <DialogHeader onClose={onClose}>{title}</DialogHeader>}
          {children}
        </div>
      </div>
    </div>
  )
}

function DialogConfirm({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
}: DialogConfirmProps) {
  if (!isOpen) return null

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <DialogBody>
        <div class="p-4 bg-gray-50 border-2 border-gray-300 rounded-lg">
          <p class="text-gray-700 leading-relaxed">{message}</p>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {cancelText}
        </Button>
        <Button variant={variant} onClick={onConfirm}>
          {confirmText}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

export default Dialog
export { DialogHeader, DialogBody, DialogFooter, DialogConfirm }
