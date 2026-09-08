import { useTranslation } from '../hooks/useTranslation'
import { THEME_PALETTES, type ThemePalette } from '../stores/theme/palettes'

interface ThemePalettePickerProps {
  value: ThemePalette
  onChange: (palette: ThemePalette) => void
}

export function ThemePalettePicker({ value, onChange }: ThemePalettePickerProps) {
  const { t } = useTranslation()

  return (
    <div>
      <span class="mb-1.5 block text-sm font-medium text-void">{t('settings.colorPalette')}</span>
      <div class="flex flex-wrap gap-2">
        {THEME_PALETTES.map((palette) => (
          <button
            type="button"
            key={palette.id}
            onClick={() => onChange(palette.id)}
            aria-pressed={value === palette.id}
            class={`flex w-[76px] flex-col gap-1.5 rounded-cards border p-1.5 transition-colors ${
              value === palette.id ? 'border-accent' : 'border-fog-border hover:border-graphite'
            }`}
          >
            <span class="flex h-6 overflow-hidden rounded-[4px] border border-fog-border">
              <span
                class="flex w-1/2 flex-col justify-end p-[3px]"
                style={{ background: palette.preview.light.canvas }}
              >
                <span class="flex items-center gap-[2px]">
                  <span class="h-1.5 flex-1 rounded-[2px]" style={{ background: palette.preview.light.surface }} />
                  <span class="h-1.5 w-1.5 rounded-full" style={{ background: palette.preview.light.accent }} />
                </span>
              </span>
              <span class="flex w-1/2 flex-col justify-end p-[3px]" style={{ background: palette.preview.dark.canvas }}>
                <span class="flex items-center gap-[2px]">
                  <span class="h-1.5 flex-1 rounded-[2px]" style={{ background: palette.preview.dark.surface }} />
                  <span class="h-1.5 w-1.5 rounded-full" style={{ background: palette.preview.dark.accent }} />
                </span>
              </span>
            </span>
            <span class="truncate text-xs text-graphite">{t(palette.labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
