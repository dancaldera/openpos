import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { Button, Dialog, Input, LanguageSelector, Select } from '../components/ui'
import { useTranslation } from '../hooks/useTranslation'
import { requireDesktopApi } from '../lib/desktop'
import { type CompanySettings, companySettingsService, SUPPORTED_CURRENCIES } from '../services/company-settings-turso'
import { appSettingsStore } from '../stores/appSettings/appSettingsStore'

export default function Settings() {
  const { t } = useTranslation()
  const panelClass = 'rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
  const sectionTitleClass = 'mb-6 text-xl font-semibold text-gray-900 dark:text-gray-100'
  const helperTextClass = 'text-sm text-gray-500 dark:text-gray-400'

  const [greetMsg, setGreetMsg] = useState('')
  const [name, setName] = useState('')
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [localSettings, setLocalSettings] = useState<CompanySettings | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setIsLoading(true)
      const companySettings = await companySettingsService.getSettings()
      setSettings(companySettings)
      setLocalSettings(companySettings)
      setHasChanges(false)
    } catch (err: unknown) {
      toast.error((err as Error)?.message || t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = <K extends keyof CompanySettings>(field: K, value: CompanySettings[K]) => {
    if (!localSettings) return
    setLocalSettings({ ...localSettings, [field]: value })
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!localSettings || !settings) return

    try {
      setIsSaving(true)
      const result = await companySettingsService.updateSettings(localSettings)

      if (result.success && result.settings) {
        setSettings(result.settings)
        setLocalSettings(result.settings)
        appSettingsStore.appName.value = result.settings.appName
        appSettingsStore.companyName.value = result.settings.name
        setHasChanges(false)
        toast.success(t('settings.settingsUpdated'))
      } else {
        toast.error(result.error || t('errors.generic'))
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || t('errors.generic'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    if (settings) {
      setLocalSettings(settings)
      setHasChanges(false)
    }
  }

  const handleResetToDefaults = async () => {
    try {
      setIsSaving(true)
      const result = await companySettingsService.resetToDefaults()

      if (result.success && result.settings) {
        setSettings(result.settings)
        setLocalSettings(result.settings)
        appSettingsStore.appName.value = result.settings.appName
        appSettingsStore.companyName.value = result.settings.name
        setHasChanges(false)
        toast.success(t('success.updated'))
        setIsResetDialogOpen(false)
      } else {
        toast.error(result.error || t('errors.generic'))
      }
    } catch (err: unknown) {
      toast.error((err as Error)?.message || t('errors.generic'))
    } finally {
      setIsSaving(false)
    }
  }

  async function greet() {
    try {
      const message = await requireDesktopApi().greet(name)
      setGreetMsg(message)
      toast.success(t('settings.greetingSuccess'))
    } catch (err: unknown) {
      toast.error((err as Error)?.message || t('errors.generic'))
    }
  }

  if (isLoading) {
    return (
      <div class="max-w-6xl mx-auto px-6 py-4">
        <div class={`${panelClass} p-6`}>
          <div class="text-center py-8">
            <div class="w-8 h-8 bg-blue-600 rounded-full animate-spin border-2 border-transparent border-t-white mx-auto mb-4"></div>
            <p class="text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="max-w-6xl mx-auto px-6 py-4">
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('settings.title')}</h2>
            <span class="text-gray-600 dark:text-gray-400">{t('settings.subtitle')}</span>
          </div>
          <div class="flex gap-3">
            {hasChanges && (
              <>
                <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                  {t('common.cancel')}
                </Button>
                <Button variant="primary" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? t('common.loading') : t('common.save')}
                </Button>
              </>
            )}
            <Button
              variant="outline"
              onClick={() => setIsResetDialogOpen(true)}
              disabled={isSaving}
              class="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              {t('settings.resetDefaults')}
            </Button>
          </div>
        </div>

        {localSettings && (
          <div class="space-y-8">
            {/* Company Information */}
            <div class={`${panelClass} p-6`}>
              <h2 class={sectionTitleClass}>{t('settings.companyInfo')}</h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Input
                    label={t('settings.companyName')}
                    value={localSettings.name}
                    onInput={(e) => handleChange('name', (e.target as HTMLInputElement).value)}
                    disabled={isSaving}
                    placeholder={t('settings.companyName')}
                    class="mb-2"
                  />
                  <span class={helperTextClass}>{t('settings.companyNameDesc')}</span>
                </div>
                <div>
                  <Input
                    label={t('settings.appName')}
                    value={localSettings.appName}
                    onInput={(e) => handleChange('appName', (e.target as HTMLInputElement).value)}
                    disabled={isSaving}
                    placeholder={t('settings.appName')}
                    class="mb-2"
                  />
                  <span class={helperTextClass}>{t('settings.appNameDesc')}</span>
                </div>
                <div>
                  <Input
                    label={t('common.description')}
                    value={localSettings.description}
                    onInput={(e) => handleChange('description', (e.target as HTMLInputElement).value)}
                    disabled={isSaving}
                    placeholder={t('common.description')}
                    class="mb-2"
                  />
                  <span class={helperTextClass}>{t('settings.descriptionDesc')}</span>
                </div>
                <div>
                  <Input
                    label={t('common.address')}
                    value={localSettings.address || ''}
                    onInput={(e) => handleChange('address', (e.target as HTMLInputElement).value || undefined)}
                    disabled={isSaving}
                    placeholder={t('common.address')}
                    class="mb-2"
                  />
                  <span class={helperTextClass}>{t('settings.addressDesc')}</span>
                </div>
                <div>
                  <Input
                    label={t('common.phone')}
                    value={localSettings.phone || ''}
                    onInput={(e) => handleChange('phone', (e.target as HTMLInputElement).value || undefined)}
                    disabled={isSaving}
                    placeholder={t('common.phone')}
                    class="mb-2"
                  />
                  <span class={helperTextClass}>{t('settings.phoneDesc')}</span>
                </div>
                <div>
                  <Input
                    label={t('common.email')}
                    type="email"
                    value={localSettings.email || ''}
                    onInput={(e) => handleChange('email', (e.target as HTMLInputElement).value || undefined)}
                    disabled={isSaving}
                    placeholder={t('common.email')}
                    class="mb-2"
                  />
                  <span class={helperTextClass}>{t('settings.emailDesc')}</span>
                </div>
                <div>
                  <Input
                    label={t('settings.website')}
                    type="text"
                    value={localSettings.website || ''}
                    onInput={(e) => handleChange('website', (e.target as HTMLInputElement).value || undefined)}
                    disabled={isSaving}
                    placeholder="https://example.com"
                    class="mb-2"
                  />
                  <span class={helperTextClass}>{t('settings.websiteDesc')}</span>
                </div>
              </div>
            </div>

            {/* Tax Configuration */}
            <div class={`${panelClass} p-6`}>
              <h2 class={sectionTitleClass}>{t('settings.taxSettings')}</h2>
              <div class="space-y-6">
                <div class="flex items-center space-x-4">
                  <label class="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localSettings.taxEnabled}
                      onChange={(e) => handleChange('taxEnabled', (e.target as HTMLInputElement).checked)}
                      disabled={isSaving}
                      class="h-5 w-5 rounded border-gray-300 bg-white text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900"
                    />
                    <span class="font-medium text-gray-900 dark:text-gray-100">{t('settings.enableTax')}</span>
                  </label>
                </div>
                {localSettings.taxEnabled && (
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Input
                        label={t('settings.taxRate')}
                        type="number"
                        value={localSettings.taxPercentage.toString()}
                        onInput={(e) =>
                          handleChange('taxPercentage', parseFloat((e.target as HTMLInputElement).value) || 0)
                        }
                        disabled={isSaving}
                        class="mb-2"
                        placeholder="10.0"
                      />
                      <span class={helperTextClass}>{t('settings.taxRateDesc')}</span>
                    </div>
                    <div class="flex items-center mt-6">
                      <div class="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
                        <span class="text-sm text-blue-700 dark:text-blue-300">
                          {t('settings.currentTaxRate')}: <span class="font-bold">{localSettings.taxPercentage}%</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* System Preferences */}
            <div class={`${panelClass} p-6`}>
              <h2 class={sectionTitleClass}>{t('settings.systemSettings')}</h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Select
                    label={t('settings.currency')}
                    value={localSettings.currencySymbol}
                    onChange={(e) => handleChange('currencySymbol', (e.target as HTMLSelectElement).value)}
                    disabled={isSaving}
                    options={SUPPORTED_CURRENCIES.map((currency) => ({
                      value: currency.symbol,
                      label: `${currency.symbol} - ${currency.name}`,
                    }))}
                    class="mb-2"
                  />
                  <span class={helperTextClass}>{t('settings.currencyDesc')}</span>
                </div>
                <div>
                  <LanguageSelector class="mb-2" />
                </div>
              </div>
            </div>

            {/* Developer Tools */}
            <div class={`${panelClass} p-6`}>
              <h2 class={sectionTitleClass}>{t('settings.developerTools')}</h2>
              <span class="mb-4 block text-gray-600 dark:text-gray-400">{t('settings.developerToolsDesc')}</span>

              <div class="space-y-4">
                <div>
                  <h2 class="text-lg font-medium text-gray-900 dark:text-gray-100">{t('settings.apiTesting')}</h2>
                  <form
                    class="flex gap-4 mb-4"
                    onSubmit={(e) => {
                      e.preventDefault()
                      greet()
                    }}
                  >
                    <Input
                      placeholder={t('settings.enterName')}
                      value={name}
                      onInput={(e) => setName((e.target as HTMLInputElement).value)}
                      class="flex-1"
                    />
                    <Button type="submit" variant="primary">
                      {t('settings.greet')}
                    </Button>
                  </form>

                  {greetMsg && (
                    <p class="rounded-lg border border-green-200 bg-green-50 p-4 text-center text-lg font-medium text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300">
                      {greetMsg}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog
        isOpen={isResetDialogOpen}
        onClose={() => setIsResetDialogOpen(false)}
        title={t('settings.resetDefaults')}
        size="md"
      >
        <div>
          <div class="space-y-4">
            <div class="flex items-center space-x-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
              <span class="text-2xl">⚠️</span>
              <div>
                <span class="font-semibold">{t('settings.resetConfirm')}</span>
                <span class="block text-sm">{t('settings.resetWarning')}</span>
              </div>
            </div>
            <span class="text-gray-700 dark:text-gray-300">{t('settings.resetDescription')}</span>
            <ul class="ml-4 list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>{t('settings.resetItem1')}</li>
              <li>{t('settings.resetItem2')}</li>
              <li>{t('settings.resetItem3')}</li>
              <li>{t('settings.resetItem4')}</li>
              <li>{t('settings.resetItem5')}</li>
            </ul>
            <span class="font-medium text-gray-700 dark:text-gray-300">{t('settings.resetProceed')}</span>
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-800">
          <Button variant="outline" onClick={() => setIsResetDialogOpen(false)} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleResetToDefaults} disabled={isSaving} variant="danger">
            {isSaving ? t('settings.resetting') : t('settings.resetSettings')}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
