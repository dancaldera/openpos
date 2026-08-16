import { signal } from '@preact/signals'
import { companySettingsService } from '../../services/company-settings-turso'
import { translationService } from '../../services/translations'

export const languageStore = {
  currentLocale: signal<string>('en'),
  isLoading: signal<boolean>(false),
  availableLocales: signal<string[]>(['en', 'es']),
}

export const languageActions = {
  async changeLanguage(locale: string): Promise<void> {
    languageStore.isLoading.value = true

    try {
      await translationService.setLocale(locale)
      languageStore.currentLocale.value = locale

      // Save to company settings
      await companySettingsService.updateSettings({ language: locale })
    } catch (error) {
      console.error('Failed to change language:', error)
    } finally {
      languageStore.isLoading.value = false
    }
  },

  async loadLanguage(locale: string): Promise<void> {
    await translationService.loadTranslation(locale)
  },

  async initializeLanguage(): Promise<void> {
    try {
      const settings = await companySettingsService.getSettings()
      const defaultLang = settings.language || 'en'

      await translationService.setLocale(defaultLang)
      languageStore.currentLocale.value = defaultLang
    } catch (error) {
      console.error('Failed to initialize language:', error)
      // Fallback to English if company settings are not available
      await translationService.setLocale('en')
      languageStore.currentLocale.value = 'en'
    }
  },
}
