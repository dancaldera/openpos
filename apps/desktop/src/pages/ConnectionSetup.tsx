import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { AppLogo } from '../components/ui/AppLogo'
import { Button } from '../components/ui/Button'
import { Form } from '../components/ui/Form'
import { Input } from '../components/ui/Input'
import { UpdateBadge } from '../components/ui/UpdateBadge'
import { useTranslation } from '../hooks/useTranslation'
import { resetApiUrlCache } from '../lib/api-config'
import { APP_VERSION } from '../lib/app-version'
import type { DesktopFirstRunStatus } from '../lib/desktop'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'
import { connectWithKey } from '../services/connections'
import { appSettingsStore } from '../stores/appSettings/appSettingsStore'

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
  const { appName } = appSettingsStore
  const [key, setKey] = useState('')
  const [apiUrl, setApiUrl] = useState(status?.apiUrl || '')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resetArmed, setResetArmed] = useState(false)

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

  const handleConnect = async () => {
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
      const message = ERROR_KEYS[raw] ? t(ERROR_KEYS[raw]) : raw || t('connection.connectFailed')
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFactoryReset = async () => {
    if (!resetArmed) {
      setResetArmed(true)
      setTimeout(() => setResetArmed(false), 4000)
      return
    }

    setResetArmed(false)
    try {
      const nextStatus = await requireDesktopApi().connection.factoryReset()
      toast.success(t('connection.factoryResetDone'))
      await onResolved(nextStatus)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t('connection.factoryResetFailed'))
    }
  }

  return (
    <div class="drag-region signin-page min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div class="signin-glow signin-glow--cyan" aria-hidden="true" />
      <div class="signin-glow signin-glow--violet" aria-hidden="true" />
      <div class="no-drag w-full max-w-sm relative z-10">
        <div class="bg-canvas backdrop-blur-xl rounded-cards shadow-sm border border-fog-border p-8">
          <div class="text-center mb-8">
            <AppLogo class="mx-auto h-12 w-12 mb-3" />
            <h1 class="text-2xl font-bold text-void">{appName.value}</h1>
            <p class="text-sm text-graphite mt-2">{t(isDesktop ? 'connection.subtitle' : 'connection.webSubtitle')}</p>
          </div>

          <Form onSubmit={() => void handleConnect()}>
            <Input
              label={t('connection.key')}
              value={key}
              onInput={(e) => {
                setKey((e.target as HTMLInputElement).value)
                setError(null)
              }}
              placeholder="OPK_XXXX-XXXX-XXXX-XXXX"
              autocomplete="off"
              spellcheck={false}
              required
              helperText={t('connection.keyHelp')}
            />
            {isDesktop ? (
              <Input
                label={t('connection.apiUrl')}
                type="url"
                value={apiUrl}
                onInput={(e) => {
                  setApiUrl((e.target as HTMLInputElement).value)
                  setError(null)
                }}
                placeholder="https://api.pos.softmelody.dev"
                required
                helperText={t('connection.apiUrlHelp')}
              />
            ) : null}
            {error ? (
              <p class="text-sm text-void" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="primary" size="lg" class="w-full" disabled={isSubmitting}>
              {isSubmitting ? t('connection.connecting') : t('connection.connect')}
            </Button>
          </Form>

          <div class="mt-8 pt-6 border-t border-fog-border text-center">
            <span class="text-xs text-graphite">v{APP_VERSION}</span>
            {isDesktop ? (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleFactoryReset()}
                class={`mt-3 w-full cursor-pointer rounded-buttons border px-4 py-2 text-sm transition-colors ${
                  resetArmed
                    ? 'border-danger bg-danger-soft text-danger'
                    : 'border-fog-border text-danger hover:bg-danger-soft'
                }`}
              >
                {resetArmed ? t('connection.factoryResetConfirm') : t('connection.factoryReset')}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <UpdateBadge />
    </div>
  )
}
