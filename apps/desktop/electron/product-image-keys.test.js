const { describe, expect, it } = require('bun:test')
const { isLegacyLocalImageKey } = require('./product-image-keys.cjs')

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
})
