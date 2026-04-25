import { describe, expect, it } from 'bun:test'
import type { CompanySettings } from './company-settings-turso'
import type { Order } from './orders-turso'
import { formatReceiptData, renderReceiptHtml, renderReceiptText } from './print-service'

const settings: CompanySettings = {
  id: '1',
  name: 'Caldera Market',
  appName: 'OpenPOS',
  description: '',
  taxEnabled: true,
  taxPercentage: 16,
  currencySymbol: 'MX$',
  language: 'en',
  address: 'Av. Principal 123',
  phone: '555-0100',
  email: 'store@example.com',
  website: 'https://example.com',
  receiptFooter: 'Gracias por su compra',
  createdAt: '2026-04-24T10:00:00.000Z',
  updatedAt: '2026-04-24T10:00:00.000Z',
}

const order: Order = {
  id: 'order-1',
  subtotal: 100,
  tax: 0,
  total: 100,
  status: 'completed',
  paymentMethod: 'cash',
  items: [
    {
      productId: 'product-1',
      productName: 'Cafe molido',
      quantity: 2,
      unitPrice: 50,
      totalPrice: 100,
      subtotal: 100,
    },
  ],
  createdAt: '2026-04-24T10:00:00.000Z',
  updatedAt: '2026-04-24T10:00:00.000Z',
}

describe('print receipt helpers', () => {
  it('builds receipt data from store settings', () => {
    const receipt = formatReceiptData(order, settings)

    expect(receipt.storeInfo).toEqual({
      name: 'Caldera Market',
      appName: 'OpenPOS',
      address: 'Av. Principal 123',
      phone: '555-0100',
      email: 'store@example.com',
      website: 'https://example.com',
      logoUrl: undefined,
    })
    expect(receipt.currencySymbol).toBe('MX$')
    expect(receipt.footer).toBe('Gracias por su compra')
    expect(receipt.total).toBe(116)
  })

  it('renders store information and totals in text and html receipts', () => {
    const receipt = formatReceiptData(order, settings)
    const text = renderReceiptText(receipt)
    const html = renderReceiptHtml(receipt)

    expect(text).toContain('Caldera Market')
    expect(text).toContain('Av. Principal 123')
    expect(text).toContain('Phone: 555-0100')
    expect(text).toContain('MX$116.00')
    expect(text).toContain('Gracias por su compra')

    expect(html).toContain('Caldera Market')
    expect(html).toContain('https://example.com')
    expect(html).toContain('MX$116.00')
  })
})
