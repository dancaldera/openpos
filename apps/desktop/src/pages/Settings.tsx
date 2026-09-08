import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { ChangePasswordCard } from '../components/ChangePasswordCard'
import { DangerZoneCard } from '../components/DangerZoneCard'
import { DatabaseSettingsCard } from '../components/DatabaseSettingsCard'
import { ObjectStorageSettingsCard } from '../components/ObjectStorageSettingsCard'
import { ThemePalettePicker } from '../components/ThemePalettePicker'
import { Button, Dialog, Form, Input, LanguageSelector, PageLoader, PasswordInput, Select } from '../components/ui'
import { ChevronRightIcon } from '../components/ui/icons'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { resetApiUrlCache } from '../lib/api-config'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'
import { authService } from '../services/auth-turso'
import { type CompanySettings, companySettingsService, SUPPORTED_CURRENCIES } from '../services/company-settings-turso'
import { clearStoredConnectionKey, fetchAssignedConnection, getStoredConnectionKey } from '../services/connections'
import { appSettingsStore } from '../stores/appSettings/appSettingsStore'
import type { ThemePalette } from '../stores/theme/palettes'
import {
  setThemePalette,
  setThemePreference,
  type ThemePreference,
  themePalette,
  themePreference,
} from '../stores/theme/themeStore'

const FIXED_APP_NAME = 'OpenPOS'

export default function Settings() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const panelClass = 'rounded-cards border border-fog-border bg-canvas '
  const sectionTitleClass = 'mb-6 text-xl font-semibold text-void '
  const helperTextClass = 'text-sm text-graphite '

  const [greetMsg, setGreetMsg] = useState('')
  const [name, setName] = useState('')
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [localSettings, setLocalSettings] = useState<CompanySettings | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false)
  const [isResetLocalDbDialogOpen, setIsResetLocalDbDialogOpen] = useState(false)
  const [isResettingLocalDb, setIsResettingLocalDb] = useState(false)
  const [theme, setTheme] = useState<ThemePreference>(themePreference.value)
  const [palette, setPalette] = useState<ThemePalette>(themePalette.value)
  const [apiUrl, setApiUrl] = useState('')
  const [apiUrlError, setApiUrlError] = useState<string | null>(null)
  const [isSavingApiUrl, setIsSavingApiUrl] = useState(false)
  const [connectionInfo, setConnectionInfo] = useState<{ key: string; storeName?: string; published?: boolean } | null>(
    null,
  )

  const [isAdvancedUnlocked, setIsAdvancedUnlocked] = useState(false)
  const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false)
  const [internalSecret, setInternalSecret] = useState('')
  const [isUnlocking, setIsUnlocking] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    if (!isDesktop) return

    let cancelled = false
    void requireDesktopApi()
      .getConfig()
      .then((config) => {
        if (!cancelled) setApiUrl(config.apiUrl)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setApiUrlError(error instanceof Error ? error.message : t('settings.apiUrlLoadFailed'))
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const loadSettings = async () => {
    try {
      setIsLoading(true)
      const companySettings = await companySettingsService.getSettings()
      const fixedSettings = { ...companySettings, appName: FIXED_APP_NAME }
      setSettings(fixedSettings)
      setLocalSettings(fixedSettings)
      setHasChanges(false)
      if (isDesktop) {
        const active = await requireDesktopApi().connection.getActive()
        setConnectionInfo(active)
      } else {
        const assigned = await fetchAssignedConnection()
        const key = assigned?.key || getStoredConnectionKey()
        setConnectionInfo(key ? { key, storeName: assigned?.storeName, published: assigned?.published } : null)
      }
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
      const result = await companySettingsService.updateSettings({
        ...localSettings,
        appName: FIXED_APP_NAME,
      })

      if (result.success && result.settings) {
        const fixedSettings = { ...result.settings, appName: FIXED_APP_NAME }
        setSettings(fixedSettings)
        setLocalSettings(fixedSettings)
        appSettingsStore.appName.value = FIXED_APP_NAME
        appSettingsStore.companyName.value = fixedSettings.name
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

  const syncThemeToCompany = (prefs: { themeMode?: ThemePreference; themePalette?: ThemePalette }) => {
    void companySettingsService.updateSettings(prefs).then((result) => {
      if (!result.success) console.error('Failed to sync theme:', result.error)
    })
  }

  const handleThemeChange = async (e: Event) => {
    const nextTheme = (e.target as HTMLSelectElement).value as ThemePreference
    setTheme(nextTheme)
    await setThemePreference(nextTheme)
    syncThemeToCompany({ themeMode: nextTheme })
  }

  const handlePaletteChange = (nextPalette: ThemePalette) => {
    setPalette(nextPalette)
    setThemePalette(nextPalette)
    syncThemeToCompany({ themePalette: nextPalette })
  }

  const handleSaveApiUrl = async (e: Event) => {
    e.preventDefault()
    const trimmed = apiUrl.trim()
    if (!trimmed) {
      setApiUrlError(t('connection.apiUrlRequired'))
      return
    }

    try {
      setIsSavingApiUrl(true)
      setApiUrlError(null)
      const desktop = requireDesktopApi()
      await desktop.setApiUrl(trimmed)
      resetApiUrlCache()
      setApiUrl(trimmed)

      const snapshot = await desktop.connectivity.getStatus()
      if (snapshot.apiReachable) {
        toast.success(t('settings.apiUrlSaved'))
      } else {
        setApiUrlError(snapshot.apiLastError || t('connection.apiUnreachable'))
        toast.warning(snapshot.apiLastError || t('connection.apiUnreachable'))
      }
    } catch (error: unknown) {
      setApiUrlError(error instanceof Error ? error.message : t('settings.apiUrlSaveFailed'))
    } finally {
      setIsSavingApiUrl(false)
    }
  }

  const handleResetToDefaults = async () => {
    try {
      setIsSaving(true)
      const result = await companySettingsService.resetToDefaults()

      if (result.success && result.settings) {
        const fixedSettings = { ...result.settings, appName: FIXED_APP_NAME }
        setSettings(fixedSettings)
        setLocalSettings(fixedSettings)
        appSettingsStore.appName.value = FIXED_APP_NAME
        appSettingsStore.companyName.value = fixedSettings.name
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

  const handleResetLocalDb = async () => {
    try {
      setIsResettingLocalDb(true)
      await requireDesktopApi().sync.resetLocal()
      toast.success(t('settings.resetLocalDbSuccess'))
      setIsResetLocalDbDialogOpen(false)
    } catch (err: unknown) {
      toast.error((err as Error)?.message || t('errors.generic'))
    } finally {
      setIsResettingLocalDb(false)
    }
  }

  const handleUnlockAdvanced = async () => {
    if (!internalSecret) return

    setIsUnlocking(true)
    try {
      await authService.verifyInternalSecret(internalSecret)
      setIsAdvancedUnlocked(true)
      setIsUnlockDialogOpen(false)
      setInternalSecret('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.advancedUnlockFailed'))
    } finally {
      setIsUnlocking(false)
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
    return <PageLoader message={t('common.loading')} />
  }

  return (
    <div class="max-w-6xl mx-auto">
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:justify-end sm:items-center gap-3">
          <div class="flex flex-wrap gap-3">
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
              class="text-void border-fog-border hover:bg-chalk "
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
                      class="h-5 w-5 rounded border-fog-border bg-canvas text-void focus:ring-2 focus:ring-accent "
                    />
                    <span class="font-medium text-void ">{t('settings.enableTax')}</span>
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
                      <div class="rounded-cards border border-fog-border bg-chalk p-4 ">
                        <span class="text-sm text-void ">
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
                <div>
                  <Select
                    label={t('settings.theme')}
                    value={theme}
                    onChange={(e) => void handleThemeChange(e)}
                    options={[
                      { value: 'system', label: t('settings.systemMode') },
                      { value: 'light', label: t('settings.lightMode') },
                      { value: 'dark', label: t('settings.darkMode') },
                    ]}
                    class="mb-2"
                  />
                  <span class={helperTextClass}>{t('settings.themeDesc')}</span>
                  <div class="mt-4">
                    <ThemePalettePicker value={palette} onChange={handlePaletteChange} />
                  </div>
                </div>
              </div>
            </div>

            {/* Security */}
            <div class={`${panelClass} p-6`}>
              <h2 class={sectionTitleClass}>{t('settings.securitySettings')}</h2>
              <span class="mb-6 block text-graphite">{t('settings.securityDesc')}</span>

              <ChangePasswordCard />
            </div>

            {isDesktop || isAdmin || connectionInfo?.key ? (
              <>
                {isAdvancedUnlocked ? (
                  <details class="group mt-2">
                    <summary class="flex w-fit cursor-pointer list-none items-center gap-1 py-1 text-sm text-graphite hover:text-void marker:content-none [&::-webkit-details-marker]:hidden">
                      <ChevronRightIcon class="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" />
                      {t('settings.advanced')}
                    </summary>

                    <div class={`${panelClass} mt-3 space-y-8 p-6`}>
                      {connectionInfo?.key ? (
                        <div>
                          <h3 class="mb-1 text-lg font-medium text-void">{t('connection.connectionTitle')}</h3>
                          {connectionInfo.storeName ? (
                            <p class={`${helperTextClass} mb-3`}>{connectionInfo.storeName}</p>
                          ) : null}
                          <p class={`${helperTextClass} mb-3 break-all`}>
                            {t('connection.key')}: {connectionInfo.key}
                          </p>
                          <p class={`${helperTextClass} mb-4`}>
                            {connectionInfo.published ? t('connection.published') : t('connection.notPublished')}
                          </p>
                          {isDesktop ? (
                            <div>
                              <p class={`${helperTextClass} mb-3`}>{t('connection.leaveStoreDesc')}</p>
                              <Button
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    await requireDesktopApi().connection.leave()
                                    clearStoredConnectionKey()
                                    window.location.reload()
                                  } catch (error) {
                                    toast.error(error instanceof Error ? error.message : t('connection.leaveFailed'))
                                  }
                                }}
                              >
                                {t('connection.leaveStore')}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {isDesktop ? (
                        <div>
                          <h3 class="mb-1 text-lg font-medium text-void">{t('settings.apiUrl')}</h3>
                          <p class={`${helperTextClass} mb-3`}>{t('settings.apiUrlDesc')}</p>
                          <form class="space-y-3" onSubmit={handleSaveApiUrl}>
                            <Input
                              label={t('settings.apiUrl')}
                              value={apiUrl}
                              onInput={(e) => {
                                setApiUrl((e.target as HTMLInputElement).value)
                                setApiUrlError(null)
                              }}
                              placeholder="https://api.openpos.xyz"
                              disabled={isSavingApiUrl}
                            />
                            {apiUrlError ? (
                              <p class="text-sm text-void" role="alert">
                                {apiUrlError}
                              </p>
                            ) : null}
                            <Button type="submit" variant="primary" disabled={isSavingApiUrl}>
                              {isSavingApiUrl ? t('settings.savingApiUrl') : t('settings.saveApiUrl')}
                            </Button>
                          </form>
                        </div>
                      ) : null}

                      <ObjectStorageSettingsCard />
                      <DatabaseSettingsCard />

                      {isDesktop ? (
                        <div>
                          <h3 class="mb-1 text-lg font-medium text-void">{t('settings.resetLocalDb')}</h3>
                          <p class={`${helperTextClass} mb-3`}>{t('settings.resetLocalDbDesc')}</p>
                          <Button
                            variant="outline"
                            onClick={() => setIsResetLocalDbDialogOpen(true)}
                            disabled={isResettingLocalDb}
                            class="text-void border-fog-border hover:bg-chalk "
                          >
                            {isResettingLocalDb ? t('settings.resettingLocalDb') : t('settings.resetLocalDb')}
                          </Button>
                        </div>
                      ) : null}

                      {isDesktop ? (
                        <div>
                          <h3 class="mb-1 text-lg font-medium text-void">{t('settings.apiTesting')}</h3>
                          <form
                            class="mt-3 flex gap-4"
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
                          {greetMsg ? (
                            <p class="mt-4 rounded-cards border border-fog-border bg-chalk p-4 text-center text-lg font-medium text-void">
                              {greetMsg}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <DangerZoneCard />
                    </div>
                  </details>
                ) : (
                  <button
                    type="button"
                    class="flex w-fit cursor-pointer items-center gap-1 py-1 text-sm text-graphite hover:text-void"
                    onClick={() => setIsUnlockDialogOpen(true)}
                  >
                    <ChevronRightIcon class="h-3.5 w-3.5 shrink-0" />
                    {t('settings.advanced')}
                  </button>
                )}
                <Dialog
                  isOpen={isUnlockDialogOpen}
                  onClose={() => setIsUnlockDialogOpen(false)}
                  title={t('settings.advanced')}
                  size="sm"
                >
                  <p class="text-sm text-graphite mb-4">{t('settings.advancedLockedDesc')}</p>
                  <Form onSubmit={handleUnlockAdvanced} spacing="md">
                    <PasswordInput
                      label={t('auth.recovery.internalSecret')}
                      value={internalSecret}
                      onInput={(e) => setInternalSecret((e.target as HTMLInputElement).value)}
                      disabled={isUnlocking}
                      required
                    />
                    <div class="flex justify-end gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsUnlockDialogOpen(false)}
                        disabled={isUnlocking}
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button type="submit" variant="primary" disabled={isUnlocking}>
                        {isUnlocking ? t('common.loading') : t('settings.advancedUnlock')}
                      </Button>
                    </div>
                  </Form>
                </Dialog>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Reset Local Database Dialog */}
      <Dialog
        isOpen={isResetLocalDbDialogOpen}
        onClose={() => setIsResetLocalDbDialogOpen(false)}
        title={t('settings.resetLocalDb')}
        size="md"
      >
        <div>
          <div class="space-y-4">
            <div class="flex items-center space-x-3 rounded-cards border border-fog-border bg-chalk p-4 text-void ">
              <span class="text-2xl">⚠️</span>
              <div>
                <span class="font-semibold">{t('settings.resetLocalDbConfirm')}</span>
                <span class="block text-sm">{t('settings.resetLocalDbWarning')}</span>
              </div>
            </div>
            <span class="font-medium text-void ">{t('settings.resetLocalDbProceed')}</span>
          </div>
        </div>
        <div class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-fog-border pt-6 ">
          <Button variant="outline" onClick={() => setIsResetLocalDbDialogOpen(false)} disabled={isResettingLocalDb}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleResetLocalDb} disabled={isResettingLocalDb} variant="danger">
            {isResettingLocalDb ? t('settings.resettingLocalDb') : t('settings.resetLocalDb')}
          </Button>
        </div>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog
        isOpen={isResetDialogOpen}
        onClose={() => setIsResetDialogOpen(false)}
        title={t('settings.resetDefaults')}
        size="md"
      >
        <div>
          <div class="space-y-4">
            <div class="flex items-center space-x-3 rounded-cards border border-fog-border bg-chalk p-4 text-void ">
              <span class="text-2xl">⚠️</span>
              <div>
                <span class="font-semibold">{t('settings.resetConfirm')}</span>
                <span class="block text-sm">{t('settings.resetWarning')}</span>
              </div>
            </div>
            <span class="text-void ">{t('settings.resetDescription')}</span>
            <ul class="ml-4 list-disc list-inside space-y-1 text-sm text-graphite ">
              <li>{t('settings.resetItem1')}</li>
              <li>{t('settings.resetItem2')}</li>
              <li>{t('settings.resetItem3')}</li>
              <li>{t('settings.resetItem4')}</li>
              <li>{t('settings.resetItem5')}</li>
            </ul>
            <span class="font-medium text-void ">{t('settings.resetProceed')}</span>
          </div>
        </div>
        <div class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-fog-border pt-6 ">
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
