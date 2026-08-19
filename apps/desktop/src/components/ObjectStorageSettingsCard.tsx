import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { isWeb } from '../lib/platform'
import { type ObjectStorageSettings, objectStorageSettingsService } from '../services/object-storage-settings'
import { Button, Form, Input } from './ui'

/** Configure S3-compatible storage for product images. */
export function ObjectStorageSettingsCard() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const canConfigure = isWeb && isAdmin
  const [settings, setSettings] = useState<ObjectStorageSettings | null>(null)
  const [endpoint, setEndpoint] = useState('')
  const [region, setRegion] = useState('auto')
  const [bucket, setBucket] = useState('')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [urlTtlSeconds, setUrlTtlSeconds] = useState('900')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!canConfigure) return

    const loadSettings = async () => {
      try {
        setIsLoading(true)
        const currentSettings = await objectStorageSettingsService.getSettings()
        setSettings(currentSettings)
        setEndpoint(currentSettings.endpoint || '')
        setRegion(currentSettings.region || 'auto')
        setBucket(currentSettings.bucket || '')
        setUrlTtlSeconds(String(currentSettings.urlTtlSeconds || 900))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('settings.objectStorageSettingsFailed'))
      } finally {
        setIsLoading(false)
      }
    }

    void loadSettings()
  }, [canConfigure])

  if (!canConfigure) return null

  const handleSave = async () => {
    const ttl = Number(urlTtlSeconds)
    if (!endpoint.trim() || !region.trim() || !bucket.trim()) {
      toast.error(t('settings.objectStorageFieldsRequired'))
      return
    }
    if ((!accessKeyId.trim() || !secretAccessKey.trim()) && !settings?.configured) {
      toast.error(t('settings.objectStorageCredentialsRequired'))
      return
    }
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 604800) {
      toast.error(t('settings.objectStorageTtlInvalid'))
      return
    }

    setIsSaving(true)
    try {
      const updatedSettings = await objectStorageSettingsService.saveSettings({
        endpoint: endpoint.trim(),
        region: region.trim(),
        bucket: bucket.trim(),
        accessKeyId: accessKeyId.trim() || undefined,
        secretAccessKey: secretAccessKey.trim() || undefined,
        urlTtlSeconds: ttl,
      })
      setSettings(updatedSettings)
      setAccessKeyId('')
      setSecretAccessKey('')
      toast.success(t('settings.objectStorageSettingsSaved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.objectStorageSettingsFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleClear = async () => {
    if (!window.confirm(t('settings.objectStorageClearConfirm'))) return

    setIsSaving(true)
    try {
      await objectStorageSettingsService.clearSettings()
      setSettings({
        configured: false,
        endpoint: null,
        region: 'auto',
        bucket: null,
        urlTtlSeconds: 900,
        updatedAt: null,
      })
      setEndpoint('')
      setRegion('auto')
      setBucket('')
      setAccessKeyId('')
      setSecretAccessKey('')
      setUrlTtlSeconds('900')
      toast.success(t('settings.objectStorageSettingsCleared'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.objectStorageSettingsFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div class="md:col-span-2 border-t border-fog-border pt-8">
      <h3 class="text-lg font-medium text-void mb-1">{t('settings.objectStorage')}</h3>
      <p class="text-sm text-graphite mb-4">{t('settings.objectStorageDesc')}</p>
      {settings && (
        <p class="text-sm text-void mb-4">
          {settings.configured
            ? t('settings.objectStorageStatusConfigured')
            : t('settings.objectStorageStatusNotConfigured')}
        </p>
      )}

      {isLoading ? (
        <p class="text-sm text-graphite">{t('settings.objectStorageLoading')}</p>
      ) : (
        <Form onSubmit={handleSave} spacing="md">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="md:col-span-2">
              <Input
                label={t('settings.s3Endpoint')}
                type="text"
                value={endpoint}
                onInput={(e) => setEndpoint((e.target as HTMLInputElement).value)}
                placeholder="https://<accountid>.r2.cloudflarestorage.com"
                disabled={isSaving}
                required
                helperText={t('settings.s3EndpointDesc')}
              />
            </div>
            <div>
              <Input
                label={t('settings.s3Region')}
                value={region}
                onInput={(e) => setRegion((e.target as HTMLInputElement).value)}
                placeholder="auto"
                disabled={isSaving}
                required
              />
            </div>
            <div>
              <Input
                label={t('settings.s3Bucket')}
                value={bucket}
                onInput={(e) => setBucket((e.target as HTMLInputElement).value)}
                placeholder={t('settings.s3BucketPlaceholder')}
                disabled={isSaving}
                required
              />
            </div>
            <div>
              <Input
                label={t('settings.s3AccessKeyId')}
                type="password"
                value={accessKeyId}
                onInput={(e) => setAccessKeyId((e.target as HTMLInputElement).value)}
                placeholder={settings?.configured ? t('settings.objectStorageKeep') : 'your-access-key-id'}
                disabled={isSaving}
                helperText={t('settings.objectStorageCredentialsDesc')}
              />
            </div>
            <div>
              <Input
                label={t('settings.s3SecretAccessKey')}
                type="password"
                value={secretAccessKey}
                onInput={(e) => setSecretAccessKey((e.target as HTMLInputElement).value)}
                placeholder={settings?.configured ? t('settings.objectStorageKeep') : 'your-secret-access-key'}
                disabled={isSaving}
              />
            </div>
            <div>
              <Input
                label={t('settings.s3SignedUrlTtl')}
                type="number"
                value={urlTtlSeconds}
                onInput={(e) => setUrlTtlSeconds((e.target as HTMLInputElement).value)}
                min={1}
                max={604800}
                disabled={isSaving}
                required
                helperText={t('settings.s3SignedUrlTtlDesc')}
              />
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? t('settings.savingObjectStorageSettings') : t('settings.saveObjectStorageSettings')}
            </Button>
            {settings?.configured && (
              <Button type="button" variant="outline" onClick={handleClear} disabled={isSaving}>
                {t('settings.objectStorageClear')}
              </Button>
            )}
          </div>
        </Form>
      )}
    </div>
  )
}
