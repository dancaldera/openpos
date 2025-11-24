import { useEffect, useState } from 'preact/hooks'

export function useTouchDetection(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  useEffect(() => {
    // Check if device has touch capabilities
    const hasTouch = () => {
      return (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        !!((navigator as { msMaxTouchPoints?: number }).msMaxTouchPoints || 0)
      )
    }

    // Initial detection
    setIsTouchDevice(hasTouch())

    // Listen for changes (some devices can switch modes)
    const handleResize = () => {
      setIsTouchDevice(hasTouch())
    }

    window.addEventListener('resize', handleResize)

    // Clean up listener
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return isTouchDevice
}
