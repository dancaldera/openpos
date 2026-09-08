import { signal } from '@preact/signals'
import { getDesktopApi } from '../../lib/desktop'
import { normalizeThemePalette, type ThemePalette } from './palettes'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'openpos-theme'
const PALETTE_STORAGE_KEY = 'openpos-palette'

function readStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system'

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function readStoredPalette(): ThemePalette {
  if (typeof window === 'undefined') return 'classic'

  try {
    return normalizeThemePalette(window.localStorage.getItem(PALETTE_STORAGE_KEY))
  } catch {
    return 'classic'
  }
}

function getSystemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export const themePreference = signal<ThemePreference>(readStoredTheme())
export const themePalette = signal<ThemePalette>(readStoredPalette())
export const resolvedTheme = signal<ResolvedTheme>(
  themePreference.value === 'system' ? getSystemTheme() : themePreference.value,
)

function applyTheme(preference: ThemePreference) {
  const resolved = preference === 'system' ? getSystemTheme() : preference

  if (typeof document !== 'undefined') {
    document.documentElement.dataset.mode = resolved
    document.documentElement.dataset.palette = themePalette.value
  }

  resolvedTheme.value = resolved
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handleSystemThemeChange = () => {
    if (themePreference.value === 'system') {
      applyTheme('system')
    }
  }
  mediaQuery.addEventListener('change', handleSystemThemeChange)
}

applyTheme(themePreference.value)

function persistThemeValue(key: string, value: string): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Values still apply for the current session if storage is unavailable.
    }
  }
}

function pushThemeToDesktop(preference: ThemePreference): void {
  const api = getDesktopApi()
  if (api?.theme) {
    void api.theme.set(preference).catch((error: unknown) => {
      console.error('Failed to update theme:', error)
    })
  }
}

export async function initializeTheme(): Promise<void> {
  const api = getDesktopApi()
  if (!api?.theme) return

  try {
    await api.theme.set(themePreference.value)
  } catch (error) {
    console.error('Failed to initialize theme:', error)
  }
}

export async function setThemePreference(preference: ThemePreference): Promise<void> {
  themePreference.value = preference
  applyTheme(preference)
  persistThemeValue(THEME_STORAGE_KEY, preference)
  pushThemeToDesktop(preference)
}

export function setThemePalette(palette: ThemePalette): void {
  themePalette.value = palette
  applyTheme(themePreference.value)
  persistThemeValue(PALETTE_STORAGE_KEY, palette)
}

/**
 * Adopts the theme stored in company settings (desktop ↔ web roaming). Remote
 * values win over the local ones when present; missing values keep the local
 * choice so offline devices are unaffected.
 */
export function applyCompanyTheme(remoteMode?: ThemePreference, remotePalette?: ThemePalette): void {
  if (!remoteMode && !remotePalette) return

  if (remotePalette) {
    const palette = normalizeThemePalette(remotePalette)
    themePalette.value = palette
    persistThemeValue(PALETTE_STORAGE_KEY, palette)
  }

  if (remoteMode) {
    themePreference.value = remoteMode
    persistThemeValue(THEME_STORAGE_KEY, remoteMode)
  }

  applyTheme(themePreference.value)
  pushThemeToDesktop(themePreference.value)
}
