import { describe, expect, it } from 'vitest'
import {
  formatBarcodeForStorage,
  formatBarcodeForStorageOrNull,
  normalizeBarcode,
  normalizeBarcodeOrNull,
  validatePasswordStrength,
  validatePin,
} from './index'

describe('validatePasswordStrength', () => {
  it('accepts strong passwords', () => {
    expect(validatePasswordStrength('NewPass1!')).toBeNull()
    expect(validatePasswordStrength('Str0ng!pass')).toBeNull()
  })

  it('reports each missing requirement', () => {
    expect(validatePasswordStrength('short')).toBe('Password must be at least 8 characters')
    expect(validatePasswordStrength('alllowercase1!')).toBe('Password must contain an uppercase letter')
    expect(validatePasswordStrength('ALLUPPERCASE1!')).toBe('Password must contain a lowercase letter')
    expect(validatePasswordStrength('NoNumbersHere!')).toBe('Password must contain a number')
    expect(validatePasswordStrength('NoSpecials123')).toBe('Password must contain a special character')
  })
})

describe('validatePin', () => {
  it('accepts exactly six digits', () => {
    expect(validatePin('123456')).toBeNull()
  })

  it('rejects anything else', () => {
    expect(validatePin('12345')).toBe('PIN must be exactly 6 digits')
    expect(validatePin('1234567')).toBe('PIN must be exactly 6 digits')
    expect(validatePin('abcdef')).toBe('PIN must be exactly 6 digits')
  })
})

describe('normalizeBarcode', () => {
  it('strips whitespace', () => {
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
})

describe('formatBarcodeForStorage', () => {
  it('trims for storage', () => {
    expect(formatBarcodeForStorage(' 123 ')).toBe('123')
  })

  it('treats blank barcodes as missing', () => {
    expect(formatBarcodeForStorage(undefined)).toBeUndefined()
    expect(formatBarcodeForStorage(null)).toBeUndefined()
    expect(formatBarcodeForStorage('  ')).toBeUndefined()
  })
})

describe('null-returning variants', () => {
  it('returns null instead of undefined for missing barcodes', () => {
    expect(normalizeBarcodeOrNull(undefined)).toBeNull()
    expect(normalizeBarcodeOrNull('   ')).toBeNull()
    expect(formatBarcodeForStorageOrNull(undefined)).toBeNull()
    expect(formatBarcodeForStorageOrNull('  ')).toBeNull()
  })

  it('passes through present barcodes', () => {
    expect(normalizeBarcodeOrNull(' 123 456 ')).toBe('123456')
    expect(formatBarcodeForStorageOrNull(' 123 ')).toBe('123')
  })
})
