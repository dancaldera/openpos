// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_PALETTES } from './palettes'

type ThemeModule = typeof import('./themeStore')

const activeSpies: Array<{ mockRestore: () => void }> = []

function trackSpy<T extends { mockRestore: () => void }>(spy: T): T {
  activeSpies.push(spy)
  return spy
}

function restoreSpies() {
  let spy = activeSpies.pop()
  while (spy) {
    spy.mockRestore()
    spy = activeSpies.pop()
  }
}

interface BrowserEnv {
  storedTheme?: string | null
  storedPalette?: string | null
  denyStorage?: boolean
  darkMode?: boolean
  matchMedia?: boolean
  desktopSet?: ReturnType<typeof vi.fn>
}

function installMatchMedia(darkMode: boolean) {
  const listeners = new Set<() => void>()
  const addEventListener = vi.fn((_type: string, listener: () => void) => {
    listeners.add(listener)
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => ({ matches: darkMode, addEventListener })),
  })
  return { listeners, addEventListener }
}

async function loadTheme(env: BrowserEnv = {}): Promise<{ theme: ThemeModule; listeners: Set<() => void> }> {
  restoreSpies()
  vi.resetModules()

  if (env.denyStorage) {
    trackSpy(
      vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new Error('denied')
      }),
    )
    trackSpy(
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('denied')
      }),
    )
  } else {
    window.localStorage.clear()
    if (env.storedTheme !== undefined && env.storedTheme !== null) {
      window.localStorage.setItem('openpos-theme', env.storedTheme)
    }
    if (env.storedPalette !== undefined && env.storedPalette !== null) {
      window.localStorage.setItem('openpos-palette', env.storedPalette)
    }
  }

  let listeners = new Set<() => void>()
  if (env.matchMedia === false) {
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: undefined })
  } else {
    listeners = installMatchMedia(env.darkMode ?? false).listeners
  }

  if (env.desktopSet) {
    ;(window as unknown as Record<string, unknown>).openposDesktop = { theme: { set: env.desktopSet } }
  } else {
    delete (window as unknown as Record<string, unknown>).openposDesktop
  }

  const theme = (await import('./themeStore')) as ThemeModule
  return { theme, listeners }
}

beforeEach(() => {
  document.documentElement.dataset.mode = ''
  document.documentElement.dataset.palette = ''
})

afterEach(() => {
  restoreSpies()
  window.localStorage.clear()
  delete (window as unknown as Record<string, unknown>).openposDesktop
})

describe('themeStore in a browser', () => {
  it('reads the stored preference and palette on load', async () => {
    const { theme } = await loadTheme({ storedTheme: 'dark', storedPalette: 'coffee' })

    expect(theme.themePreference.value).toBe('dark')
    expect(theme.themePalette.value).toBe('coffee')
    expect(theme.resolvedTheme.value).toBe('dark')
    expect(document.documentElement.dataset.mode).toBe('dark')
    expect(document.documentElement.dataset.palette).toBe('coffee')
  })

  it('installs the generated palette styles once', async () => {
    document.getElementById('openpos-palettes')?.remove()
    const { theme } = await loadTheme()

    const styles = document.querySelectorAll('style#openpos-palettes')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.textContent).toContain("html[data-palette='coffee'] [data-astryx-theme]")

    theme.ensurePaletteStyles()
    expect(document.querySelectorAll('style#openpos-palettes')).toHaveLength(1)
  })

  it('remembers the palette colors for the next boot', async () => {
    const { theme } = await loadTheme({ storedTheme: 'dark', storedPalette: 'ocean' })
    const ocean = THEME_PALETTES.find((palette) => palette.id === 'ocean')

    expect(JSON.parse(window.localStorage.getItem('openpos-boot-colors') ?? 'null')).toEqual({
      light: { canvas: ocean?.preview.light.canvas, accent: ocean?.preview.light.accent },
      dark: { canvas: ocean?.preview.dark.canvas, accent: ocean?.preview.dark.accent },
    })

    theme.setThemePalette('berry')
    expect(window.localStorage.getItem('openpos-boot-colors')).toContain('"canvas":"#f9e8f0"')
  })

  it('paints the saved theme before the app loads (index.html boot script)', async () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
    const bootScript = html.match(/<script>\s*\/\/ Paint the saved theme[\s\S]*?<\/script>/)?.[0] ?? ''
    const run = () => new Function(bootScript.replace(/<\/?script>/g, ''))()
    expect(bootScript).not.toBe('')
    const root = document.documentElement

    installMatchMedia(false)
    window.localStorage.clear()
    window.localStorage.setItem('openpos-theme', 'dark')
    window.localStorage.setItem('openpos-palette', 'coffee')
    window.localStorage.setItem(
      'openpos-boot-colors',
      JSON.stringify({
        light: { canvas: '#f1e9dd', accent: '#8a5a2e' },
        dark: { canvas: '#171210', accent: '#d9a874' },
      }),
    )
    run()
    expect(root.dataset.mode).toBe('dark')
    expect(root.dataset.palette).toBe('coffee')
    expect(root.style.getPropertyValue('--boot-canvas')).toBe('#171210')

    // First visit: nothing saved, so the system mode decides.
    window.localStorage.clear()
    root.style.removeProperty('--boot-canvas')
    installMatchMedia(true)
    run()
    expect(root.dataset.mode).toBe('dark')
    expect(root.dataset.palette).toBe('classic')
    expect(root.style.getPropertyValue('--boot-canvas')).toBe('')

    // Tampered colors are ignored rather than injected.
    window.localStorage.setItem(
      'openpos-boot-colors',
      JSON.stringify({ light: { canvas: 'red;}', accent: '#000000' } }),
    )
    window.localStorage.setItem('openpos-theme', 'light')
    run()
    expect(root.style.getPropertyValue('--boot-canvas')).toBe('')
  })

  it('falls back to the system theme for unknown stored values', async () => {
    const { theme } = await loadTheme({ storedTheme: 'neon', darkMode: true })

    expect(theme.themePreference.value).toBe('system')
    expect(theme.resolvedTheme.value).toBe('dark')
  })

  it('falls back to defaults when storage is unavailable', async () => {
    const { theme } = await loadTheme({ denyStorage: true })

    expect(theme.themePreference.value).toBe('system')
    expect(theme.themePalette.value).toBe('classic')
  })

  it('resolves light without matchMedia and skips the subscription', async () => {
    const { theme } = await loadTheme({ matchMedia: false })

    expect(theme.resolvedTheme.value).toBe('light')
  })

  it('follows system changes only while the preference is system', async () => {
    const { theme, listeners } = await loadTheme({ darkMode: false })
    expect(theme.resolvedTheme.value).toBe('light')

    listeners.forEach((listener) => {
      listener()
    })
    expect(theme.resolvedTheme.value).toBe('light')

    await theme.setThemePreference('dark')
    expect(theme.resolvedTheme.value).toBe('dark')
    expect(document.documentElement.dataset.mode).toBe('dark')
    expect(window.localStorage.getItem('openpos-theme')).toBe('dark')

    listeners.forEach((listener) => {
      listener()
    })
    expect(theme.resolvedTheme.value).toBe('dark')
  })

  it('pushes preference changes to the desktop api', async () => {
    const desktopSet = vi.fn(async () => {})
    const { theme } = await loadTheme({ desktopSet })

    await theme.setThemePreference('light')

    expect(desktopSet).toHaveBeenCalledWith('light')
    expect(theme.resolvedTheme.value).toBe('light')
  })

  it('logs desktop push failures without throwing', async () => {
    const desktopSet = vi.fn(async () => {
      throw new Error('ipc down')
    })
    const { theme } = await loadTheme({ desktopSet })
    const errorSpy = trackSpy(vi.spyOn(console, 'error').mockImplementation(() => {}))

    await theme.setThemePreference('dark')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(theme.themePreference.value).toBe('dark')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('keeps applying the theme when storage writes fail', async () => {
    const { theme } = await loadTheme({})
    trackSpy(
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('denied')
      }),
    )

    await theme.setThemePreference('dark')
    theme.setThemePalette('coffee')

    expect(theme.resolvedTheme.value).toBe('dark')
    expect(theme.themePalette.value).toBe('coffee')
    expect(document.documentElement.dataset.palette).toBe('coffee')
  })

  it('initializes the desktop theme', async () => {
    const desktopSet = vi.fn(async () => {})
    const { theme } = await loadTheme({ storedTheme: 'light', desktopSet })

    await theme.initializeTheme()

    expect(desktopSet).toHaveBeenCalledWith('light')
  })

  it('logs desktop initialization failures without throwing', async () => {
    const desktopSet = vi.fn(async () => {
      throw new Error('ipc down')
    })
    const { theme } = await loadTheme({ desktopSet })
    const errorSpy = trackSpy(vi.spyOn(console, 'error').mockImplementation(() => {}))

    await theme.initializeTheme()

    expect(errorSpy).toHaveBeenCalled()
  })

  it('skips desktop initialization without an api', async () => {
    const { theme } = await loadTheme({})

    await expect(theme.initializeTheme()).resolves.toBeUndefined()
  })

  it('pushes company theme changes to the desktop api', async () => {
    const desktopSet = vi.fn(async () => {})
    const { theme } = await loadTheme({ desktopSet })

    theme.applyCompanyTheme('dark', 'coffee')

    expect(theme.themePreference.value).toBe('dark')
    expect(theme.themePalette.value).toBe('coffee')
    expect(desktopSet).toHaveBeenCalledWith('dark')
  })
})
