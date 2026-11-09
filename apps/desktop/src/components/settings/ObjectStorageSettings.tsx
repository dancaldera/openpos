import { Button } from '@astryxdesign/core/Button'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from '../../hooks/useTranslation'
import { toast } from '../../lib/toast'
import {
  objectStorageSettingsService,
  type ObjectStorageSettings as StorageSettings,
} from '../../services/object-storage-settings'
import { ConfirmAction } from '../page/ConfirmAction'
import { SettingsGroup } from './SettingsGroup'

const DEFAULT_TTL = 900
const MAX_TTL = 604800

/** S3-compatible storage for product images. Admins only. */
export function ObjectStorageSettings() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const [settings, setSettings] = useState<StorageSettings | null>(null)
  const [endpoint, setEndpoint] = useState('')
  const [region, setRegion] = useState('auto')
  const [bucket, setBucket] = useState('')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [urlTtlSeconds, setUrlTtlSeconds] = useState<number | null>(DEFAULT_TTL)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once; `t` is a new function on every render
  useEffect(() => {
    if (!isAdmin) return
    let isCancelled = false
    setIsLoading(true)
    objectStorageSettingsService
      .getSettings()
      .then((current) => {
        if (isCancelled) return
        setSettings(current)
        setEndpoint(current.endpoint || '')
        setRegion(current.region || 'auto')
        setBucket(current.bucket || '')
        setUrlTtlSeconds(current.urlTtlSeconds || DEFAULT_TTL)
      })
      .catch((error: unknown) => {
        if (!isCancelled)
          toast.error(error instanceof Error ? error.message : t('settings.objectStorageSettingsFailed'))
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [isAdmin])

  if (!isAdmin) return null

  const save = async () => {
    const ttl = Number(urlTtlSeconds)
    if (!endpoint.trim() || !region.trim() || !bucket.trim()) {
      toast.error(t('settings.objectStorageFieldsRequired'))
      return
    }
    if ((!accessKeyId.trim() || !secretAccessKey.trim()) && !settings?.configured) {
      toast.error(t('settings.objectStorageCredentialsRequired'))
      return
    }
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TTL) {
      toast.error(t('settings.objectStorageTtlInvalid'))
      return
    }

    setIsSaving(true)
    try {
      const updated = await objectStorageSettingsService.saveSettings({
        endpoint: endpoint.trim(),
        region: region.trim(),
        bucket: bucket.trim(),
        accessKeyId: accessKeyId.trim() || undefined,
        secretAccessKey: secretAccessKey.trim() || undefined,
        urlTtlSeconds: ttl,
      })
      setSettings(updated)
      setAccessKeyId('')
      setSecretAccessKey('')
      toast.success(t('settings.objectStorageSettingsSaved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.objectStorageSettingsFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const clear = async () => {
    setIsSaving(true)
    try {
      await objectStorageSettingsService.clearSettings()
      setSettings({
        configured: false,
        endpoint: null,
        region: 'auto',
        bucket: null,
        urlTtlSeconds: DEFAULT_TTL,
        updatedAt: null,
      })
      setEndpoint('')
      setRegion('auto')
      setBucket('')
      setAccessKeyId('')
      setSecretAccessKey('')
      setUrlTtlSeconds(DEFAULT_TTL)
      toast.success(t('settings.objectStorageSettingsCleared'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.objectStorageSettingsFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const keepPlaceholder = settings?.configured ? t('settings.objectStorageKeep') : undefined

  return (
    <SettingsGroup title={t('settings.objectStorage')} description={t('settings.objectStorageDesc')}>
      {isLoading ? (
        <HStack hAlign="center" padding={4}>
          <Spinner label={t('settings.objectStorageLoading')} />
        </HStack>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <VStack gap={4}>
            {settings && (
              <HStack gap={2} vAlign="center">
                <StatusDot
                  variant={settings.configured ? 'success' : 'neutral'}
                  label={
                    settings.configured
                      ? t('settings.objectStorageConfigured')
                      : t('settings.objectStorageNotConfigured')
                  }
                />
                <Text>
                  {settings.configured
                    ? t('settings.objectStorageStatusConfigured')
                    : t('settings.objectStorageStatusNotConfigured')}
                </Text>
              </HStack>
            )}
            <TextInput
              label={t('settings.s3Endpoint')}
              description={t('settings.s3EndpointDesc')}
              type="url"
              value={endpoint}
              onChange={setEndpoint}
              placeholder="https://t3.storageapi.dev"
              isRequired
              isDisabled={isSaving}
              hasAutoCorrect={false}
              hasSpellCheck={false}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label={t('settings.s3Region')}
                value={region}
                onChange={setRegion}
                placeholder="auto"
                isRequired
                isDisabled={isSaving}
              />
              <TextInput
                label={t('settings.s3Bucket')}
                value={bucket}
                onChange={setBucket}
                placeholder={t('settings.s3BucketPlaceholder')}
                isRequired
                isDisabled={isSaving}
              />
              <TextInput
                label={t('settings.s3AccessKeyId')}
                type="password"
                value={accessKeyId}
                onChange={setAccessKeyId}
                placeholder={keepPlaceholder}
                autoComplete="off"
                isDisabled={isSaving}
              />
              <TextInput
                label={t('settings.s3SecretAccessKey')}
                type="password"
                value={secretAccessKey}
                onChange={setSecretAccessKey}
                placeholder={keepPlaceholder}
                autoComplete="off"
                isDisabled={isSaving}
              />
            </div>
            {settings?.configured && (
              <Text as="p" type="supporting">
                {t('settings.objectStorageCredentialsDesc')}
              </Text>
            )}
            <NumberInput
              label={t('settings.s3SignedUrlTtl')}
              description={t('settings.s3SignedUrlTtlDesc')}
              value={urlTtlSeconds}
              onChange={(value) => setUrlTtlSeconds(value)}
              min={1}
              max={MAX_TTL}
              isIntegerOnly
              isRequired
              isDisabled={isSaving}
              width={200}
            />
            <HStack gap={3} wrap="wrap">
              <Button
                type="submit"
                label={t('settings.saveObjectStorageSettings')}
                variant="primary"
                isLoading={isSaving}
              />
            </HStack>
            {settings?.configured && (
              <div>
                <ConfirmAction
                  label={t('settings.objectStorageClear')}
                  title={t('settings.objectStorageClearConfirm')}
                  description={t('settings.objectStorageClearWarning')}
                  confirmLabel={t('settings.objectStorageClear')}
                  cancelLabel={t('common.cancel')}
                  onConfirm={clear}
                  isDisabled={isSaving}
                />
              </div>
            )}
          </VStack>
        </form>
      )}
    </SettingsGroup>
  )
}
