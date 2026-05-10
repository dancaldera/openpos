import { describe, expect, it } from 'bun:test'
import { APP_VERSION } from '../lib/app-version'
import type { CompanySettings } from './company-settings-turso'
import type { Order } from './orders-turso'
import { formatReceiptData, RECEIPT_APP_PHONE, renderReceiptHtml, renderReceiptText } from './print-service'

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
    expect(receipt.supportPhone).toBe(RECEIPT_APP_PHONE)
    expect(receipt.orderId).not.toBe(order.id)
    expect(receipt.orderId).toBe(btoa(order.id).replace(/=+$/, '').slice(0, 8))
  })

  it('renders store information and totals in text and html receipts', () => {
    const receipt = formatReceiptData(order, settings)
    const text = renderReceiptText(receipt)
    const html = renderReceiptHtml(receipt)

    expect(text).toContain('Caldera Market')
    expect(text).toContain('Av. Principal 123')
    expect(text).toContain('555-0100')
    expect(text).toContain('MX$116.00')
    expect(text).toContain('Gracias por su compra')
    expect(text).toContain(`OpenPOS | Version ${APP_VERSION}`)
    expect(text).toContain('Support: +523322633323')
    expect(text).toContain('ITEM')
    expect(text).toContain('QTY')
    expect(text).toContain('TOTAL')

    expect(html).toContain('Caldera Market')
    expect(html).not.toContain('<div>OpenPOS</div>')
    expect(html).toContain('https://example.com')
    expect(html).toContain('MX$116.00')
    expect(html).toContain(RECEIPT_APP_PHONE)
    expect(html).toContain('app-footer')
    expect(html).toContain('ITEM')
    expect(html).toContain('QTY')
    expect(html).toContain('TOTAL')
  })

  it('hides subtotal and tax when taxes are disabled', () => {
    const noTaxSettings = { ...settings, taxEnabled: false }
    const receipt = formatReceiptData(order, noTaxSettings)
    const text = renderReceiptText(receipt)
    const html = renderReceiptHtml(receipt)

    expect(receipt.taxEnabled).toBe(false)
    expect(text).not.toContain('Subtotal')
    expect(text).not.toContain('Tax')
    expect(text).toContain('Total')
    expect(text).toContain('MX$100.00')

    expect(html).not.toContain('<td>Subtotal</td>')
    expect(html).not.toContain('Tax')
    expect(html).toContain('<td>Total</td>')
    expect(html).toContain('MX$100.00')
  })
})
