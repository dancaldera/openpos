import { beforeEach, describe, expect, it, vi } from 'vitest'

const { companySettingsService, translationService } = vi.hoisted(() => ({
  companySettingsService: {
    getSettings: vi.fn(async () => ({ language: 'es' })),
    updateSettings: vi.fn(async () => ({})),
  },
  translationService: {
    loadTranslation: vi.fn(async () => {}),
    setLocale: vi.fn(async () => {}),
  },
}))

vi.mock('../../services/company-settings-turso', () => ({
  companySettingsService,
}))

vi.mock('../../services/translations', () => ({
  translationService,
}))

const { languageActions } = await import('./languageActions')
const { languageStore } = await import('./languageStore')

describe('languageActions', () => {
  beforeEach(() => {
    companySettingsService.getSettings.mockReset()
    companySettingsService.updateSettings.mockReset()
    translationService.loadTranslation.mockReset()
    translationService.setLocale.mockReset()
    companySettingsService.getSettings.mockResolvedValue({ language: 'es' })
    companySettingsService.updateSettings.mockResolvedValue({})
    languageStore.currentLocale.value = 'en'
    languageStore.isLoading.value = false
  })

  it('changes language and persists it', async () => {
    await languageActions.changeLanguage('es')

    expect(translationService.setLocale).toHaveBeenCalledWith('es')
    expect(languageStore.currentLocale.value).toBe('es')
    expect(companySettingsService.updateSettings).toHaveBeenCalledWith({ language: 'es' })
    expect(languageStore.isLoading.value).toBe(false)
  })

  it('logs change failures without throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      translationService.setLocale.mockRejectedValueOnce(new Error('nope'))

      await languageActions.changeLanguage('es')

      expect(error).toHaveBeenCalled()
      expect(languageStore.isLoading.value).toBe(false)
    } finally {
      error.mockRestore()
    }
  })

  it('loads translations directly', async () => {
    await languageActions.loadLanguage('es')
    expect(translationService.loadTranslation).toHaveBeenCalledWith('es')
  })

  it('initializes from company settings with an english fallback', async () => {
    await languageActions.initializeLanguage()

    expect(translationService.setLocale).toHaveBeenCalledWith('es')
    expect(languageStore.currentLocale.value).toBe('es')

    companySettingsService.getSettings.mockReset()
    companySettingsService.getSettings.mockResolvedValueOnce({})
    await languageActions.initializeLanguage()
    expect(translationService.setLocale).toHaveBeenCalledWith('en')
  })

  it('falls back to english when settings fail', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      companySettingsService.getSettings.mockRejectedValueOnce(new Error('db down'))

      await languageActions.initializeLanguage()

      expect(error).toHaveBeenCalled()
      expect(translationService.setLocale).toHaveBeenCalledWith('en')
      expect(languageStore.currentLocale.value).toBe('en')
    } finally {
      error.mockRestore()
    }
  })
})
