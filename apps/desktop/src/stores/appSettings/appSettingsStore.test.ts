import { beforeEach, describe, expect, it, vi } from 'vitest'

const { companySettingsService, applyCompanyTheme } = vi.hoisted(() => ({
  companySettingsService: {
    getSettings: vi.fn(async () => ({
      appName: 'TestPOS',
      name: 'Test Company',
      themeMode: 'dark',
      themePalette: 'coffee',
    })),
    updateSettings: vi.fn(async () => ({ success: true, settings: { appName: 'TestPOS' } })),
  },
  applyCompanyTheme: vi.fn(),
}))

vi.mock('../../services/company-settings-turso', () => ({
  companySettingsService,
}))

vi.mock('../theme/themeStore', () => ({
  applyCompanyTheme,
}))

const { appSettingsStore } = await import('./appSettingsStore')

describe('appSettingsStore', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    companySettingsService.getSettings.mockReset()
    companySettingsService.updateSettings.mockReset()
    applyCompanyTheme.mockClear()
    errorSpy.mockClear()
    companySettingsService.getSettings.mockResolvedValue({
      appName: 'TestPOS',
      name: 'Test Company',
      themeMode: 'dark',
      themePalette: 'coffee',
    })
    companySettingsService.updateSettings.mockResolvedValue({ success: true, settings: { appName: 'TestPOS' } })
    appSettingsStore.appName.value = 'OpenPOS'
    appSettingsStore.companyName.value = ''
    appSettingsStore.isLoading.value = true
    appSettingsStore.isInitialized.value = false
  })

  it('initializes from company settings and applies the theme', async () => {
    await appSettingsStore.initialize()

    expect(appSettingsStore.appName.value).toBe('TestPOS')
    expect(appSettingsStore.companyName.value).toBe('Test Company')
    expect(applyCompanyTheme).toHaveBeenCalledWith('dark', 'coffee')
    expect(appSettingsStore.isInitialized.value).toBe(true)
    expect(appSettingsStore.isLoading.value).toBe(false)
  })

  it('skips repeat initialization unless forced', async () => {
    await appSettingsStore.initialize()
    companySettingsService.getSettings.mockClear()

    await appSettingsStore.initialize()

    expect(companySettingsService.getSettings).not.toHaveBeenCalled()

    await appSettingsStore.initialize(true)

    expect(companySettingsService.getSettings).toHaveBeenCalledTimes(1)
  })

  it('falls back to defaults when initialization fails', async () => {
    companySettingsService.getSettings.mockRejectedValueOnce(new Error('db missing'))

    await appSettingsStore.initialize()

    expect(appSettingsStore.appName.value).toBe('OpenPOS')
    expect(appSettingsStore.companyName.value).toBe('Titanic POS')
    expect(appSettingsStore.isInitialized.value).toBe(true)
    expect(appSettingsStore.isLoading.value).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('updates the app name', async () => {
    companySettingsService.updateSettings.mockResolvedValueOnce({
      success: true,
      settings: { appName: 'Renamed' },
    })

    const result = await appSettingsStore.updateAppName('  Renamed  ')

    expect(result).toBe(true)
    expect(appSettingsStore.appName.value).toBe('Renamed')
    expect(companySettingsService.updateSettings).toHaveBeenCalledWith({ appName: 'Renamed' })
  })

  it('rejects blank app names without calling the service', async () => {
    const result = await appSettingsStore.updateAppName('   ')

    expect(result).toBe(false)
    expect(companySettingsService.updateSettings).not.toHaveBeenCalled()
  })

  it('returns false when the app name update is not successful', async () => {
    companySettingsService.updateSettings.mockResolvedValueOnce({ success: false })

    const result = await appSettingsStore.updateAppName('Nope')

    expect(result).toBe(false)
    expect(appSettingsStore.appName.value).toBe('OpenPOS')
  })

  it('returns false when the app name update throws', async () => {
    companySettingsService.updateSettings.mockRejectedValueOnce(new Error('db missing'))

    const result = await appSettingsStore.updateAppName('Nope')

    expect(result).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('updates the company name', async () => {
    companySettingsService.updateSettings.mockResolvedValueOnce({
      success: true,
      settings: { name: 'Acme' },
    })

    const result = await appSettingsStore.updateCompanyName('  Acme  ')

    expect(result).toBe(true)
    expect(appSettingsStore.companyName.value).toBe('Acme')
    expect(companySettingsService.updateSettings).toHaveBeenCalledWith({ name: 'Acme' })
  })

  it('rejects blank company names without calling the service', async () => {
    const result = await appSettingsStore.updateCompanyName('')

    expect(result).toBe(false)
    expect(companySettingsService.updateSettings).not.toHaveBeenCalled()
  })

  it('returns false when the company name update is not successful', async () => {
    companySettingsService.updateSettings.mockResolvedValueOnce({ success: false, error: 'nope' })

    const result = await appSettingsStore.updateCompanyName('Acme')

    expect(result).toBe(false)
  })

  it('returns false when the company name update throws', async () => {
    companySettingsService.updateSettings.mockRejectedValueOnce(new Error('db missing'))

    const result = await appSettingsStore.updateCompanyName('Acme')

    expect(result).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('exposes the shared singleton instance', async () => {
    const storeConstructor = appSettingsStore.constructor as unknown as {
      getInstance(): typeof appSettingsStore
    }

    expect(storeConstructor.getInstance()).toBe(appSettingsStore)
  })
})
