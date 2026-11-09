import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Divider } from '@astryxdesign/core/Divider'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { KeyRound } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { AccessScreen } from '../components/access/AccessScreen'
import { ConfirmAction } from '../components/page/ConfirmAction'
import { useTranslation } from '../hooks/useTranslation'
import { resetApiUrlCache } from '../lib/api-config'
import { APP_VERSION } from '../lib/app-version'
import type { DesktopFirstRunStatus } from '../lib/desktop'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'
import { toast } from '../lib/toast'
import { connectWithKey } from '../services/connections'

interface ConnectionSetupProps {
  status: DesktopFirstRunStatus | null
  onResolved: (status?: DesktopFirstRunStatus) => Promise<void> | void
}

const ERROR_KEYS: Record<string, string> = {
  invalid_connection_key: 'connection.invalidKey',
  connection_not_found: 'connection.keyNotFound',
}

/** Key-only onboarding: the admin app creates the store, devices just connect. */
export default function ConnectionSetup({ status, onResolved }: ConnectionSetupProps) {
  const { t } = useTranslation()
  const [key, setKey] = useState('')
  const [apiUrl, setApiUrl] = useState(status?.apiUrl || '')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: read the saved API URL once on mount
  useEffect(() => {
    if (!isDesktop || apiUrl) return
    let cancelled = false
    void requireDesktopApi()
      .getConfig()
      .then((config) => {
        if (!cancelled && config.apiUrl) setApiUrl((current) => current || config.apiUrl)
      })
      .catch(() => null)
    return () => {
      cancelled = true
    }
  }, [])

  const handleConnect = async (event?: FormEvent) => {
    event?.preventDefault()
    if (isSubmitting) return
    setError(null)
    if (isDesktop && !apiUrl.trim()) {
      setError(t('connection.apiUrlRequired'))
      return
    }

    setIsSubmitting(true)
    try {
      const result = await connectWithKey({ key, apiUrl })
      if (isDesktop) resetApiUrlCache()
      toast.success(t('connection.joined', { name: result.storeName }))
      await onResolved(result.status)
    } catch (caught) {
      const raw = caught instanceof Error ? caught.message : ''
      setError(ERROR_KEYS[raw] ? t(ERROR_KEYS[raw]) : raw || t('connection.connectFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFactoryReset = async () => {
    try {
      const nextStatus = await requireDesktopApi().connection.factoryReset()
      toast.success(t('connection.factoryResetDone'))
      await onResolved(nextStatus)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t('connection.factoryResetFailed'))
    }
  }

  return (
    <AccessScreen
      title={t('connection.title')}
      description={t(isDesktop ? 'connection.subtitle' : 'connection.webSubtitle')}
      footer={[
        <Text key="version" type="supporting" hasTabularNumbers>
          {`v${APP_VERSION}`}
        </Text>,
      ]}
    >
      <form onSubmit={(event) => void handleConnect(event)} noValidate>
        <VStack gap={4}>
          {error && <Banner status="error" title={error} />}
          <TextInput
            label={t('connection.key')}
            description={t('connection.keyHelp')}
            value={key}
            onChange={(value) => {
              setKey(value)
              setError(null)
            }}
            placeholder="OPK_XXXX-XXXX-XXXX-XXXX"
            startIcon={KeyRound}
            autoComplete="off"
            hasSpellCheck={false}
            hasAutoCorrect={false}
            autoCapitalize="off"
            isRequired
            hasAutoFocus
          />
          {isDesktop && (
            <TextInput
              label={t('connection.apiUrl')}
              description={t('connection.apiUrlHelp')}
              type="url"
              value={apiUrl}
              onChange={(value) => {
                setApiUrl(value)
                setError(null)
              }}
              placeholder="https://api.pos.softmelody.dev"
              autoComplete="url"
              hasSpellCheck={false}
              isRequired
            />
          )}
          <Button
            label={isSubmitting ? t('connection.connecting') : t('connection.connect')}
            type="submit"
            variant="primary"
            size="lg"
            width="100%"
            isLoading={isSubmitting}
          />
        </VStack>
      </form>

      {isDesktop && (
        <VStack gap={3}>
          <Divider />
          <ConfirmAction
            label={t('connection.factoryReset')}
            title={t('connection.factoryResetTitle')}
            description={t('connection.factoryResetDesc')}
            confirmLabel={t('connection.factoryResetConfirm')}
            cancelLabel={t('common.cancel')}
            onConfirm={handleFactoryReset}
            size="sm"
            isDisabled={isSubmitting}
          />
        </VStack>
      )}
    </AccessScreen>
  )
}
