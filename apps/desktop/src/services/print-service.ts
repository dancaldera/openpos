import { APP_VERSION } from '../lib/app-version'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'
import type { CompanySettings } from './company-settings-turso'
import type { Order, OrderItem } from './orders-turso'

export const RECEIPT_APP_PHONE = '+523322633323'

function formatReceiptRef(orderId: string): string {
  try {
    return btoa(orderId).replace(/=+$/, '').replace(/[+/]/g, '').slice(0, 8).toUpperCase()
  } catch {
    return orderId.slice(0, 8).toUpperCase()
  }
}

export interface PrintReceiptItem {
  name: string
  quantity: number
  price: number
  total: number
}

export interface PrintReceiptStoreInfo {
  name: string
  appName: string
  description?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  logoUrl?: string
}

export interface PrintReceiptData {
  title: string
  storeInfo: PrintReceiptStoreInfo
  currencySymbol: string
  items: PrintReceiptItem[]
  subtotal: number
  tax: number
  taxRate: number
  total: number
  footer: string
  date: string
  time: string
  orderId?: string
  supportLabel?: string
  appVersionLabel?: string
  supportPhone?: string
  taxEnabled?: boolean
  locale?: string
  itemLabel?: string
  qtyLabel?: string
  totalLabel?: string
  subtotalLabel?: string
  taxLabel?: string
  orderLabel?: string
  footerLabel?: string
}

export async function printThermalReceipt(receiptData: PrintReceiptData): Promise<string> {
  try {
    const jsonString = JSON.stringify(receiptData)

    if (isDesktop) {
      return requireDesktopApi().printThermalReceipt(jsonString)
    }

    await printReceiptInBrowser(receiptData)
    return 'Receipt sent to browser print dialog'
  } catch (error) {
    console.error('Print service error:', error)
    throw new Error(`Print command failed: ${getErrorMessage(error)}`)
  }
}

export function formatReceiptAppFooter(
  appName = 'OpenPOS',
  appVersionLabel = 'Version',
  supportLabel = 'WhatsApp Sales/Support Point of Sale',
  supportPhone = RECEIPT_APP_PHONE,
): string {
  return `${appName} | ${appVersionLabel} ${APP_VERSION}\n${supportLabel}\n${supportPhone}`
}

export function formatReceiptData(
  order: Order,
  settings: CompanySettings,
  customTaxRate?: number,
  footerLabel?: string,
): PrintReceiptData {
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
    title: settings?.name || settings?.appName || 'Receipt',
    storeInfo: {
      name: settings?.name || 'Store',
      appName: settings?.appName || 'OpenPOS',
      description: settings?.description || undefined,
      address: settings?.address || undefined,
      phone: settings?.phone || undefined,
      email: settings?.email || undefined,
      website: settings?.website || undefined,
      logoUrl: settings?.logoUrl || undefined,
    },
    currencySymbol: settings?.currencySymbol || '$',
    items: formattedItems,
    subtotal: baseSubtotal,
    tax: taxAmount,
    taxRate: customTaxRate !== undefined ? customTaxRate : settings?.taxPercentage || 0,
    total: total,
    footer: settings?.receiptFooter || footerLabel || 'Thank you for your purchase!',
    date: new Date(order.createdAt).toLocaleDateString(settings?.language),
    time: new Date(order.createdAt).toLocaleTimeString(settings?.language),
    orderId: formatReceiptRef(order.id),
    supportLabel: 'WhatsApp Sales/Support Point of Sale',
    appVersionLabel: 'Version',
    supportPhone: RECEIPT_APP_PHONE,
    taxEnabled: settings?.taxEnabled ?? false,
    locale: settings?.language,
    footerLabel,
  }
}

export function renderReceiptText(receiptData: PrintReceiptData, width = 42): string {
  const line = '-'.repeat(width)
  const storeInfo = receiptData.storeInfo
  const appFooter = formatReceiptAppFooter(
    storeInfo.appName,
    receiptData.appVersionLabel,
    receiptData.supportLabel,
    receiptData.supportPhone,
  )
  const appFooterLines = appFooter.split('\n')

  const headerName = storeInfo.description
    ? `${storeInfo.name} — ${storeInfo.description}`
    : storeInfo.name || receiptData.title || 'Receipt'
  const lines = [
    centerText(headerName, width),
    storeInfo.address ? centerText(storeInfo.address, width) : '',
    storeInfo.phone ? centerText(storeInfo.phone, width) : '',
    storeInfo.email ? centerText(storeInfo.email, width) : '',
    storeInfo.website ? centerText(storeInfo.website, width) : '',
    line,
    formatReceiptRow(
      (receiptData.itemLabel || 'Item').toUpperCase(),
      (receiptData.qtyLabel || 'Qty').toUpperCase(),
      (receiptData.totalLabel || 'Total').toUpperCase(),
      width,
    ),
    line,
    ...receiptData.items.map((item) =>
      formatReceiptRow(item.name, String(item.quantity), formatCurrency(item.total, receiptData.currencySymbol), width),
    ),
    line,
    receiptData.taxEnabled
      ? formatAmountLine(
          receiptData.subtotalLabel || 'Subtotal',
          receiptData.subtotal,
          receiptData.currencySymbol,
          width,
        )
      : '',
    receiptData.taxEnabled && receiptData.taxRate > 0
      ? formatAmountLine(
          `${receiptData.taxLabel || 'Tax'} (${receiptData.taxRate}%)`,
          receiptData.tax,
          receiptData.currencySymbol,
          width,
        )
      : '',
    formatAmountLine(receiptData.totalLabel || 'Total', receiptData.total, receiptData.currencySymbol, width),
    line,
    centerText(receiptData.footer || receiptData.footerLabel || 'Thank you for your purchase!', width),
    line,
    receiptData.date ? centerText(receiptData.date, width) : '',
    receiptData.time ? centerText(receiptData.time, width) : '',
    ...appFooterLines.map((l) => centerText(l, width)),
    '',
  ]

  return `${lines.filter((lineItem): lineItem is string => Boolean(lineItem)).join('\n')}\n\n`
}

const WHATSAPP_SVG_HTML =
  '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true" style="display:inline-block;vertical-align:-1px;margin-right:4px;"><path d="M12 2C6.5 2 2 6.5 2 12c0 1.7.5 3.4 1.3 4.9L2 22l5.2-1.4A9.9 9.9 0 0 0 12 22c5.5 0 10-4.5 10-10 0-2.7-1-5.2-2.9-7.1A9.9 9.9 0 0 0 12 2zm0 1.8c2.2 0 4.3.9 5.8 2.4A8.1 8.1 0 0 1 20 12c0 4.4-3.6 8-8 8a8 8 0 0 1-4-1.1l-.3-.2-3 .8.8-3-.2-.3A8 8 0 0 1 4 12C4 7.6 7.6 3.8 12 3.8zm5.7 11.3c-.3-.1-1.8-.9-2-1-.3-.1-.5-.2-.7.1l-.7 1c-.1.2-.4.2-.6 0-1-.4-1.6-.7-2.2-1.5-.5-.5-1-1.2-1.3-2 0-.2 0-.4.2-.6l.6-.7c.1-.1 0-.2 0-.4l-.9-2c-.1-.2-.2-.2-.4-.2h-.5c-.2 0-.4 0-.6.2l-.5.5c-.2.2-.7.7-.7 1.7s.8 2 1 2.1c.1.2 1.6 2.4 3.9 3.3.5.2 1 .4 1.3.4.4.1.8.1 1.1-.1.3-.2 1.4-.7 1.6-1.3.2-.6.2-1.1.1-1.3 0-.1-.2-.2-.4-.2z"/></svg>'

export function renderReceiptHtml(receiptData: PrintReceiptData): string {
  const storeInfo = receiptData.storeInfo
  const supportLabel = receiptData.supportLabel || 'WhatsApp Sales/Support Point of Sale'
  const supportPhone = receiptData.supportPhone || RECEIPT_APP_PHONE
  const appFooterHtml = `<div>${escapeHtml(storeInfo.appName)} | ${escapeHtml(receiptData.appVersionLabel || 'Version')} ${escapeHtml(APP_VERSION)}</div><div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-top:1mm;">${WHATSAPP_SVG_HTML}<span>${escapeHtml(supportLabel)}</span></div><div>${escapeHtml(supportPhone)}</div>`
  const optionalStoreRows = [storeInfo.address, storeInfo.phone, storeInfo.email, storeInfo.website].filter(Boolean)

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(receiptData.title)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .receipt { width: 72mm; margin: 0 auto; }
    .center { text-align: center; }
    .store-name { font-size: 16px; font-weight: 700; margin-bottom: 2mm; }
    .store-desc { font-size: 11px; font-weight: 400; color: #333; margin-left: 2mm; }
    .meta { margin-top: 2mm; }
    .rule { border-top: 1px dashed #111; margin: 3mm 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 1mm 0; vertical-align: top; }
    th { text-align: left; border-bottom: 1px dashed #111; }
    .qty { width: 12mm; text-align: right; }
    .amount { width: 22mm; text-align: right; }
    .totals { margin-left: auto; width: 48mm; }
    .total-row { font-weight: 700; font-size: 14px; }
    .footer { margin-top: 4mm; text-align: center; white-space: pre-wrap; }
    .app-footer { margin-top: 2mm; padding-top: 2mm; border-top: 1px dashed #111; text-align: center; font-size: 9px; line-height: 1.2; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main class="receipt">
    <header class="center">
      <div class="store-name">${escapeHtml(storeInfo.name || receiptData.title)}${storeInfo.description ? ` <span class="store-desc">— ${escapeHtml(storeInfo.description)}</span>` : ''}</div>
      ${optionalStoreRows.map((row) => `<div>${escapeHtml(row)}</div>`).join('')}
    </header>
    <div class="rule"></div>
    <table>
      <thead><tr><th>${escapeHtml((receiptData.itemLabel || 'Item').toUpperCase())}</th><th class="qty">${escapeHtml((receiptData.qtyLabel || 'Qty').toUpperCase())}</th><th class="amount">${escapeHtml((receiptData.totalLabel || 'Total').toUpperCase())}</th></tr></thead>
      <tbody>
        ${receiptData.items
          .map(
            (item) =>
              `<tr><td>${escapeHtml(item.name)}</td><td class="qty">${item.quantity}</td><td class="amount">${escapeHtml(
                formatCurrency(item.total, receiptData.currencySymbol),
              )}</td></tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <div class="rule"></div>
    <table class="totals">
      <tbody>
        ${
          receiptData.taxEnabled
            ? `<tr><td>${escapeHtml(receiptData.subtotalLabel || 'Subtotal')}</td><td class="amount">${escapeHtml(formatCurrency(receiptData.subtotal, receiptData.currencySymbol))}</td></tr>`
            : ''
        }
        ${
          receiptData.taxEnabled && receiptData.taxRate > 0
            ? `<tr><td>${escapeHtml(receiptData.taxLabel || 'Tax')} (${receiptData.taxRate}%)</td><td class="amount">${escapeHtml(
                formatCurrency(receiptData.tax, receiptData.currencySymbol),
              )}</td></tr>`
            : ''
        }
        <tr class="total-row"><td>${escapeHtml(receiptData.totalLabel || 'Total')}</td><td class="amount">${escapeHtml(formatCurrency(receiptData.total, receiptData.currencySymbol))}</td></tr>
      </tbody>
    </table>
    ${receiptData.footer ? `<div class="footer">${escapeHtml(receiptData.footer)}</div>` : ''}
    <div class="meta" style="text-align: center; margin-top: 2mm;">
      <div>${escapeHtml(receiptData.date)}</div>
      <div>${escapeHtml(receiptData.time)}</div>
    </div>
    <div class="app-footer">${appFooterHtml}</div>
    <div style="height:6mm"></div>
  </main>
</body>
</html>`
}

function printReceiptInBrowser(receiptData: PrintReceiptData): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'

    const cleanup = () => {
      window.setTimeout(() => iframe.remove(), 250)
    }

    iframe.onload = () => {
      const printWindow = iframe.contentWindow
      if (!printWindow) {
        cleanup()
        reject(new Error('Could not create receipt print frame'))
        return
      }

      try {
        printWindow.focus()
        printWindow.print()
        cleanup()
        resolve()
      } catch (error) {
        cleanup()
        reject(error)
      }
    }

    iframe.onerror = () => {
      cleanup()
      reject(new Error('Could not load receipt print frame'))
    }

    document.body.appendChild(iframe)
    const iframeDocument = iframe.contentDocument
    if (!iframeDocument) {
      cleanup()
      reject(new Error('Could not write receipt print document'))
      return
    }

    iframeDocument.open()
    iframeDocument.write(renderReceiptHtml(receiptData))
    iframeDocument.close()
  })
}

function formatReceiptRow(name: string, quantity: string, total: string, width: number): string {
  const qtyWidth = 5
  const totalWidth = 12
  const nameWidth = width - qtyWidth - totalWidth - 2
  const safeName = truncate(name, nameWidth)
  return `${safeName.padEnd(nameWidth)} ${quantity.padStart(qtyWidth)} ${total.padStart(totalWidth)}`
}

function formatAmountLine(label: string, amount: number, currencySymbol: string, width: number): string {
  const value = formatCurrency(amount, currencySymbol)
  return `${label}:`.padEnd(width - value.length) + value
}

function formatCurrency(amount: number, currencySymbol: string): string {
  return `${currencySymbol}${Number(amount || 0).toFixed(2)}`
}

function centerText(text: string, width: number): string {
  const trimmed = text.trim()
  if (trimmed.length >= width) return trimmed
  const leftPadding = Math.floor((width - trimmed.length) / 2)
  return `${' '.repeat(leftPadding)}${trimmed}`
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
