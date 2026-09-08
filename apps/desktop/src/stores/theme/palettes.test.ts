import { describe, expect, it } from 'vitest'
import { normalizeThemePalette, THEME_PALETTES } from './palettes'

describe('THEME_PALETTES', () => {
  it('exposes a unique id and translation key per palette', () => {
    const ids = THEME_PALETTES.map((palette) => palette.id)
    expect(new Set(ids).size).toBe(THEME_PALETTES.length)

    for (const palette of THEME_PALETTES) {
      expect(palette.labelKey).toMatch(/^settings\.palette/)
      expect(palette.preview.light.canvas).toMatch(/^#[0-9a-f]{6}$/)
      expect(palette.preview.dark.canvas).toMatch(/^#[0-9a-f]{6}$/)
      expect(palette.preview.light.accent).toMatch(/^#[0-9a-f]{6}$/)
      expect(palette.preview.dark.accent).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('normalizeThemePalette', () => {
  it('keeps known palette ids', () => {
    for (const palette of THEME_PALETTES) {
      expect(normalizeThemePalette(palette.id)).toBe(palette.id)
    }
  })

  it('falls back to classic for unknown or missing stored values', () => {
    expect(normalizeThemePalette('neon')).toBe('classic')
    expect(normalizeThemePalette(null)).toBe('classic')
    expect(normalizeThemePalette(undefined)).toBe('classic')
    expect(normalizeThemePalette(42)).toBe('classic')
  })
})
