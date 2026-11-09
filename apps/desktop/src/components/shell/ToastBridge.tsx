import { useToast } from '@astryxdesign/core/Toast'
import { useEffect } from 'react'
import { registerToastHandler } from '../../lib/toast'

/** Connects `lib/toast` to Astryx toasts. Mount once, inside the Astryx `Theme`. */
export function ToastBridge() {
  const show = useToast()
  useEffect(() => {
    registerToastHandler(show)
    return () => registerToastHandler(null)
  }, [show])
  return null
}
