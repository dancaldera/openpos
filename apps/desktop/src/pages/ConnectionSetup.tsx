import { useState } from 'preact/hooks'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { Form } from '../components/ui/Form'
import { Input } from '../components/ui/Input'
import { PasswordInput } from '../components/ui/PasswordInput'
import { useTranslation } from '../hooks/useTranslation'
import { APP_VERSION } from '../lib/app-version'
import type { DesktopFirstRunStatus } from '../lib/desktop'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'
import { createStoreConnection, importStoreConnection, joinStoreConnection } from '../services/connections'
import { appSettingsStore } from '../stores/appSettings/appSettingsStore'

interface ConnectionSetupProps {
  status: DesktopFirstRunStatus | null
  onResolved: (status?: DesktopFirstRunStatus) => Promise<void> | void
}

type Mode = 'choose' | 'create' | 'join' | 'import' | 'kit'

export default function ConnectionSetup({ status, onResolved }: ConnectionSetupProps) {
  const { t } = useTranslation()
  const { appName } = appSettingsStore
  const [mode, setMode] = useState<Mode>(status?.status === 'needsEmergencyKit' ? 'kit' : 'choose')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [storeName, setStoreName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [joinKey, setJoinKey] = useState('')
  const [joinSeed, setJoinSeed] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [importToken, setImportToken] = useState('')
  const [kitKey, setKitKey] = useState(status?.connectionKey || '')
  const [kitSeed, setKitSeed] = useState('')
  const [kitStoreName, setKitStoreName] = useState(status?.storeName || '')
  const [kitSaved, setKitSaved] = useState(false)

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

  const handleCreate = async () => {
    setIsSubmitting(true)
    try {
      const result = await createStoreConnection({
        storeName,
        adminName,
        adminEmail,
        adminPassword,
      })
      await showKit(result.key, result.seed, result.storeName)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('connection.createFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleJoin = async () => {
    setIsSubmitting(true)
    try {
      const result = await joinStoreConnection({ key: joinKey, seed: joinSeed })
      toast.success(t('connection.joined', { name: result.storeName }))
      await onResolved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('connection.joinFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleImport = async () => {
    setIsSubmitting(true)
    try {
      const result = await importStoreConnection({ url: importUrl, authToken: importToken })
      await showKit(result.key, result.seed, result.storeName)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('connection.importFailed'))
    } finally {
      setIsSubmitting(false)
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

  const copyKit = async () => {
    const text = `${t('connection.key')}: ${kitKey}\n${t('connection.seed')}: ${kitSeed}\n${t('connection.storeName')}: ${kitStoreName}`
    await navigator.clipboard.writeText(text)
    toast.success(t('connection.copied'))
  }

  return (
    <div class="min-h-screen flex items-center justify-center p-4 bg-chalk">
      <div class="w-full max-w-md">
        <div class="bg-canvas backdrop-blur-sm rounded-cards shadow-sm p-8">
          <div class="text-center mb-8">
            <h1 class="text-2xl font-bold text-void">{appName.value}</h1>
            <p class="text-sm text-graphite mt-2">{t('connection.subtitle')}</p>
          </div>

          {mode === 'choose' ? (
            <div class="space-y-3">
              <Button type="button" variant="primary" size="lg" class="w-full" onClick={() => setMode('create')}>
                {t('connection.createStore')}
              </Button>
              <Button type="button" variant="outline" size="lg" class="w-full" onClick={() => setMode('join')}>
                {t('connection.joinStore')}
              </Button>
              <Button type="button" variant="outline" size="lg" class="w-full" onClick={() => setMode('import')}>
                {t('connection.importDatabase')}
              </Button>
            </div>
          ) : null}

          {mode === 'create' ? (
            <Form onSubmit={handleCreate}>
              <Input
                label={t('connection.storeName')}
                value={storeName}
                onInput={(e) => setStoreName((e.target as HTMLInputElement).value)}
                required
              />
              <Input
                label={t('connection.adminName')}
                value={adminName}
                onInput={(e) => setAdminName((e.target as HTMLInputElement).value)}
                required
              />
              <Input
                label={t('auth.email')}
                type="email"
                value={adminEmail}
                onInput={(e) => setAdminEmail((e.target as HTMLInputElement).value)}
                required
              />
              <PasswordInput
                label={t('auth.password')}
                value={adminPassword}
                onInput={(e) => setAdminPassword((e.target as HTMLInputElement).value)}
                required
                showStrength
              />
              <Button type="submit" variant="primary" size="lg" class="w-full" disabled={isSubmitting}>
                {isSubmitting ? t('common.loading') : t('connection.createStore')}
              </Button>
              <button type="button" class="w-full text-sm text-graphite" onClick={() => setMode('choose')}>
                {t('common.back')}
              </button>
            </Form>
          ) : null}

          {mode === 'join' ? (
            <Form onSubmit={handleJoin}>
              <Input
                label={t('connection.key')}
                value={joinKey}
                onInput={(e) => setJoinKey((e.target as HTMLInputElement).value)}
                required
              />
              <PasswordInput
                label={t('connection.seed')}
                value={joinSeed}
                onInput={(e) => setJoinSeed((e.target as HTMLInputElement).value)}
                required
              />
              <Button type="submit" variant="primary" size="lg" class="w-full" disabled={isSubmitting}>
                {isSubmitting ? t('common.loading') : t('connection.joinStore')}
              </Button>
              <button type="button" class="w-full text-sm text-graphite" onClick={() => setMode('choose')}>
                {t('common.back')}
              </button>
            </Form>
          ) : null}

          {mode === 'import' ? (
            <Form onSubmit={handleImport}>
              <Input
                label={t('settings.databaseUrl')}
                value={importUrl}
                onInput={(e) => setImportUrl((e.target as HTMLInputElement).value)}
                placeholder="libsql://your-store.turso.io"
                required
              />
              <PasswordInput
                label={t('settings.databaseAuthToken')}
                value={importToken}
                onInput={(e) => setImportToken((e.target as HTMLInputElement).value)}
                required
              />
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

          <div class="mt-8 pt-6 border-t border-fog-border text-center">
            <span class="text-xs text-graphite">v{APP_VERSION}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
