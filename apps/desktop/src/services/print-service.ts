import { APP_VERSION } from '../lib/app-version'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'
import type { CompanySettings } from './company-settings-turso'
import type { Order, OrderItem } from './orders-turso'

export const RECEIPT_APP_PHONE = '+523322633323'

export interface PrintReceiptItem {
  name: string
  quantity: number
  price: number
  total: number
}

export interface PrintReceiptStoreInfo {
  name: string
  appName: string
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
  supportLabel = 'Support',
): string {
  return `${appName} | ${appVersionLabel} ${APP_VERSION}\n${supportLabel}: ${RECEIPT_APP_PHONE}`
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
    title: settings?.name || settings?.appName || 'Receipt',
    storeInfo: {
      name: settings?.name || 'Store',
      appName: settings?.appName || 'OpenPOS',
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
    footer: settings?.receiptFooter || 'Thank you for your purchase!',
    date: new Date(order.createdAt).toLocaleDateString(),
    time: new Date(order.createdAt).toLocaleTimeString(),
    orderId: order.id,
    supportLabel: 'Support',
    appVersionLabel: 'Version',
  }
}

export function renderReceiptText(receiptData: PrintReceiptData, width = 42): string {
  const line = '-'.repeat(width)
  const storeInfo = receiptData.storeInfo
  const appFooter = formatReceiptAppFooter(storeInfo.appName, receiptData.appVersionLabel, receiptData.supportLabel)
  const lines = [
    centerText(storeInfo.name || receiptData.title || 'Receipt', width),
    storeInfo.address,
    storeInfo.phone ? `Phone: ${storeInfo.phone}` : '',
    storeInfo.email,
    storeInfo.website,
    receiptData.orderId ? `Order: ${receiptData.orderId}` : '',
    line,
    formatReceiptRow('Item', 'Qty', 'Total', width),
    line,
    ...receiptData.items.map((item) =>
      formatReceiptRow(item.name, String(item.quantity), formatCurrency(item.total, receiptData.currencySymbol), width),
    ),
    line,
    formatAmountLine('Subtotal', receiptData.subtotal, receiptData.currencySymbol, width),
    receiptData.taxRate > 0
      ? formatAmountLine(`Tax (${receiptData.taxRate}%)`, receiptData.tax, receiptData.currencySymbol, width)
      : '',
    formatAmountLine('Total', receiptData.total, receiptData.currencySymbol, width),
    line,
    receiptData.footer,
    centerText(appFooter, width),
    line,
    `Date: ${receiptData.date}`,
    `Time: ${receiptData.time}`,
  ]

  return lines.filter((lineItem): lineItem is string => Boolean(lineItem)).join('\n')
}

export function renderReceiptHtml(receiptData: PrintReceiptData): string {
  const storeInfo = receiptData.storeInfo
  const appFooter = formatReceiptAppFooter(storeInfo.appName, receiptData.appVersionLabel, receiptData.supportLabel)
  const optionalStoreRows = [
    storeInfo.address,
    storeInfo.phone ? `Phone: ${storeInfo.phone}` : '',
    storeInfo.email,
    storeInfo.website,
  ].filter(Boolean)

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
      <div class="store-name">${escapeHtml(storeInfo.name || receiptData.title)}</div>
      ${optionalStoreRows.map((row) => `<div>${escapeHtml(row)}</div>`).join('')}
    </header>
    <section class="meta">
      ${receiptData.orderId ? `<div>Order: ${escapeHtml(receiptData.orderId)}</div>` : ''}
      <div>Date: ${escapeHtml(receiptData.date)}</div>
      <div>Time: ${escapeHtml(receiptData.time)}</div>
    </section>
    <div class="rule"></div>
    <table>
      <thead><tr><th>Item</th><th class="qty">Qty</th><th class="amount">Total</th></tr></thead>
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
        <tr><td>Subtotal</td><td class="amount">${escapeHtml(formatCurrency(receiptData.subtotal, receiptData.currencySymbol))}</td></tr>
        ${
          receiptData.taxRate > 0
            ? `<tr><td>Tax (${receiptData.taxRate}%)</td><td class="amount">${escapeHtml(
                formatCurrency(receiptData.tax, receiptData.currencySymbol),
              )}</td></tr>`
            : ''
        }
        <tr class="total-row"><td>Total</td><td class="amount">${escapeHtml(formatCurrency(receiptData.total, receiptData.currencySymbol))}</td></tr>
      </tbody>
    </table>
    ${receiptData.footer ? `<div class="footer">${escapeHtml(receiptData.footer)}</div>` : ''}
    <div class="app-footer">${escapeHtml(appFooter)}</div>
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
