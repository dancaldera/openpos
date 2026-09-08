import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { Form } from '../components/ui/Form'
import { Input } from '../components/ui/Input'
import { PasswordInput } from '../components/ui/PasswordInput'
import { UpdateBadge } from '../components/ui/UpdateBadge'
import { useTranslation } from '../hooks/useTranslation'
import { resetApiUrlCache } from '../lib/api-config'
import { APP_VERSION } from '../lib/app-version'
import type { DesktopFirstRunStatus } from '../lib/desktop'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'
import { importStoreConnection } from '../services/connections'
import { appSettingsStore } from '../stores/appSettings/appSettingsStore'
import { type ConnectionSetupMode, connectionSetupMode } from './connection-setup-mode'

interface ConnectionSetupProps {
  status: DesktopFirstRunStatus | null
  onResolved: (status?: DesktopFirstRunStatus) => Promise<void> | void
}

type Mode = ConnectionSetupMode

const OWNER_REQUIRED = 'owner_required_for_empty_database'

export default function ConnectionSetup({ status, onResolved }: ConnectionSetupProps) {
  const { t } = useTranslation()
  const { appName } = appSettingsStore
  const [mode, setMode] = useState<Mode>(connectionSetupMode(status))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [storeName, setStoreName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [importToken, setImportToken] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [resetArmed, setResetArmed] = useState(false)
  const [ownerRequired, setOwnerRequired] = useState(status?.status === 'needsOwner')
  const [kitKey, setKitKey] = useState(status?.connectionKey || '')
  const [kitSeed, setKitSeed] = useState('')
  const [kitStoreName, setKitStoreName] = useState(status?.storeName || '')
  const [kitSaved, setKitSaved] = useState(false)
  const [apiUrl, setApiUrl] = useState(status?.apiUrl || '')
  const [apiError, setApiError] = useState<string | null>(null)
  const [apiReachable, setApiReachable] = useState<boolean | null>(null)
  const [apiChecked, setApiChecked] = useState(false)

  useEffect(() => {
    const nextMode = connectionSetupMode(status)
    if (nextMode !== 'choose') {
      setMode(nextMode)
    }
    if (status?.status === 'needsOwner') {
      setOwnerRequired(true)
    }
    if (status?.storeName) {
      setKitStoreName(status.storeName)
    }
    if (status?.apiUrl) {
      setApiUrl((current) => current || status.apiUrl || '')
    }
  }, [status?.status, status?.storeName, status?.apiUrl])

  useEffect(() => {
    if (mode !== 'api' || !isDesktop) return

    let cancelled = false
    void (async () => {
      try {
        const config = await requireDesktopApi().getConfig()
        if (cancelled) return
        if (config.apiUrl) {
          setApiUrl((current) => current || config.apiUrl)
        }

        const snapshot = await requireDesktopApi().connectivity.getStatus()
        if (cancelled) return
        setApiChecked(true)
        setApiReachable(Boolean(snapshot.apiReachable))
        setApiError(
          !snapshot.apiConfigured
            ? t('connection.apiUrlRequired')
            : snapshot.apiReachable
              ? null
              : snapshot.apiLastError || t('connection.apiUnreachable'),
        )
      } catch (error) {
        if (cancelled) return
        setApiChecked(true)
        setApiReachable(false)
        setApiError(error instanceof Error ? error.message : t('connection.apiUnreachable'))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mode, t])

  const showKit = async (key: string, seed: string | undefined, name: string) => {
    setKitKey(key)
    setKitSeed(seed || '')
    setKitStoreName(name)
    setKitSaved(false)
    if (!seed && isDesktop) {
      const kit = await requireDesktopApi().connection.getEmergencyKit()
      setKitSeed(kit.seed || '')
      setKitStoreName(kit.storeName)
    }
    setMode('kit')
  }

  const ownerFields = () => ({
    storeName: storeName.trim() || undefined,
    adminName: adminName.trim() || undefined,
    adminEmail: adminEmail.trim() || undefined,
    adminPassword: adminPassword || undefined,
  })

  const handleImport = async () => {
    setImportError(null)
    setIsSubmitting(true)
    try {
      const result = await importStoreConnection({
        url: importUrl,
        authToken: importToken,
        ...ownerFields(),
      })
      setOwnerRequired(false)
      if (result.seed) {
        await showKit(result.key, result.seed, result.storeName)
        return
      }
      toast.success(t('connection.joined', { name: result.storeName }))
      await onResolved(result.status)
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : t('connection.importFailed')
      const isEmptyDatabase = rawMessage === OWNER_REQUIRED
      if (isEmptyDatabase) {
        setOwnerRequired(true)
      }
      const message = isEmptyDatabase ? t('connection.ownerRequired') : rawMessage
      setImportError(message)
      toast.error(message)
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
      const status = await requireDesktopApi().connection.factoryReset()
      toast.success(t('connection.factoryResetDone'))
      await onResolved(status)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('connection.factoryResetFailed'))
    }
  }

  const handleConfirmKit = async () => {
    if (!kitSaved) {
      toast.error(t('connection.confirmSaveRequired'))
      return
    }
    setIsSubmitting(true)
    try {
      if (isDesktop) {
        const nextStatus = await requireDesktopApi().connection.confirmEmergencyKit()
        await onResolved(nextStatus)
        return
      }
      await onResolved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('connection.confirmFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const probeApi = async () => {
    if (!isDesktop) {
      const configured = Boolean(apiUrl.trim())
      setApiChecked(true)
      setApiReachable(configured)
      setApiError(configured ? null : t('connection.apiUrlRequired'))
      return { reachable: configured, error: configured ? null : t('connection.apiUrlRequired') }
    }

    const snapshot = await requireDesktopApi().connectivity.getStatus()
    const reachable = Boolean(snapshot.apiReachable)
    const error = !snapshot.apiConfigured
      ? t('connection.apiUrlRequired')
      : reachable
        ? null
        : snapshot.apiLastError || t('connection.apiUnreachable')
    setApiChecked(true)
    setApiReachable(reachable)
    setApiError(error)
    return { reachable, error }
  }

  const handleSaveApi = async (options: { skipReachability?: boolean; checkOnly?: boolean } = {}) => {
    const trimmed = apiUrl.trim()
    if (!trimmed) {
      setApiError(t('connection.apiUrlRequired'))
      setApiChecked(true)
      setApiReachable(false)
      return
    }

    setIsSubmitting(true)
    try {
      if (!isDesktop) {
        await onResolved()
        return
      }

      const nextStatus = await requireDesktopApi().setApiUrl(trimmed)
      resetApiUrlCache()
      const probe = await probeApi()
      if (!probe.reachable && !options.skipReachability) {
        return
      }
      if (options.checkOnly) {
        return
      }
      await onResolved(nextStatus)
    } catch (error) {
      setApiChecked(true)
      setApiReachable(false)
      setApiError(error instanceof Error ? error.message : t('connection.apiSaveFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const copyKit = async () => {
    const text = `${t('connection.key')}: ${kitKey}\n${t('connection.seed')}: ${kitSeed}\n${t('connection.storeName')}: ${kitStoreName}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('connection.copied'))
    } catch {
      toast.error(t('errors.generic'))
    }
  }

  const ownerForm = (
    <>
      <Input
        label={t('connection.storeName')}
        value={storeName}
        onInput={(e) => setStoreName((e.target as HTMLInputElement).value)}
        required={ownerRequired}
      />
      <Input
        label={t('connection.adminName')}
        value={adminName}
        onInput={(e) => setAdminName((e.target as HTMLInputElement).value)}
        required={ownerRequired}
      />
      <Input
        label={t('auth.email')}
        type="email"
        value={adminEmail}
        onInput={(e) => setAdminEmail((e.target as HTMLInputElement).value)}
        required={ownerRequired}
      />
      <PasswordInput
        label={t('auth.password')}
        value={adminPassword}
        onInput={(e) => setAdminPassword((e.target as HTMLInputElement).value)}
        required={ownerRequired}
        showStrength
      />
    </>
  )

  return (
    <div class="drag-region signin-page min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div class="signin-glow signin-glow--cyan" aria-hidden="true" />
      <div class="signin-glow signin-glow--violet" aria-hidden="true" />
      <div class="no-drag w-full max-w-sm relative z-10">
        <div class="bg-canvas backdrop-blur-xl rounded-cards shadow-sm border border-fog-border p-8">
          <div class="text-center mb-8">
            <h1 class="text-2xl font-bold text-void">{appName.value}</h1>
            <p class="text-sm text-graphite mt-2">{t(isDesktop ? 'connection.subtitle' : 'connection.webSubtitle')}</p>
          </div>

          {mode === 'choose' ? (
            <Button type="button" variant="primary" size="lg" class="w-full" onClick={() => setMode('import')}>
              {t('connection.importDatabase')}
            </Button>
          ) : null}

          {mode === 'import' ? (
            <Form onSubmit={handleImport}>
              <Input
                label={t('settings.databaseUrl')}
                type="url"
                value={importUrl}
                onInput={(e) => setImportUrl((e.target as HTMLInputElement).value)}
                placeholder="libsql://your-store.turso.io"
                required
                helperText={t('settings.databaseUrlDesc')}
              />
              <PasswordInput
                label={t('settings.databaseAuthToken')}
                value={importToken}
                onInput={(e) => setImportToken((e.target as HTMLInputElement).value)}
                required
              />
              <p class="text-xs text-graphite">{t('connection.databaseValidationDescription')}</p>
              <div class="pt-2">
                <h2 class="text-sm font-semibold text-void">{t('connection.ownerOptionalTitle')}</h2>
                <p class="text-sm text-graphite mt-1 mb-4">
                  {ownerRequired ? t('connection.ownerRequired') : t('connection.ownerOptionalDescription')}
                </p>
                {ownerForm}
              </div>
              {importError ? (
                <p class="text-sm text-void" role="alert">
                  {importError}
                </p>
              ) : null}
              <Button type="submit" variant="primary" size="lg" class="w-full" disabled={isSubmitting}>
                {isSubmitting ? t('common.loading') : t('connection.importDatabase')}
              </Button>
              <button type="button" class="w-full text-sm text-graphite" onClick={() => setMode('choose')}>
                {t('common.back')}
              </button>
            </Form>
          ) : null}

          {mode === 'kit' ? (
            <div class="space-y-4">
              <h2 class="text-lg font-semibold text-void">{t('connection.emergencyKitTitle')}</h2>
              <p class="text-sm text-graphite">{t('connection.emergencyKitDescription')}</p>
              <div class="rounded-cards border border-fog-border bg-chalk p-4 space-y-2 text-sm text-void break-all">
                <p>
                  <span class="text-graphite">{t('connection.storeName')}:</span> {kitStoreName}
                </p>
                <p>
                  <span class="text-graphite">{t('connection.key')}:</span> {kitKey}
                </p>
                <p>
                  <span class="text-graphite">{t('connection.seed')}:</span> {kitSeed}
                </p>
              </div>
              <Button type="button" variant="outline" class="w-full" onClick={() => void copyKit()}>
                {t('connection.copyKit')}
              </Button>
              <label class="flex items-start gap-2 text-sm text-void">
                <input
                  type="checkbox"
                  checked={kitSaved}
                  onChange={(e) => setKitSaved((e.target as HTMLInputElement).checked)}
                />
                {t('connection.savedConfirmation')}
              </label>
              <Button
                type="button"
                variant="primary"
                size="lg"
                class="w-full"
                disabled={isSubmitting}
                onClick={() => void handleConfirmKit()}
              >
                {isSubmitting ? t('common.loading') : t('connection.continue')}
              </Button>
            </div>
          ) : null}

          {mode === 'api' ? (
            <Form onSubmit={() => void handleSaveApi()}>
              <h2 class="text-lg font-semibold text-void">
                {t('connection.joined', { name: kitStoreName || status?.storeName || t('connection.storeName') })}
              </h2>
              <p class="text-sm text-graphite">{t('connection.apiRequiredDescription')}</p>
              <Input
                label={t('connection.apiUrl')}
                type="url"
                value={apiUrl}
                onInput={(e) => {
                  setApiUrl((e.target as HTMLInputElement).value)
                  setApiChecked(false)
                  setApiReachable(null)
                  setApiError(null)
                }}
                placeholder="https://api.openpos.xyz"
                required
              />
              {apiChecked && apiReachable ? <p class="text-sm text-void">{t('connection.apiReachable')}</p> : null}
              {apiError ? (
                <p class="text-sm text-void" role="alert">
                  {apiError}
                </p>
              ) : null}
              <div class="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  class="w-full"
                  disabled={isSubmitting}
                  onClick={() => void handleSaveApi({ checkOnly: true })}
                >
                  {isSubmitting ? t('connection.checkingApi') : t('connection.checkApi')}
                </Button>
                <Button type="submit" variant="primary" size="lg" class="w-full" disabled={isSubmitting}>
                  {isSubmitting ? t('common.loading') : t('connection.continue')}
                </Button>
              </div>
              {apiChecked && !apiReachable && apiUrl.trim() ? (
                <button
                  type="button"
                  class="w-full text-sm text-graphite"
                  disabled={isSubmitting}
                  onClick={() => void handleSaveApi({ skipReachability: true })}
                >
                  {t('connection.continueAnyway')}
                </button>
              ) : null}
            </Form>
          ) : null}

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
