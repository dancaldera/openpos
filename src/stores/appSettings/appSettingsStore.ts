import { signal } from '@preact/signals'
import { companySettingsService } from '../../services/company-settings-sqlite'

class AppSettingsStore {
  private static instance: AppSettingsStore

  appName = signal<string>('OpenPOS')
  companyName = signal<string>('')
  isLoading = signal<boolean>(true)
  isInitialized = signal<boolean>(false)

  static getInstance(): AppSettingsStore {
    if (!AppSettingsStore.instance) {
      AppSettingsStore.instance = new AppSettingsStore()
    }
    return AppSettingsStore.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized.value) return

    try {
      this.isLoading.value = true
      const settings = await companySettingsService.getSettings()
      this.appName.value = settings.appName
      this.companyName.value = settings.name
      this.isInitialized.value = true
    } catch (error) {
      console.error('Failed to initialize app settings:', error)
      this.appName.value = 'OpenPOS'
      this.companyName.value = 'Titanic POS'
      this.isInitialized.value = true
    } finally {
      this.isLoading.value = false
    }
  }

  async updateAppName(newName: string): Promise<boolean> {
    if (!newName.trim()) return false

    try {
      const result = await companySettingsService.updateSettings({ appName: newName.trim() })
      if (result.success && result.settings) {
        this.appName.value = result.settings.appName
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to update app name:', error)
      return false
    }
  }

  async updateCompanyName(newName: string): Promise<boolean> {
    if (!newName.trim()) return false

    try {
      const result = await companySettingsService.updateSettings({ name: newName.trim() })
      if (result.success && result.settings) {
        this.companyName.value = result.settings.name
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to update company name:', error)
      return false
    }
  }
}

export const appSettingsStore = AppSettingsStore.getInstance()
