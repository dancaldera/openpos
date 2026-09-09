import { describe, expect, it } from 'vitest'
import type { ThemePalette } from './palettes'
import {
  applyCompanyTheme,
  initializeTheme,
  resolvedTheme,
  setThemePalette,
  setThemePreference,
  themePalette,
  themePreference,
} from './themeStore'

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

  it('adopts only the remote palette when mode is missing', () => {
    applyCompanyTheme('dark', 'coffee')
    applyCompanyTheme(undefined, 'classic')

    expect(themePalette.value).toBe('classic')
    expect(themePreference.value).toBe('dark')
  })

  it('adopts only the remote mode when palette is missing', () => {
    applyCompanyTheme('dark', 'coffee')
    applyCompanyTheme('light', undefined)

    expect(themePreference.value).toBe('light')
    expect(themePalette.value).toBe('coffee')
  })
})

describe('theme setters without a desktop runtime', () => {
  it('sets explicit preferences and resolves them', async () => {
    await setThemePreference('dark')

    expect(themePreference.value).toBe('dark')
    expect(resolvedTheme.value).toBe('dark')

    await setThemePreference('system')

    expect(themePreference.value).toBe('system')
    expect(resolvedTheme.value).toBe('light')
  })

  it('sets the palette directly', () => {
    setThemePalette('coffee')

    expect(themePalette.value).toBe('coffee')
  })

  it('skips desktop initialization without an api', async () => {
    await expect(initializeTheme()).resolves.toBeUndefined()
  })
})
