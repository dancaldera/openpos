import { describe, expect, it } from 'vitest'
import { formatBarcodeForStorage, isNormalizedBarcodeEqual, normalizeBarcode } from './barcodes'

describe('barcodes', () => {
  it('normalizes barcodes by stripping whitespace', () => {
    expect(normalizeBarcode(' 123 456 ')).toBe('123456')
    expect(normalizeBarcode('12\r\n34\t56')).toBe('123456')
    expect(normalizeBarcode('ABC-123')).toBe('ABC-123')
  })

  it('treats blank barcodes as missing', () => {
    expect(normalizeBarcode(undefined)).toBeUndefined()
    expect(normalizeBarcode(null)).toBeUndefined()
    expect(normalizeBarcode('')).toBeUndefined()
    expect(normalizeBarcode('   ')).toBeUndefined()
  })

  it('formats barcodes for storage', () => {
    expect(formatBarcodeForStorage(' 123 ')).toBe('123')
    expect(formatBarcodeForStorage(undefined)).toBeUndefined()
    expect(formatBarcodeForStorage('  ')).toBeUndefined()
  })

  it('compares normalized barcodes', () => {
    expect(isNormalizedBarcodeEqual('123 456', '123456')).toBe(true)
    expect(isNormalizedBarcodeEqual('123', '456')).toBe(false)
    expect(isNormalizedBarcodeEqual(undefined, undefined)).toBe(true)
  })
})
