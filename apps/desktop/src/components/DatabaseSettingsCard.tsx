import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { isDesktop } from '../lib/platform'
import { type DatabaseSettings, databaseSettingsService } from '../services/database-settings'
import { Button, DialogConfirm, Form, Input } from './ui'

/** Configure the store database URL and optional Turso platform credentials. */
export function DatabaseSettingsCard() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const isReadOnly = !isDesktop
  const [settings, setSettings] = useState<DatabaseSettings | null>(null)
  const [databaseUrl, setDatabaseUrl] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [org, setOrg] = useState('')
  const [group, setGroup] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)

  useEffect(() => {
    if (!isAdmin) return

    const loadSettings = async () => {
      try {
        setIsLoading(true)
        const currentSettings = await databaseSettingsService.getSettings()
        setSettings(currentSettings)
        setDatabaseUrl(currentSettings.databaseUrl || '')
        setOrg(currentSettings.org || '')
        setGroup(currentSettings.group || '')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('settings.databaseSettingsFailed'))
      } finally {
        setIsLoading(false)
      }
    }

    void loadSettings()
  }, [isAdmin])

  if (!isAdmin) return null

  const handleSave = async (publish = false) => {
    if (isReadOnly) return
    setIsSaving(true)
    try {
      const updatedSettings = await databaseSettingsService.saveSettings({
        databaseUrl: databaseUrl.trim() || undefined,
        authToken: authToken.trim() || undefined,
        apiToken: apiToken.trim() || undefined,
        org: org.trim() || undefined,
        group: group.trim() || undefined,
        publish,
      })
      setSettings(updatedSettings)
      setAuthToken('')
      setApiToken('')
      toast.success(t('settings.databaseSettingsSaved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.databaseSettingsFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleClear = async () => {
    if (isReadOnly) return

    setIsSaving(true)
    try {
      await databaseSettingsService.clearSettings()
      setSettings({
        configured: false,
        hostedProvisioning: false,
        databaseUrl: null,
        org: null,
        group: null,
        updatedAt: null,
      })
      setDatabaseUrl('')
      setAuthToken('')
      setApiToken('')
      setOrg('')
      setGroup('')
      toast.success(t('settings.databaseSettingsCleared'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.databaseSettingsFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <h3 class="text-lg font-medium text-void mb-1">{t('settings.database')}</h3>
      <p class="text-sm text-graphite mb-4">{t('settings.databaseDesc')}</p>
      {isReadOnly ? (
        <p class="text-sm text-ash mb-4 rounded-cards border border-fog-border bg-chalk p-3">
          On web the store database is configured via Railway env{' '}
          <code class="rounded bg-canvas px-1 py-0.5 text-xs">TURSO_DATABASE_URL</code> /{' '}
          <code class="rounded bg-canvas px-1 py-0.5 text-xs">TURSO_AUTH_TOKEN</code> — editing is disabled here. Update
          the service variables and redeploy.
        </p>
      ) : null}
      {settings && (
        <p class="text-sm text-void mb-4">
          {settings.configured ? t('settings.databaseStatusConfigured') : t('settings.databaseStatusNotConfigured')}
        </p>
      )}

      {isLoading ? (
        <p class="text-sm text-graphite">{t('settings.databaseLoading')}</p>
      ) : (
        <Form onSubmit={() => handleSave(false)} spacing="md">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="md:col-span-2">
              <Input
                label={t('settings.databaseUrl')}
                type="text"
                value={databaseUrl}
                onInput={(e) => setDatabaseUrl((e.target as HTMLInputElement).value)}
                placeholder="libsql://your-store.turso.io"
                disabled={isSaving || isReadOnly}
                helperText={isReadOnly ? undefined : t('settings.databaseUrlDesc')}
              />
            </div>
            <div class="md:col-span-2">
              <Input
                label={t('settings.databaseAuthToken')}
                type="password"
                value={authToken}
                onInput={(e) => setAuthToken((e.target as HTMLInputElement).value)}
                placeholder={settings?.configured ? t('settings.databaseKeep') : ''}
                disabled={isSaving || isReadOnly}
                helperText={isReadOnly ? undefined : t('settings.databaseCredentialsDesc')}
              />
            </div>
            <div class="md:col-span-2">
              <Input
                label={t('settings.tursoApiToken')}
                type="password"
                value={apiToken}
                onInput={(e) => setApiToken((e.target as HTMLInputElement).value)}
                placeholder={settings?.hostedProvisioning ? t('settings.databaseKeep') : ''}
                disabled={isSaving || isReadOnly}
              />
            </div>
            <div>
              <Input
                label={t('settings.tursoOrg')}
                value={org}
                onInput={(e) => setOrg((e.target as HTMLInputElement).value)}
                disabled={isSaving || isReadOnly}
              />
            </div>
            <div>
              <Input
                label={t('settings.tursoGroup')}
                value={group}
                onInput={(e) => setGroup((e.target as HTMLInputElement).value)}
                disabled={isSaving || isReadOnly}
              />
            </div>
          </div>

          {isReadOnly ? null : (
            <div class="flex flex-wrap gap-3">
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? t('settings.savingDatabaseSettings') : t('settings.saveDatabaseSettings')}
              </Button>
              <Button type="button" variant="outline" onClick={() => void handleSave(true)} disabled={isSaving}>
                {t('settings.publishDatabase')}
              </Button>
              {settings?.configured || settings?.hostedProvisioning ? (
                <Button type="button" variant="outline" onClick={() => setIsClearConfirmOpen(true)} disabled={isSaving}>
                  {t('settings.databaseClear')}
                </Button>
              ) : null}
            </div>
          )}
        </Form>
      )}
      <DialogConfirm
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={() => void handleClear()}
        title={t('settings.databaseClear')}
        message={t('settings.databaseClearConfirm')}
        confirmText={t('settings.databaseClear')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </div>
  )
}
