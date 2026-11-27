import { describe, expect, it } from 'vitest'
import {
  buildPaletteCss,
  contrastRatio,
  mixHex,
  normalizeThemeMode,
  normalizeThemePalette,
  paletteTokens,
  THEME_PALETTES,
} from './palettes'

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

describe('normalizeThemeMode', () => {
  it('keeps known modes', () => {
    expect(normalizeThemeMode('system')).toBe('system')
    expect(normalizeThemeMode('light')).toBe('light')
    expect(normalizeThemeMode('dark')).toBe('dark')
  })

  it('clears unknown or missing stored values', () => {
    expect(normalizeThemeMode('neon')).toBeUndefined()
    expect(normalizeThemeMode(null)).toBeUndefined()
    expect(normalizeThemeMode(undefined)).toBeUndefined()
    expect(normalizeThemeMode(42)).toBeUndefined()
  })
})

describe('palette colors', () => {
  it('keeps every palette readable in both modes (WCAG AA, AAA for body text)', () => {
    for (const palette of THEME_PALETTES) {
      for (const mode of ['light', 'dark'] as const) {
        const colors = palette.preview[mode]
        const tokens = paletteTokens(colors, mode)
        const where = `${palette.id} ${mode}`
        expect(contrastRatio(colors.text, colors.surface), `${where} text`).toBeGreaterThanOrEqual(7)
        expect(contrastRatio(colors.text, colors.canvas), `${where} text on page`).toBeGreaterThanOrEqual(7)
        expect(
          contrastRatio(tokens['--color-text-secondary'] ?? '', colors.surface),
          `${where} secondary`,
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          contrastRatio(tokens['--color-on-accent'] ?? '', colors.accent),
          `${where} on accent`,
        ).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(colors.accent, colors.surface), `${where} accent text`).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(colors.accent, colors.canvas), `${where} accent on page`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('mixes colors and measures contrast', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixHex('#ff0000', '#0000ff', 1)).toBe('#ff0000')
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })
})

describe('buildPaletteCss', () => {
  const css = buildPaletteCss()

  it('emits light and dark values for every palette except classic', () => {
    for (const palette of THEME_PALETTES) {
      const selector = `html[data-palette='${palette.id}'] [data-astryx-theme]`
      if (palette.id === 'classic') {
        expect(css).not.toContain(selector)
        continue
      }
      expect(css).toContain(selector)
      const { light, dark } = palette.preview
      expect(css).toContain(`--color-background-body: light-dark(${light.canvas}, ${dark.canvas})`)
      expect(css).toContain(`--color-background-surface: light-dark(${light.surface}, ${dark.surface})`)
      expect(css).toContain(`--color-accent: light-dark(${light.accent}, ${dark.accent})`)
    }
  })

  it('themes the page chrome as well as the theme root', () => {
    expect(css).toContain("html[data-palette='ocean'],\nhtml[data-palette='ocean'] [data-astryx-theme] {")
    expect(css).toContain('--color-text-primary: light-dark(')
    expect(css).toContain('--color-on-accent: light-dark(#ffffff, ')
  })
})
