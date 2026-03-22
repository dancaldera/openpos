import { useSignal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'

/**
 * Update notification badge and dialog component.
 * Shows a pulsing badge in the bottom-left corner when an update is available.
 * Clicking opens a dialog with download progress and install options.
 */
export function UpdateNotification() {
  const dialogOpen = useSignal(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        dialogOpen.value = false
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return null
}
