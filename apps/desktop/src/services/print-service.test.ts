import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_VERSION } from '../lib/app-version'
import type { CompanySettings } from './company-settings-turso'
import type { Order } from './orders-turso'
import {
  formatReceiptAppFooter,
  formatReceiptData,
  printThermalReceipt,
  RECEIPT_APP_PHONE,
  renderReceiptHtml,
  renderReceiptText,
} from './print-service'

const settings: CompanySettings = {
  id: '1',
  name: 'Caldera Market',
  appName: 'OpenPOS',
  description: 'Tienda de abarrotes',
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
      description: 'Tienda de abarrotes',
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
    expect(receipt.orderId).toBe(btoa(order.id).replace(/=+$/, '').replace(/[+/]/g, '').slice(0, 8).toUpperCase())
    expect(receipt.supportLabel).toBe('WhatsApp Sales/Support Point of Sale')
  })

  it('renders store information and totals in text and html receipts', () => {
    const receipt = formatReceiptData(order, settings)
    const text = renderReceiptText(receipt)
    const html = renderReceiptHtml(receipt)

    expect(text).toContain('Caldera Market')
    expect(text).toContain('Tienda de abarrotes')
    expect(text).toContain('Caldera Market — Tienda de abarrotes')
    expect(text).toContain('Av. Principal 123')
    expect(text).toContain('555-0100')
    expect(text).toContain('MX$116.00')
    expect(text).toContain('Gracias por su compra')
    expect(text).toContain(`OpenPOS | Version ${APP_VERSION}`)
    expect(text).toContain('WhatsApp Sales/Support Point of Sale')
    expect(text).toContain('+523322633323')
    expect(text).not.toContain('Ref:')
    expect(text).not.toContain('Order:')
    expect(text).toContain('ITEM')
    expect(text).toContain('QTY')
    expect(text).toContain('TOTAL')

    expect(html).toContain('Caldera Market')
    expect(html).toContain('Tienda de abarrotes')
    expect(html).toContain('Caldera Market')
    expect(html).toContain('store-desc')
    expect(html).not.toContain('<div>OpenPOS</div>')
    expect(html).toContain('https://example.com')
    expect(html).toContain('MX$116.00')
    expect(html).toContain(RECEIPT_APP_PHONE)
    expect(html).toContain('app-footer')
    expect(html).toContain('ITEM')
    expect(html).toContain('QTY')
    expect(html).toContain('TOTAL')
  })

  it('formats the app footer with defaults and overrides', () => {
    expect(formatReceiptAppFooter()).toBe(
      `OpenPOS | Version ${APP_VERSION}\nWhatsApp Sales/Support Point of Sale\n${RECEIPT_APP_PHONE}`,
    )
    expect(formatReceiptAppFooter('Tienda', 'Versión', 'Soporte', '123')).toBe(
      `Tienda | Versión ${APP_VERSION}\nSoporte\n123`,
    )
  })

  it('falls back to a sliced order id when base64 encoding fails', () => {
    vi.stubGlobal('btoa', () => {
      throw new Error('no btoa')
    })
    try {
      const receipt = formatReceiptData(order, settings)
      expect(receipt.orderId).toBe('ORDER-1')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('builds receipt data with custom tax and sparse settings', () => {
    const sparse = {} as unknown as CompanySettings
    const receipt = formatReceiptData(order, sparse)

    expect(receipt.title).toBe('Receipt')
    expect(receipt.storeInfo).toMatchObject({ name: 'Store', appName: 'OpenPOS' })
    expect(receipt.currencySymbol).toBe('$')
    expect(receipt.tax).toBe(0)
    expect(receipt.total).toBe(100)
    expect(receipt.taxRate).toBe(0)
    expect(receipt.footer).toBe('Thank you for your purchase!')
    expect(receipt.taxEnabled).toBe(false)

    const customTax = formatReceiptData(order, settings, 10, 'Pie personalizado')

    expect(customTax.tax).toBe(10)
    expect(customTax.total).toBe(110)
    expect(customTax.taxRate).toBe(10)

    const noFooter = formatReceiptData(order, sparse, undefined, 'Solo pie')

    expect(noFooter.footer).toBe('Solo pie')
    expect(noFooter.footerLabel).toBe('Solo pie')
  })

  it('formats items with variants and fallback totals', () => {
    const variantOrder: Order = {
      ...order,
      subtotal: 0,
      items: [
        {
          productId: 'p1',
          productName: 'Cafe',
          quantity: 1,
          unitPrice: 30,
          totalPrice: 0,
          subtotal: 30,
          variant: 'Grande',
        },
        {
          productId: 'p2',
          productName: 'Pan',
          quantity: 3,
          unitPrice: 10,
          totalPrice: 0,
        },
      ],
    }

    const receipt = formatReceiptData(variantOrder, settings)

    expect(receipt.items[0]).toMatchObject({ name: 'Cafe (Grande)', total: 30 })
    expect(receipt.items[1]).toMatchObject({ name: 'Pan', total: 30 })
    expect(receipt.subtotal).toBe(0)

    const noItems = formatReceiptData({ ...order, items: undefined } as unknown as Order, settings)

    expect(noItems.items).toEqual([])
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

  it('renders custom labels, truncated rows, and footer fallbacks in text', () => {
    const receipt = formatReceiptData(order, settings)
    const longName = 'Cafe molido en grano de altura premium tostado oscuro'
    const custom = {
      ...receipt,
      itemLabel: 'Artículo',
      qtyLabel: 'Cant',
      totalLabel: 'Importe',
      subtotalLabel: 'Sub',
      taxLabel: 'IVA',
      date: '',
      time: '',
      footer: '',
      footerLabel: 'Vuelva pronto',
      storeInfo: { ...receipt.storeInfo, description: undefined, address: undefined },
      items: [{ name: longName, quantity: 1, price: 10, total: 10 }],
    }

    const text = renderReceiptText(custom, 30)

    expect(text).toContain('ARTÍCULO')
    expect(text).toContain('CANT')
    expect(text).toContain('IMPORTE')
    expect(text).toContain('Sub')
    expect(text).toContain('IVA (16%)')
    expect(text).toContain('Vuelva pronto')
    expect(text).toContain('...')
    expect(text).not.toContain('Av. Principal 123')

    const noTaxRate = renderReceiptText({ ...receipt, taxRate: 0 })

    expect(noTaxRate).toContain('Subtotal')
    expect(noTaxRate).not.toContain('Tax')

    const bare = renderReceiptText({ ...receipt, footer: '', footerLabel: undefined, date: '', time: '' })

    expect(bare).toContain('Thank you for your purchase!')
  })

  it('renders text receipts with sparse store info and title fallbacks', () => {
    const receipt = formatReceiptData(order, settings)
    const sparse = {
      ...receipt,
      storeInfo: { name: 'Solo', appName: 'OpenPOS' },
      items: [{ name: 'Cafe', quantity: 1, price: 10, total: 0 }],
      subtotal: 0,
      tax: 0,
      total: 0,
      date: '',
      time: '',
    }

    const text = renderReceiptText(sparse)

    expect(text).toContain('Solo')
    expect(text).toContain('$0.00')
    expect(text).not.toContain('Av. Principal 123')
    expect(text).not.toContain('555-0100')
    expect(text).not.toContain('store@example.com')
    expect(text).not.toContain('https://example.com')

    const titled = renderReceiptText({ ...sparse, storeInfo: { name: '', appName: 'OpenPOS' } })

    expect(titled).toContain('Caldera Market')

    const untitled = renderReceiptText({ ...sparse, title: '', storeInfo: { name: '', appName: 'OpenPOS' } })

    expect(untitled).toContain('Receipt')
  })

  it('renders minimal receipts and escapes html', () => {
    const receipt = formatReceiptData(order, settings)
    const tricky = {
      ...receipt,
      title: 'R <ece> "ipt" & \'Co\'',
      storeInfo: {
        ...receipt.storeInfo,
        name: '',
        description: undefined,
        address: undefined,
        phone: undefined,
        email: undefined,
        website: undefined,
      },
      items: [{ name: '<b>Cafe</b>', quantity: 1, price: 10, total: 10 }],
      footer: '',
      supportLabel: undefined,
      supportPhone: undefined,
    }

    const html = renderReceiptHtml(tricky)

    expect(html).toContain('R &lt;ece&gt; &quot;ipt&quot; &amp; &#039;Co&#039;')
    expect(html).toContain('&lt;b&gt;Cafe&lt;/b&gt;')
    expect(html).toContain('WhatsApp Sales/Support Point of Sale')
    expect(html).toContain(RECEIPT_APP_PHONE)
    expect(html).not.toContain('<div class="footer">')

    const taxFree = renderReceiptHtml({ ...receipt, taxEnabled: false, taxRate: 0 })

    expect(taxFree).not.toContain('Subtotal')
    expect(taxFree).toContain('Total')
  })

  it('falls back to default app version labels and empty values in html', () => {
    const receipt = formatReceiptData(order, settings)
    const html = renderReceiptHtml({
      ...receipt,
      appVersionLabel: undefined,
      items: [{ name: undefined as unknown as string, quantity: 1, price: 5, total: 5 }],
    })

    expect(html).toContain(`Version ${APP_VERSION}`)
    expect(html).toContain('<td class="qty">1</td>')
  })
})

interface FakeFrame {
  style: Record<string, string>
  onload: (() => void) | null
  onerror: (() => void) | null
  contentWindow: { focus: () => void; print: () => void } | null
  contentDocument: { open: () => void; write: (html: string) => void; close: () => void } | null
  remove: () => void
}

function installFakeDom(frame: FakeFrame): void {
  const fakeDocument = {
    createElement: () => frame,
    body: {
      appendChild: () => {},
    },
  }
  const fakeWindow = {
    setTimeout: (callback: () => void) => {
      callback()
      return 0
    },
  }
  globalThis.document = fakeDocument as unknown as Document
  globalThis.window = fakeWindow as unknown as Window & typeof globalThis
}

function makeFrame(overrides: Partial<FakeFrame> = {}, written: { html: string } = { html: '' }): FakeFrame {
  return {
    style: {},
    onload: null,
    onerror: null,
    contentWindow: { focus: () => {}, print: () => {} },
    contentDocument: {
      open: () => {},
      write: (html: string) => {
        written.html = html
      },
      close: () => {},
    },
    remove: () => {},
    ...overrides,
  }
}

describe('printThermalReceipt in the browser', () => {
  const receipt = formatReceiptData(order, settings)

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'document')
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('prints through a hidden iframe', async () => {
    const written = { html: '' }
    const frame = makeFrame({}, written)
    installFakeDom(frame)

    const pending = printThermalReceipt(receipt)
    frame.onload?.()

    await expect(pending).resolves.toBe('Receipt sent to browser print dialog')
    expect(written.html).toContain('Caldera Market')
  })

  it('fails when the print frame has no window', async () => {
    const frame = makeFrame({ contentWindow: null })
    installFakeDom(frame)

    const pending = printThermalReceipt(receipt)
    frame.onload?.()

    await expect(pending).rejects.toThrow('Print command failed: Could not create receipt print frame')
  })

  it('fails when printing throws', async () => {
    const frame = makeFrame({
      contentWindow: {
        focus: () => {},
        print: () => {
          throw new Error('blocked')
        },
      },
    })
    installFakeDom(frame)

    const pending = printThermalReceipt(receipt)
    frame.onload?.()

    await expect(pending).rejects.toThrow('Print command failed: blocked')
  })

  it('fails when the frame errors or has no document', async () => {
    const errorFrame = makeFrame()
    installFakeDom(errorFrame)

    const errorPending = printThermalReceipt(receipt)
    errorFrame.onerror?.()

    await expect(errorPending).rejects.toThrow('Print command failed: Could not load receipt print frame')

    const noDocFrame = makeFrame({ contentDocument: null })
    installFakeDom(noDocFrame)

    const noDocPending = printThermalReceipt(receipt)

    await expect(noDocPending).rejects.toThrow('Print command failed: Could not write receipt print document')
  })
})
