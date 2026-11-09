import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useEffect, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { resetApiUrlCache } from '../../lib/api-config'
import { requireDesktopApi } from '../../lib/desktop'
import { isDesktop } from '../../lib/platform'
import { toast } from '../../lib/toast'
import { authService } from '../../services/auth-turso'
import { clearStoredConnectionKey } from '../../services/connections'
import { ConfirmAction } from '../page/ConfirmAction'
import { DangerZone } from './DangerZone'
import { ObjectStorageSettings } from './ObjectStorageSettings'
import { SettingsGroup } from './SettingsGroup'

export interface ConnectionInfo {
  key: string
  storeName?: string
}

interface AdvancedSettingsProps {
  isUnlocked: boolean
  onUnlock: () => void
  connectionInfo: ConnectionInfo | null
}

/**
 * Store connection, API address, image storage and device resets. Locked behind
 * the internal API key so they are not changed by accident.
 */
export function AdvancedSettings({ isUnlocked, onUnlock, connectionInfo }: AdvancedSettingsProps) {
  if (!isUnlocked) return <AdvancedUnlock onUnlock={onUnlock} />

  return (
    <VStack gap={8}>
      {connectionInfo?.key && <StoreConnection info={connectionInfo} />}
      {isDesktop && <ApiUrlSettings />}
      <ObjectStorageSettings />
      {isDesktop && <LocalDatabaseReset />}
      <DangerZone />
    </VStack>
  )
}

function AdvancedUnlock({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation()
  const [secret, setSecret] = useState('')
  const [isUnlocking, setIsUnlocking] = useState(false)

  const unlock = async () => {
    if (!secret) return
    setIsUnlocking(true)
    try {
      await authService.verifyInternalSecret(secret)
      setSecret('')
      onUnlock()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.advancedUnlockFailed'))
    } finally {
      setIsUnlocking(false)
    }
  }

  return (
    <SettingsGroup title={t('settings.advancedLockedTitle')} description={t('settings.advancedLockedDesc')}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void unlock()
        }}
      >
        <VStack gap={4}>
          <TextInput
            label={t('auth.recovery.internalSecret')}
            type="password"
            value={secret}
            onChange={setSecret}
            autoComplete="off"
            isRequired
            isDisabled={isUnlocking}
          />
          <HStack>
            <Button
              type="submit"
              label={t('settings.advancedUnlock')}
              variant="primary"
              isLoading={isUnlocking}
              isDisabled={!secret}
            />
          </HStack>
        </VStack>
      </form>
    </SettingsGroup>
  )
}

function StoreConnection({ info }: { info: ConnectionInfo }) {
  const { t } = useTranslation()

  const leave = async () => {
    try {
      if (isDesktop) await requireDesktopApi().connection.leave()
      clearStoredConnectionKey()
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('connection.leaveFailed'))
    }
  }

  return (
    <SettingsGroup title={t('connection.connectionTitle')} description={t('connection.leaveStoreDesc')}>
      <MetadataList>
        {info.storeName && <MetadataListItem label={t('connection.storeName')}>{info.storeName}</MetadataListItem>}
        <MetadataListItem label={t('connection.key')}>
          <Text type="code" wordBreak="break-all">
            {info.key}
          </Text>
        </MetadataListItem>
      </MetadataList>
      <div>
        <ConfirmAction
          label={t('connection.leaveStore')}
          title={t('settings.leaveStoreConfirm')}
          description={t('connection.leaveStoreDesc')}
          confirmLabel={t('connection.leaveStore')}
          cancelLabel={t('common.cancel')}
          onConfirm={leave}
          variant="secondary"
        />
      </div>
    </SettingsGroup>
  )
}

function ApiUrlSettings() {
  const { t } = useTranslation()
  const [apiUrl, setApiUrl] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once; `t` is a new function on every render
  useEffect(() => {
    let isCancelled = false
    requireDesktopApi()
      .getConfig()
      .then((config) => {
        if (!isCancelled) setApiUrl(config.apiUrl)
      })
      .catch((loadError: unknown) => {
        if (!isCancelled) setError(loadError instanceof Error ? loadError.message : t('settings.apiUrlLoadFailed'))
      })
    return () => {
      isCancelled = true
    }
  }, [])

  const save = async () => {
    const trimmed = apiUrl.trim()
    if (!trimmed) {
      setError(t('connection.apiUrlRequired'))
      return
    }

    setIsSaving(true)
    setError('')
    try {
      const desktop = requireDesktopApi()
      await desktop.setApiUrl(trimmed)
      resetApiUrlCache()
      setApiUrl(trimmed)

      const snapshot = await desktop.connectivity.getStatus()
      if (snapshot.apiReachable) {
        toast.success(t('settings.apiUrlSaved'))
      } else {
        setError(snapshot.apiLastError || t('connection.apiUnreachable'))
        toast.warning(snapshot.apiLastError || t('connection.apiUnreachable'))
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('settings.apiUrlSaveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SettingsGroup title={t('settings.apiUrl')} description={t('settings.apiUrlDesc')}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <VStack gap={4}>
          <TextInput
            label={t('settings.apiUrl')}
            type="url"
            value={apiUrl}
            onChange={(value) => {
              setApiUrl(value)
              setError('')
            }}
            placeholder="https://api.pos.softmelody.dev"
            isDisabled={isSaving}
            hasAutoCorrect={false}
            hasSpellCheck={false}
          />
          {error && (
            <Banner status="error" title={t('settings.apiUrlProblem')} description={error} collapsible={false} />
          )}
          <HStack>
            <Button type="submit" label={t('settings.saveApiUrl')} variant="primary" isLoading={isSaving} />
          </HStack>
        </VStack>
      </form>
    </SettingsGroup>
  )
}

function LocalDatabaseReset() {
  const { t } = useTranslation()

  const reset = async () => {
    try {
      await requireDesktopApi().sync.resetLocal()
      toast.success(t('settings.resetLocalDbSuccess'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.generic'))
    }
  }

  return (
    <SettingsGroup title={t('settings.resetLocalDb')} description={t('settings.resetLocalDbDesc')}>
      <div>
        <ConfirmAction
          label={t('settings.resetLocalDb')}
          title={t('settings.resetLocalDbConfirm')}
          description={t('settings.resetLocalDbWarning')}
          confirmLabel={t('settings.resetLocalDb')}
          cancelLabel={t('common.cancel')}
          onConfirm={reset}
        />
      </div>
    </SettingsGroup>
  )
}
