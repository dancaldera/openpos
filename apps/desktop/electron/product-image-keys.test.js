import { describe, expect, it } from 'vitest'
const { isLegacyLocalImageKey } = await import('./product-image-keys.cjs')

describe('isLegacyLocalImageKey', () => {
  it('accepts plain local filenames with supported extensions', () => {
    expect(isLegacyLocalImageKey('image.jpg')).toBe(true)
    expect(isLegacyLocalImageKey('image.webp')).toBe(true)
  })

  it('rejects remote-style object keys and nested paths', () => {
    expect(isLegacyLocalImageKey('products/2026/03/object.jpg')).toBe(false)
    expect(isLegacyLocalImageKey('nested\\\\image.jpg')).toBe(false)
  })

  it('rejects unsupported or extensionless keys', () => {
    expect(isLegacyLocalImageKey('image.svg')).toBe(false)
    expect(isLegacyLocalImageKey('image')).toBe(false)
  })

  it('rejects non-string keys', () => {
    expect(isLegacyLocalImageKey(null)).toBe(false)
    expect(isLegacyLocalImageKey(undefined)).toBe(false)
    expect(isLegacyLocalImageKey(123)).toBe(false)
    expect(isLegacyLocalImageKey('  ')).toBe(false)
  })
})
