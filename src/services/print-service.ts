import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'
import type { CompanySettings } from './company-settings-turso'
import type { Order, OrderItem } from './orders-turso'

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

export async function printThermalReceipt(receiptData: PrintReceiptData): Promise<string> {
  try {
    const jsonString = JSON.stringify(receiptData)

    if (isDesktop) {
      return requireDesktopApi().printThermalReceipt(jsonString)
    }

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(jsonString)
      return 'Receipt data copied to clipboard (running in web browser)'
    } else {
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
        textArea.setSelectionRange(0, 99999)

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
        if (textArea?.parentNode) {
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

export function formatReceiptData(order: Order, settings: CompanySettings, customTaxRate?: number): PrintReceiptData {
  // Calculate values with custom tax if provided
  const baseSubtotal = order?.subtotal || 0
  const taxRate = customTaxRate !== undefined ? customTaxRate / 100 : (settings?.taxPercentage || 0) / 100
  const taxAmount = baseSubtotal * taxRate
  const total = settings?.taxEnabled ? baseSubtotal + taxAmount : baseSubtotal

  // Format items for receipt
  const formattedItems: PrintReceiptItem[] =
    order.items?.map((item: OrderItem) => ({
      name: item.productName + (item.variant ? ` (${item.variant})` : ''),
      quantity: item.quantity,
      price: item.unitPrice,
      total: item.totalPrice || item.subtotal || item.unitPrice * item.quantity,
    })) || []

  return {
    title: settings?.name || 'Receipt',
    address: settings?.address || '',
    phone: settings?.phone ? `Phone: ${settings.phone}` : '',
    items: formattedItems,
    subtotal: baseSubtotal,
    tax: taxAmount,
    taxRate: customTaxRate !== undefined ? customTaxRate : settings?.taxPercentage || 0,
    total: total,
    footer: settings?.receiptFooter || 'Thank you for your purchase!',
    date: new Date(order.createdAt).toLocaleDateString(),
    time: new Date(order.createdAt).toLocaleTimeString(),
  }
}
