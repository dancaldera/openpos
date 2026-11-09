import type { StatusDotVariant } from '@astryxdesign/core/StatusDot'
import { normalizeBarcode } from '@openpos/domain'
import {
  DESKTOP_REMOTE_SESSION_UNAVAILABLE_MESSAGE,
  extractDesktopApiConfigPath,
  extractDesktopRemoteSessionDetails,
} from '../../services/product-images'
import { PRODUCT_CATEGORIES, type Product, type ProductWithVariants } from '../../services/products-turso'

export type Translate = (key: string, params?: Record<string, string | number | boolean>) => string

/** Products below this many units count as low stock. */
export const LOW_STOCK_THRESHOLD = 10

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'

export type StockLevel = 'in' | 'low' | 'out'

export function stockLevel(stock: number): StockLevel {
  if (stock <= 0) return 'out'
  if (stock < LOW_STOCK_THRESHOLD) return 'low'
  return 'in'
}

const STOCK_DOT: Record<StockLevel, StatusDotVariant> = { in: 'success', low: 'warning', out: 'error' }

export function stockDot(level: StockLevel): StatusDotVariant {
  return STOCK_DOT[level]
}

export function stockLevelLabel(level: StockLevel, t: Translate): string {
  if (level === 'out') return t('products.stockOut')
  if (level === 'low') return t('products.stockLow')
  return t('products.stockIn')
}

/** Units on hand: the variant total for configurable products, the product's own stock otherwise. */
export function effectiveStock(product: ProductWithVariants): number {
  return product.variantType === 'configurable' && product.totalStock !== undefined ? product.totalStock : product.stock
}

/** Translated category name; categories outside the built-in list show as stored. */
export function categoryLabel(category: string, t: Translate): string {
  const key = category.replace(/[^a-zA-Z0-9]/g, '').replace(/^([A-Z])/, (match) => match.toLowerCase())
  const translated = t(`categories.${key}`)
  return translated === `categories.${key}` ? category : translated
}

/** Built-in categories plus any extra ones already used in the catalog. */
export function categoryOptions(t: Translate, extra: string[] = []): Array<{ value: string; label: string }> {
  const categories: string[] = [...PRODUCT_CATEGORIES]
  for (const category of extra) {
    if (category && !categories.includes(category)) categories.push(category)
  }
  return categories.map((category) => ({ value: category, label: categoryLabel(category, t) }))
}

export function variantLabel(attributes?: Record<string, string>): string {
  if (!attributes) return ''
  return Object.entries(attributes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')
}

/** Margin over cost as a percentage, or null when it cannot be computed. */
export function marginPercent(price: number, cost: number): number | null {
  if (price <= 0 || cost <= 0) return null
  return ((price - cost) / cost) * 100
}

export function matchesSearch(product: Product, term: string, t: Translate): boolean {
  const query = term.trim().toLowerCase()
  if (!query) return true
  const normalized = normalizeBarcode(term)
  return (
    product.name.toLowerCase().includes(query) ||
    (product.description || '').toLowerCase().includes(query) ||
    product.category.toLowerCase().includes(query) ||
    categoryLabel(product.category, t).toLowerCase().includes(query) ||
    (product.barcode || '').toLowerCase().includes(query) ||
    (Boolean(normalized) && normalizeBarcode(product.barcode) === normalized)
  )
}

/** Translates errors that the image and product services raise. */
export function productErrorMessage(message: string, t: Translate): string {
  const configPath = extractDesktopApiConfigPath(message)
  if (configPath) return t('errors.desktopApiNotConfigured', { path: configPath })

  const remoteSessionDetails = extractDesktopRemoteSessionDetails(message)
  if (remoteSessionDetails) return t('errors.remoteSessionUnavailableWithDetails', { details: remoteSessionDetails })

  if (message === DESKTOP_REMOTE_SESSION_UNAVAILABLE_MESSAGE || message === 'No auth token available for API call') {
    return t('errors.remoteSessionUnavailable')
  }
  if (message === 'Failed to upload product image.') return t('products.imageUploadFailed')
  if (message === 'Unsupported image type. Allowed types: JPEG, PNG, WEBP.') return t('products.invalidImageType')
  if (message === 'Image exceeds maximum size of 5 MB.') return t('products.imageTooLarge')
  return message || t('errors.generic')
}
