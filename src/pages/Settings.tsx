import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'preact/hooks'
import { Button, Container, Dialog, DialogBody, DialogFooter, Heading, Input, Select, Text } from '../components/ui'
import LanguageSelector from '../components/ui/LanguageSelector'
import { useTranslation } from '../hooks/useTranslation'
import { type CompanySettings, companySettingsService, SUPPORTED_CURRENCIES } from '../services/company-settings-sqlite'

interface SettingsProps {
  onNavigate: (page: string) => void
}

export default function Settings({ onNavigate }: SettingsProps) {
  const { t } = useTranslation()

  const [greetMsg, setGreetMsg] = useState('')
  const [name, setName] = useState('')
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setIsLoading(true)
      const companySettings = await companySettingsService.getSettings()
      setSettings(companySettings)
      setError('')
    } catch (err: unknown) {
      setError((err as Error)?.message || t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateSetting = async <K extends keyof CompanySettings>(field: K, value: CompanySettings[K]) => {
    if (!settings) return

    try {
      setIsUpdating(true)
      const result = await companySettingsService.updateSettings({ [field]: value })

      if (result.success && result.settings) {
        setSettings(result.settings)
        setSuccess(t('settings.settingsUpdated'))
        setError('')
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || t('errors.generic'))
    } finally {
      setIsUpdating(false)
    }
  }

  const handleResetToDefaults = async () => {
    try {
      setIsUpdating(true)
      const result = await companySettingsService.resetToDefaults()

      if (result.success && result.settings) {
        setSettings(result.settings)
        setSuccess(t('success.updated'))
        setError('')
        setIsResetDialogOpen(false)
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || t('errors.generic'))
    } finally {
      setIsUpdating(false)
    }
  }

  async function greet() {
    setGreetMsg(await invoke('greet', { name }))
  }

  if (isLoading) {
    return (
      <Container size="xl">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-center py-8">
            <div class="w-8 h-8 bg-blue-600 rounded-full animate-spin border-2 border-transparent border-t-white mx-auto mb-4"></div>
            <p class="text-gray-600">{t('common.loading')}</p>
          </div>
        </div>
      </Container>
    )
  }

  return (
    <Container size="xl">
      <div class="space-y-6">
        <div class="flex justify-between items-center">
          <div>
            <Heading level={3}>{t('settings.title')}</Heading>
            <Text class="text-gray-600">{t('settings.subtitle')}</Text>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsResetDialogOpen(true)}
            disabled={isUpdating}
            class="text-red-600 border-red-200 hover:bg-red-50"
          >
            🔄 {t('settings.resetDefaults')}
          </Button>
        </div>

        {error && <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

        {success && (
          <div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">{success}</div>
        )}

        {settings && (
          <div class="space-y-8">
            {/* Company Information */}
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <Heading level={4} class="mb-6">
                🏢 {t('settings.companyInfo')}
              </Heading>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Input
                    label={t('settings.companyName')}
                    value={settings.name}
                    onBlur={(e) => handleUpdateSetting('name', (e.target as HTMLInputElement).value)}
                    disabled={isUpdating}
                    placeholder={t('settings.companyName')}
                    class="mb-2"
                  />
                  <Text class="text-sm text-gray-500">{t('settings.companyNameDesc')}</Text>
                </div>
                <div>
                  <Input
                    label={t('common.description')}
                    value={settings.description}
                    onBlur={(e) => handleUpdateSetting('description', (e.target as HTMLInputElement).value)}
                    disabled={isUpdating}
                    placeholder={t('common.description')}
                    class="mb-2"
                  />
                  <Text class="text-sm text-gray-500">{t('settings.descriptionDesc')}</Text>
                </div>
                <div>
                  <Input
                    label={t('common.address')}
                    value={settings.address || ''}
                    onBlur={(e) => handleUpdateSetting('address', (e.target as HTMLInputElement).value || undefined)}
                    disabled={isUpdating}
                    placeholder={t('common.address')}
                    class="mb-2"
                  />
                  <Text class="text-sm text-gray-500">{t('settings.addressDesc')}</Text>
                </div>
                <div>
                  <Input
                    label={t('common.phone')}
                    value={settings.phone || ''}
                    onBlur={(e) => handleUpdateSetting('phone', (e.target as HTMLInputElement).value || undefined)}
                    disabled={isUpdating}
                    placeholder={t('common.phone')}
                    class="mb-2"
                  />
                  <Text class="text-sm text-gray-500">{t('settings.phoneDesc')}</Text>
                </div>
                <div>
                  <Input
                    label={t('common.email')}
                    type="email"
                    value={settings.email || ''}
                    onBlur={(e) => handleUpdateSetting('email', (e.target as HTMLInputElement).value || undefined)}
                    disabled={isUpdating}
                    placeholder={t('common.email')}
                    class="mb-2"
                  />
                  <Text class="text-sm text-gray-500">{t('settings.emailDesc')}</Text>
                </div>
                <div>
                  <Input
                    label={t('settings.website')}
                    type="text"
                    value={settings.website || ''}
                    onBlur={(e) => handleUpdateSetting('website', (e.target as HTMLInputElement).value || undefined)}
                    disabled={isUpdating}
                    placeholder="https://example.com"
                    class="mb-2"
                  />
                  <Text class="text-sm text-gray-500">{t('settings.websiteDesc')}</Text>
                </div>
              </div>
            </div>

            {/* Tax Configuration */}
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <Heading level={4} class="mb-6">
                💰 {t('settings.taxSettings')}
              </Heading>
              <div class="space-y-6">
                <div class="flex items-center space-x-4">
                  <label class="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.taxEnabled}
                      onChange={(e) => handleUpdateSetting('taxEnabled', (e.target as HTMLInputElement).checked)}
                      disabled={isUpdating}
                      class="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                    />
                    <Text class="font-medium">{t('settings.enableTax')}</Text>
                  </label>
                </div>
                {settings.taxEnabled && (
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Input
                        label={t('settings.taxRate')}
                        type="number"
                        value={settings.taxPercentage.toString()}
                        onBlur={(e) =>
                          handleUpdateSetting('taxPercentage', parseFloat((e.target as HTMLInputElement).value) || 0)
                        }
                        disabled={isUpdating}
                        class="mb-2"
                        placeholder="10.0"
                      />
                      <Text class="text-sm text-gray-500">{t('settings.taxRateDesc')}</Text>
                    </div>
                    <div class="flex items-center mt-6">
                      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <Text class="text-sm text-blue-700">
                          {t('settings.currentTaxRate')}: <span class="font-bold">{settings.taxPercentage}%</span>
                        </Text>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* System Preferences */}
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <Heading level={4} class="mb-6">
                ⚙️ {t('settings.systemSettings')}
              </Heading>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Select
                    label={t('settings.currency')}
                    value={settings.currencySymbol}
                    onChange={(e) => handleUpdateSetting('currencySymbol', (e.target as HTMLSelectElement).value)}
                    disabled={isUpdating}
                    options={SUPPORTED_CURRENCIES.map((currency) => ({
                      value: currency.symbol,
                      label: `${currency.symbol} - ${currency.name}`,
                    }))}
                    class="mb-2"
                  />
                  <Text class="text-sm text-gray-500">{t('settings.currencyDesc')}</Text>
                </div>
                <div>
                  <LanguageSelector class="mb-2" />
                </div>
              </div>
            </div>

            {/* Developer Tools */}
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <Heading level={4} class="mb-6">
                🛠️ {t('settings.developerTools')}
              </Heading>
              <Text class="mb-4 text-gray-600">{t('settings.developerToolsDesc')}</Text>

              <div class="space-y-4">
                <div>
                  <Heading level={5}>{t('settings.apiTesting')}</Heading>
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
                    <p class="text-center text-lg font-medium text-green-600 bg-green-50 p-4 rounded-lg">{greetMsg}</p>
                  )}
                </div>

                <Button variant="outline" onClick={() => onNavigate('component-showcase')}>
                  🎨 {t('settings.uiComponentsShowcase')}
                </Button>
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
        <DialogBody>
          <div class="space-y-4">
            <div class="flex items-center space-x-3 text-amber-600 bg-amber-50 p-4 rounded-lg border border-amber-200">
              <span class="text-2xl">⚠️</span>
              <div>
                <Text class="font-semibold">{t('settings.resetConfirm')}</Text>
                <Text class="text-sm text-amber-700">{t('settings.resetWarning')}</Text>
              </div>
            </div>
            <Text class="text-gray-700">{t('settings.resetDescription')}</Text>
            <ul class="list-disc list-inside text-sm text-gray-600 space-y-1 ml-4">
              <li>{t('settings.resetItem1')}</li>
              <li>{t('settings.resetItem2')}</li>
              <li>{t('settings.resetItem3')}</li>
              <li>{t('settings.resetItem4')}</li>
              <li>{t('settings.resetItem5')}</li>
            </ul>
            <Text class="text-gray-700 font-medium">{t('settings.resetProceed')}</Text>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsResetDialogOpen(false)} disabled={isUpdating}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleResetToDefaults} disabled={isUpdating} class="bg-red-600 hover:bg-red-700 text-white">
            {isUpdating ? t('settings.resetting') : t('settings.resetSettings')}
          </Button>
        </DialogFooter>
      </Dialog>
    </Container>
  )
}
