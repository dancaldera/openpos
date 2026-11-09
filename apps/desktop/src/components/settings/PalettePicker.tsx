import { Grid } from '@astryxdesign/core/Grid'
import { SelectableCard } from '@astryxdesign/core/SelectableCard'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useTranslation } from '../../hooks/useTranslation'
import { type PalettePreview, THEME_PALETTES, type ThemePalette } from '../../stores/theme/palettes'

interface PalettePickerProps {
  value: ThemePalette
  onChange: (palette: ThemePalette) => void
}

/**
 * Light and dark halves of a palette preview. The colors are the palette data
 * itself (kept in sync with `App.css`), so they are applied inline.
 */
function PaletteSwatch({ light, dark }: { light: PalettePreview; dark: PalettePreview }) {
  return (
    <div className="flex h-10 overflow-hidden rounded-md" aria-hidden="true">
      {[light, dark].map((preview, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: two fixed halves
          key={index}
          className="flex flex-1 items-end gap-1 p-1.5"
          style={{ background: preview.canvas }}
        >
          <span className="h-2 flex-1 rounded-sm" style={{ background: preview.surface }} />
          <span className="size-2 rounded-full" style={{ background: preview.accent }} />
        </div>
      ))}
    </div>
  )
}

export function PalettePicker({ value, onChange }: PalettePickerProps) {
  const { t } = useTranslation()

  return (
    <VStack gap={2}>
      <Text type="label">{t('settings.colorPalette')}</Text>
      <Grid columns={{ minWidth: 120 }} gap={3}>
        {THEME_PALETTES.map((palette) => {
          const name = t(palette.labelKey)
          return (
            <SelectableCard
              key={palette.id}
              label={name}
              isSelected={value === palette.id}
              onChange={(isSelected) => {
                if (isSelected) onChange(palette.id)
              }}
              padding={2}
            >
              <VStack gap={2}>
                <PaletteSwatch light={palette.preview.light} dark={palette.preview.dark} />
                <Text type="supporting" maxLines={1}>
                  {name}
                </Text>
              </VStack>
            </SelectableCard>
          )
        })}
      </Grid>
    </VStack>
  )
}
