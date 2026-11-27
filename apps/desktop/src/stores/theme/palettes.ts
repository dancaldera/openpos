export type ThemePalette =
  | 'classic'
  | 'coffee'
  | 'ocean'
  | 'forest'
  | 'sunset'
  | 'berry'
  | 'lavender'
  | 'slate'
  | 'oxblood'
  | 'iron'
  | 'grain'

/** Base colors of one palette mode. Every other theme token is derived from these. */
export interface PalettePreview {
  /** Page background (`--color-background-body`). */
  canvas: string
  /** Cards, popovers and other raised surfaces. */
  surface: string
  text: string
  accent: string
}

export interface ThemePaletteDef {
  id: ThemePalette
  labelKey: string
  preview: { light: PalettePreview; dark: PalettePreview }
}

/**
 * Business-oriented color palettes. Each palette ships a light and a dark
 * variant. These values are the single source of truth: `buildPaletteCss`
 * turns them into the theme variables the app uses, and the settings picker
 * previews them as-is. `classic` mirrors the neutral theme and adds no CSS.
 */
export const THEME_PALETTES: readonly ThemePaletteDef[] = [
  {
    id: 'classic',
    labelKey: 'settings.paletteClassic',
    preview: {
      light: { canvas: '#f1f1f1', surface: '#ffffff', text: '#000000', accent: '#1b1b1b' },
      dark: { canvas: '#1b1b1b', surface: '#262626', text: '#ffffff', accent: '#f1f1f1' },
    },
  },
  {
    id: 'coffee',
    labelKey: 'settings.paletteCoffee',
    preview: {
      light: { canvas: '#f1e9dd', surface: '#faf6f0', text: '#2b211a', accent: '#8a5a2e' },
      dark: { canvas: '#171210', surface: '#231a14', text: '#f6efe6', accent: '#d9a874' },
    },
  },
  {
    id: 'ocean',
    labelKey: 'settings.paletteOcean',
    preview: {
      light: { canvas: '#e9f0f6', surface: '#f4f8fb', text: '#142838', accent: '#1f5f8b' },
      dark: { canvas: '#0c141b', surface: '#14222e', text: '#e9f2f9', accent: '#82b8dd' },
    },
  },
  {
    id: 'forest',
    labelKey: 'settings.paletteForest',
    preview: {
      light: { canvas: '#e7f0e7', surface: '#f4f9f4', text: '#16281c', accent: '#2f6b46' },
      dark: { canvas: '#0e1712', surface: '#16251c', text: '#eaf6ee', accent: '#7fc79b' },
    },
  },
  {
    id: 'sunset',
    labelKey: 'settings.paletteSunset',
    preview: {
      light: { canvas: '#f9e9dd', surface: '#fdf6f1', text: '#2f1d12', accent: '#b04a16' },
      dark: { canvas: '#1a120b', surface: '#271a10', text: '#faefe4', accent: '#f2a06b' },
    },
  },
  {
    id: 'berry',
    labelKey: 'settings.paletteBerry',
    preview: {
      light: { canvas: '#f9e8f0', surface: '#fdf5f8', text: '#2b1620', accent: '#b02a63' },
      dark: { canvas: '#1a0f14', surface: '#261722', text: '#f9edf3', accent: '#e87fae' },
    },
  },
  {
    id: 'lavender',
    labelKey: 'settings.paletteLavender',
    preview: {
      light: { canvas: '#ede8f6', surface: '#f8f6fc', text: '#1f1830', accent: '#6d4fae' },
      dark: { canvas: '#14101d', surface: '#1e192b', text: '#f0ecf9', accent: '#b39ae8' },
    },
  },
  {
    id: 'slate',
    labelKey: 'settings.paletteSlate',
    preview: {
      light: { canvas: '#e9edef', surface: '#f5f7f8', text: '#16202a', accent: '#33566e' },
      dark: { canvas: '#10161b', surface: '#182028', text: '#eaf0f4', accent: '#8fb4cc' },
    },
  },
  {
    id: 'oxblood',
    labelKey: 'settings.paletteOxblood',
    preview: {
      light: { canvas: '#f3e7e4', surface: '#faf5f3', text: '#241314', accent: '#7c2d2d' },
      dark: { canvas: '#170e0d', surface: '#241716', text: '#f7ebe9', accent: '#d99a9a' },
    },
  },
  {
    id: 'iron',
    labelKey: 'settings.paletteIron',
    preview: {
      light: { canvas: '#ebeeee', surface: '#f6f7f7', text: '#171a1d', accent: '#3e4a52' },
      dark: { canvas: '#101315', surface: '#1b2023', text: '#eef1f2', accent: '#9fb2bd' },
    },
  },
  {
    id: 'grain',
    labelKey: 'settings.paletteGrain',
    preview: {
      light: { canvas: '#f2ecd9', surface: '#faf6ea', text: '#262015', accent: '#7f611c' },
      dark: { canvas: '#16130c', surface: '#232015', text: '#f5efe0', accent: '#cfa84e' },
    },
  },
]

const IS_PALETTE_ID: Record<ThemePalette, true> = {
  classic: true,
  coffee: true,
  ocean: true,
  forest: true,
  sunset: true,
  berry: true,
  lavender: true,
  slate: true,
  oxblood: true,
  iron: true,
  grain: true,
}

export function normalizeThemePalette(value: unknown): ThemePalette {
  return typeof value === 'string' && value in IS_PALETTE_ID ? (value as ThemePalette) : 'classic'
}

const IS_THEME_MODE: Record<'system' | 'light' | 'dark', true> = {
  system: true,
  light: true,
  dark: true,
}

export function normalizeThemeMode(value: unknown): 'system' | 'light' | 'dark' | undefined {
  return typeof value === 'string' && value in IS_THEME_MODE ? (value as 'system' | 'light' | 'dark') : undefined
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** Mix two hex colors in sRGB; `weight` is the share of `a`. */
export function mixHex(a: string, b: string, weight: number): string {
  const [ar, ag, ab] = channels(a)
  const [br, bg, bb] = channels(b)
  const mixChannel = (x: number, y: number) => Math.round(x * weight + y * (1 - weight))
  return `#${[mixChannel(ar, br), mixChannel(ag, bg), mixChannel(ab, bb)]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

/** WCAG relative luminance contrast ratio between two hex colors. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = channels(hex).map((channel) => {
      const value = channel / 255
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0)
  }
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)
}

/** Theme variables for one palette mode, derived like the neutral theme derives its own. */
export function paletteTokens(colors: PalettePreview, mode: 'light' | 'dark'): Record<string, string> {
  const { canvas, surface, text, accent } = colors
  const dark = mode === 'dark'
  return {
    '--color-background-body': canvas,
    '--color-background-muted': canvas,
    '--color-background-surface': surface,
    '--color-background-card': surface,
    '--color-background-popover': surface,
    '--color-text-primary': text,
    '--color-text-secondary': mixHex(text, canvas, dark ? 0.66 : 0.72),
    '--color-text-disabled': mixHex(text, canvas, dark ? 0.34 : 0.45),
    '--color-border-emphasized': mixHex(text, canvas, dark ? 0.28 : 0.17),
    '--color-accent': accent,
    '--color-text-accent': accent,
    '--color-accent-muted': mixHex(accent, canvas, dark ? 0.35 : 0.28),
    '--color-on-accent': dark ? canvas : '#ffffff',
  }
}

/**
 * CSS for every palette but classic. Rules target both `html` (page chrome
 * outside the theme root) and the Astryx theme root, unlayered so they win
 * over the theme's own token layer.
 */
export function buildPaletteCss(palettes: readonly ThemePaletteDef[] = THEME_PALETTES): string {
  return palettes
    .filter((palette) => palette.id !== 'classic')
    .map((palette) => {
      const light = paletteTokens(palette.preview.light, 'light')
      const dark = paletteTokens(palette.preview.dark, 'dark')
      const declarations = Object.keys(light)
        .map((name) => `  ${name}: light-dark(${light[name]}, ${dark[name]});`)
        .join('\n')
      return `html[data-palette='${palette.id}'],\nhtml[data-palette='${palette.id}'] [data-astryx-theme] {\n${declarations}\n}`
    })
    .join('\n\n')
}
