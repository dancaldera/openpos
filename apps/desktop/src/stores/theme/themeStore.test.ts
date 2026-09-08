import { describe, expect, it } from 'vitest'
import type { ThemePalette } from './palettes'
import { applyCompanyTheme, themePalette, themePreference } from './themeStore'

describe('applyCompanyTheme', () => {
  it('adopts remote mode and palette', () => {
    applyCompanyTheme('dark', 'coffee')

    expect(themePreference.value).toBe('dark')
    expect(themePalette.value).toBe('coffee')
  })

  it('keeps local values when the remote has none', () => {
    applyCompanyTheme('dark', 'coffee')

    applyCompanyTheme(undefined, undefined)

    expect(themePreference.value).toBe('dark')
    expect(themePalette.value).toBe('coffee')
  })

  it('normalizes unknown remote palettes to classic', () => {
    applyCompanyTheme('light', 'neon' as ThemePalette)

    expect(themePreference.value).toBe('light')
    expect(themePalette.value).toBe('classic')
  })
})
