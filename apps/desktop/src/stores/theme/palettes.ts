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

export interface PalettePreview {
  canvas: string
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
 * variant; the actual CSS variables live in `App.css` under
 * `[data-palette='<id>']` / `[data-mode='dark'][data-palette='<id>']`.
 * Keep the preview hexes in sync with those definitions.
 */
export const THEME_PALETTES: readonly ThemePaletteDef[] = [
  {
    id: 'classic',
    labelKey: 'settings.paletteClassic',
    preview: {
      light: { canvas: '#ffffff', surface: '#f1f1f1', text: '#000000', accent: '#000000' },
      dark: { canvas: '#0f0f0f', surface: '#1f1f1f', text: '#ffffff', accent: '#ffffff' },
    },
  },
  {
    id: 'coffee',
    labelKey: 'settings.paletteCoffee',
    preview: {
      light: { canvas: '#faf6f0', surface: '#f1e9dd', text: '#2b211a', accent: '#8a5a2e' },
      dark: { canvas: '#171210', surface: '#231a14', text: '#f6efe6', accent: '#d9a874' },
    },
  },
  {
    id: 'ocean',
    labelKey: 'settings.paletteOcean',
    preview: {
      light: { canvas: '#f4f8fb', surface: '#e9f0f6', text: '#142838', accent: '#1f5f8b' },
      dark: { canvas: '#0c141b', surface: '#14222e', text: '#e9f2f9', accent: '#82b8dd' },
    },
  },
  {
    id: 'forest',
    labelKey: 'settings.paletteForest',
    preview: {
      light: { canvas: '#f4f9f4', surface: '#e7f0e7', text: '#16281c', accent: '#2f6b46' },
      dark: { canvas: '#0e1712', surface: '#16251c', text: '#eaf6ee', accent: '#7fc79b' },
    },
  },
  {
    id: 'sunset',
    labelKey: 'settings.paletteSunset',
    preview: {
      light: { canvas: '#fdf6f1', surface: '#f9e9dd', text: '#2f1d12', accent: '#c2551e' },
      dark: { canvas: '#1a120b', surface: '#271a10', text: '#faefe4', accent: '#f2a06b' },
    },
  },
  {
    id: 'berry',
    labelKey: 'settings.paletteBerry',
    preview: {
      light: { canvas: '#fdf5f8', surface: '#f9e8f0', text: '#2b1620', accent: '#b02a63' },
      dark: { canvas: '#1a0f14', surface: '#261722', text: '#f9edf3', accent: '#e87fae' },
    },
  },
  {
    id: 'lavender',
    labelKey: 'settings.paletteLavender',
    preview: {
      light: { canvas: '#f8f6fc', surface: '#ede8f6', text: '#1f1830', accent: '#6d4fae' },
      dark: { canvas: '#14101d', surface: '#1e192b', text: '#f0ecf9', accent: '#b39ae8' },
    },
  },
  {
    id: 'slate',
    labelKey: 'settings.paletteSlate',
    preview: {
      light: { canvas: '#f5f7f8', surface: '#e9edef', text: '#16202a', accent: '#33566e' },
      dark: { canvas: '#10161b', surface: '#182028', text: '#eaf0f4', accent: '#8fb4cc' },
    },
  },
  {
    id: 'oxblood',
    labelKey: 'settings.paletteOxblood',
    preview: {
      light: { canvas: '#faf5f3', surface: '#f3e7e4', text: '#241314', accent: '#7c2d2d' },
      dark: { canvas: '#170e0d', surface: '#241716', text: '#f7ebe9', accent: '#d99a9a' },
    },
  },
  {
    id: 'iron',
    labelKey: 'settings.paletteIron',
    preview: {
      light: { canvas: '#f6f7f7', surface: '#ebeeee', text: '#171a1d', accent: '#3e4a52' },
      dark: { canvas: '#101315', surface: '#1b2023', text: '#eef1f2', accent: '#9fb2bd' },
    },
  },
  {
    id: 'grain',
    labelKey: 'settings.paletteGrain',
    preview: {
      light: { canvas: '#faf6ea', surface: '#f2ecd9', text: '#262015', accent: '#7f611c' },
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
