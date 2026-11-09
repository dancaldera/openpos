import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useTranslation } from '../../hooks/useTranslation'
import { companySettingsService } from '../../services/company-settings-turso'
import { languageActions } from '../../stores/language/languageActions'
import { languageStore } from '../../stores/language/languageStore'
import type { ThemePalette } from '../../stores/theme/palettes'
import {
  setThemePalette,
  setThemePreference,
  type ThemePreference,
  themePalette,
  themePreference,
} from '../../stores/theme/themeStore'
import { PalettePicker } from './PalettePicker'
import { SettingsGroup } from './SettingsGroup'

const THEME_MODES: ThemePreference[] = ['system', 'light', 'dark']
const THEME_MODE_LABEL_KEYS: Record<ThemePreference, string> = {
  system: 'settings.systemMode',
  light: 'settings.lightMode',
  dark: 'settings.darkMode',
}

/** Theme choices roam with the store: they are applied locally and saved to company settings. */
function syncThemeToCompany(prefs: { themeMode?: ThemePreference; themePalette?: ThemePalette }) {
  void companySettingsService.updateSettings(prefs).then((result) => {
    if (!result.success) console.error('Failed to sync theme:', result.error)
  })
}

/** Theme mode, color palette and interface language. Each applies immediately. */
export function PreferencesSettings() {
  const { t, getCurrentLocale, getSupportedLocales } = useTranslation()
  const mode = themePreference.value
  const palette = themePalette.value
  const locale = getCurrentLocale()

  const changeMode = async (next: string) => {
    const nextMode = next as ThemePreference
    await setThemePreference(nextMode)
    syncThemeToCompany({ themeMode: nextMode })
  }

  const changePalette = (next: ThemePalette) => {
    setThemePalette(next)
    syncThemeToCompany({ themePalette: next })
  }

  return (
    <VStack gap={8}>
      <SettingsGroup title={t('settings.appearance')} description={t('settings.themeDesc')}>
        <VStack gap={2}>
          <Text type="label">{t('settings.theme')}</Text>
          <SegmentedControl label={t('settings.theme')} value={mode} onChange={(value) => void changeMode(value)}>
            {THEME_MODES.map((item) => (
              <SegmentedControlItem key={item} value={item} label={t(THEME_MODE_LABEL_KEYS[item])} />
            ))}
          </SegmentedControl>
        </VStack>
        <PalettePicker value={palette} onChange={changePalette} />
      </SettingsGroup>

      <SettingsGroup title={t('settings.language')} description={t('settings.languageDesc')}>
        <Selector
          label={t('settings.language')}
          value={locale}
          onChange={(value) => {
            if (value) void languageActions.changeLanguage(value)
          }}
          options={getSupportedLocales().map((item) => ({
            value: item.code,
            label: item.nativeName,
            description: item.nativeName === item.name ? undefined : item.name,
          }))}
          isLoading={languageStore.isLoading.value}
          width={280}
        />
      </SettingsGroup>
    </VStack>
  )
}
