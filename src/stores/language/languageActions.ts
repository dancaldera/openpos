import { companySettingsService } from '../../services/company-settings-sqlite'
import { translationService } from '../../services/translations'
import { languageStore } from './languageStore'

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

      await this.changeLanguage(defaultLang)
    } catch (error) {
      console.error('Failed to initialize language:', error)
      // Fallback to English if company settings are not available
      await this.changeLanguage('en')
    }
  },
}
