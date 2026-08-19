import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { isWeb } from '../lib/platform'
import { type PasswordResetSettings, passwordResetSettingsService } from '../services/password-reset-settings'
import { Button, Form, Input } from './ui'

/** Configure Resend delivery for public password-reset links. */
export function PasswordResetEmailCard() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const canConfigure = isWeb && isAdmin
  const [settings, setSettings] = useState<PasswordResetSettings | null>(null)
  const [resendApiKey, setResendApiKey] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [webAppUrl, setWebAppUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!canConfigure) return

    const loadSettings = async () => {
      try {
        setIsLoading(true)
        const currentSettings = await passwordResetSettingsService.getSettings()
        setSettings(currentSettings)
        setFromEmail(currentSettings.fromEmail || '')
        setWebAppUrl(currentSettings.webAppUrl || window.location.origin)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('settings.passwordResetSettingsFailed'))
      } finally {
        setIsLoading(false)
      }
    }

    void loadSettings()
  }, [canConfigure])

  if (!canConfigure) return null

  const handleSave = async () => {
    if (!fromEmail.trim()) {
      toast.error(t('settings.fromEmailRequired'))
      return
    }
    if (!resendApiKey.trim() && !settings?.configured) {
      toast.error(t('settings.resendApiKeyRequired'))
      return
    }

    setIsSaving(true)
    try {
      const updatedSettings = await passwordResetSettingsService.saveSettings({
        resendApiKey: resendApiKey.trim() || undefined,
        fromEmail: fromEmail.trim(),
        webAppUrl: webAppUrl.trim() || undefined,
      })
      setSettings(updatedSettings)
      setResendApiKey('')
      toast.success(t('settings.passwordResetSettingsSaved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.passwordResetSettingsFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleClear = async () => {
    if (!window.confirm(t('settings.passwordResetClearConfirm'))) return

    setIsSaving(true)
    try {
      await passwordResetSettingsService.clearSettings()
      setSettings({ configured: false, fromEmail: null, webAppUrl: null, updatedAt: null })
      setResendApiKey('')
      setFromEmail('')
      setWebAppUrl(window.location.origin)
      toast.success(t('settings.passwordResetSettingsCleared'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.passwordResetSettingsFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div class="md:col-span-2 border-t border-fog-border pt-8">
      <h3 class="text-lg font-medium text-void mb-1">{t('settings.passwordResetEmail')}</h3>
      <p class="text-sm text-graphite mb-4">{t('settings.passwordResetEmailDesc')}</p>
      {settings && (
        <p class="text-sm text-void mb-4">
          {settings.configured
            ? t('settings.passwordResetStatusConfigured')
            : t('settings.passwordResetStatusNotConfigured')}
        </p>
      )}

      {isLoading ? (
        <p class="text-sm text-graphite">{t('settings.passwordResetLoading')}</p>
      ) : (
        <Form onSubmit={handleSave} spacing="md">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Input
                label={t('settings.resendApiKey')}
                type="password"
                value={resendApiKey}
                onInput={(e) => setResendApiKey((e.target as HTMLInputElement).value)}
                placeholder={
                  settings?.configured ? t('settings.resendApiKeyKeep') : t('settings.resendApiKeyPlaceholder')
                }
                disabled={isSaving}
                helperText={t('settings.resendApiKeyDesc')}
              />
            </div>
            <div>
              <Input
                label={t('settings.fromEmail')}
                type="email"
                value={fromEmail}
                onInput={(e) => setFromEmail((e.target as HTMLInputElement).value)}
                placeholder="no-reply@example.com"
                disabled={isSaving}
                required
                helperText={t('settings.fromEmailDesc')}
              />
            </div>
            <div class="md:col-span-2">
              <Input
                label={t('settings.webAppUrl')}
                type="text"
                value={webAppUrl}
                onInput={(e) => setWebAppUrl((e.target as HTMLInputElement).value)}
                placeholder="https://pos.example.com"
                disabled={isSaving}
                required
                helperText={t('settings.webAppUrlDesc')}
              />
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? t('settings.savingPasswordResetSettings') : t('settings.savePasswordResetSettings')}
            </Button>
            {settings?.configured && (
              <Button type="button" variant="outline" onClick={handleClear} disabled={isSaving}>
                {t('settings.passwordResetClear')}
              </Button>
            )}
          </div>
        </Form>
      )}
    </div>
  )
}
