import { invoke } from '@tauri-apps/api/core'

// Add a helper to safely check for Tauri environment
const isTauriEnvironment = (): boolean => {
  try {
    return typeof window !== 'undefined' && (
      '__TAURI__' in window ||
      '__TAURI_INTERNALS__' in window ||
      window.location.protocol === 'tauri:' ||
      navigator.userAgent.includes('Tauri')
    )
  } catch {
    return false
  }
}

export interface PrintReceiptItem {
  name: string
  quantity: number
  price: number
  total: number
}

export interface PrintReceiptData {
  title: string
  address: string
  phone: string
  items: PrintReceiptItem[]
  subtotal: number
  tax: number
  taxRate: number
  total: number
  footer: string
  date: string
  time: string
}

export class PrintService {
  static async printThermalReceipt(receiptData: PrintReceiptData): Promise<string> {
    try {
      // Use the helper function to detect Tauri environment
      const isTauriApp = isTauriEnvironment()

      console.log('Print detection - isTauriApp:', isTauriApp)
      console.log('Print detection - window.__TAURI__:', typeof window !== 'undefined' && '__TAURI__' in window)
      console.log('Print detection - protocol:', typeof window !== 'undefined' ? window.location.protocol : 'undefined')
      console.log('Print detection - invoke function:', typeof invoke)
      console.log('Print detection - window keys:', typeof window !== 'undefined' ? Object.keys(window).filter(k => k.includes('TAURI') || k.includes('tauri')) : 'no window')
      console.log('Print detection - user agent:', typeof navigator !== 'undefined' ? navigator.userAgent : 'no navigator')

      // Try to force Tauri invoke first if invoke function is available
      if (typeof invoke === 'function') {
        try {
          // We're in the app - use Tauri invoke
          console.log('Using Tauri invoke for printing')
          const jsonString = JSON.stringify(receiptData)
          console.log('Calling Tauri print command with data:', jsonString.substring(0, 100) + '...')
          
          const response = await invoke('print_thermal_receipt', { receiptData: jsonString })
          console.log('Tauri print response:', response)
          return response as string
        } catch (invokeError: any) {
          console.error('Tauri invoke failed, falling back to clipboard:', invokeError)
          // Re-throw the error if it's a fatal/unrecoverable error to prevent silent failures
          if (invokeError?.message?.includes('fatal') || invokeError?.message?.includes('crash')) {
            throw new Error(`Print service crashed: ${invokeError.message}`)
          }
          // Fall through to clipboard fallback for other errors
        }
      }
      
      // Fallback to clipboard (either invoke not available or invoke failed)
      console.log('Using clipboard fallback for printing')
      const jsonString = JSON.stringify(receiptData)
      
      // Check if clipboard API is available and we have permission
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(jsonString)
        return 'Receipt data copied to clipboard (running in web browser)'
      } else {
        // Fallback for older browsers or non-secure contexts
        let textArea: HTMLTextAreaElement | null = null
        try {
          textArea = document.createElement('textarea')
          textArea.value = jsonString
          textArea.style.position = 'fixed'
          textArea.style.left = '-9999px'
          textArea.style.opacity = '0'
          textArea.setAttribute('readonly', '')
          document.body.appendChild(textArea)
          textArea.select()
          textArea.setSelectionRange(0, 99999) // For mobile devices
          
          const success = document.execCommand('copy')
          
          if (success) {
            return 'Receipt data copied to clipboard (fallback method - running in web browser)'
          } else {
            throw new Error('Failed to copy to clipboard - no clipboard access available')
          }
        } catch (fallbackError) {
          console.error('Clipboard fallback error:', fallbackError)
          throw new Error('Failed to copy to clipboard - clipboard operation failed')
        } finally {
          // Ensure cleanup even if errors occur
          if (textArea && textArea.parentNode) {
            try {
              document.body.removeChild(textArea)
            } catch (cleanupError) {
              console.warn('Failed to cleanup textarea element:', cleanupError)
            }
          }
        }
      }
    } catch (error) {
      console.error('Print service error:', error)
      throw new Error(`Print command failed: ${error}`)
    }
  }

  static formatReceiptData(
    order: any,
    settings: any,
    customTaxRate?: number
  ): PrintReceiptData {
    // Calculate values with custom tax if provided
    const baseSubtotal = order?.subtotal || 0
    const taxRate = customTaxRate !== undefined ? customTaxRate / 100 : (settings?.taxPercentage || 0) / 100
    const taxAmount = baseSubtotal * taxRate
    const total = settings?.taxEnabled ? baseSubtotal + taxAmount : baseSubtotal

    // Format items for receipt
    const formattedItems: PrintReceiptItem[] = order.items?.map((item: any) => ({
      name: item.productName + (item.variant ? ` (${item.variant})` : ''),
      quantity: item.quantity,
      price: item.unitPrice,
      total: item.totalPrice || item.subtotal || (item.unitPrice * item.quantity),
    })) || []

    return {
      title: settings?.name || 'Receipt',
      address: settings?.address || '',
      phone: settings?.phone ? `Phone: ${settings.phone}` : '',
      items: formattedItems,
      subtotal: baseSubtotal,
      tax: taxAmount,
      taxRate: customTaxRate !== undefined ? customTaxRate : (settings?.taxPercentage || 0),
      total: total,
      footer: settings?.receiptFooter || 'Thank you for your purchase!',
      date: new Date(order.createdAt).toLocaleDateString(),
      time: new Date(order.createdAt).toLocaleTimeString(),
    }
  }
}