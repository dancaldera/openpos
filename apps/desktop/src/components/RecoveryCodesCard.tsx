import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { useTranslation } from '../hooks/useTranslation'
import { authService, type RecoveryCodesStatus } from '../services/auth-turso'
import { Button, Dialog, Form, PasswordInput } from './ui'

/**
 * Manage single-use recovery codes. Codes are shown exactly once when
 * generated and can be used from the sign-in screen to reset the password.
 */
export function RecoveryCodesCard() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<RecoveryCodesStatus | null>(null)

  const [isPromptOpen, setIsPromptOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const [generatedCodes, setGeneratedCodes] = useState<string[] | null>(null)
  const [hasCopied, setHasCopied] = useState(false)

  useEffect(() => {
    loadStatus()
  }, [])

  const loadStatus = async () => {
    try {
      setStatus(await authService.getRecoveryCodesStatus())
    } catch (err) {
      console.error('Failed to load recovery codes status:', err)
    }
  }

  const openPrompt = () => {
    setCurrentPassword('')
    setIsPromptOpen(true)
  }

  const handleGenerate = async () => {
    if (!currentPassword) {
      toast.error(t('auth.fillAllFields'))
      return
    }

    setIsGenerating(true)
    try {
      const result = await authService.generateRecoveryCodes(currentPassword)
      if (result.success && result.codes) {
        setIsPromptOpen(false)
        setCurrentPassword('')
        setHasCopied(false)
        setGeneratedCodes(result.codes)
        toast.success(t('settings.recoveryCodesGenerated'))
        await loadStatus()
      } else {
        toast.error(result.error || t('settings.recoveryCodesGenerateFailed'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.recoveryCodesGenerateFailed'))
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyAll = async () => {
    if (!generatedCodes) return
    try {
      await navigator.clipboard.writeText(generatedCodes.join('\n'))
      setHasCopied(true)
      toast.success(t('settings.recoveryCodesCopied'))
    } catch {
      toast.error(t('settings.recoveryCodesCopyFailed'))
    }
  }

  const statusText = () => {
    if (!status) return t('common.loading')
    if (!status.generated) return t('settings.recoveryCodesNone')
    const unused = t('settings.recoveryCodesUnused', { count: status.unusedCount })
    if (status.lastGeneratedAt) {
      const date = new Date(status.lastGeneratedAt).toLocaleString()
      return `${unused} · ${t('settings.recoveryCodesLastGenerated', { date })}`
    }
    return unused
  }

  return (
    <div>
      <h3 class="text-lg font-medium text-void mb-1">{t('settings.recoveryCodes')}</h3>
      <p class="text-sm text-graphite mb-4">{t('settings.recoveryCodesDesc')}</p>

      <p class="text-sm text-void mb-4">{statusText()}</p>

      <Button variant={status?.generated ? 'outline' : 'primary'} onClick={openPrompt}>
        {status?.generated ? t('settings.regenerateRecoveryCodes') : t('settings.generateRecoveryCodes')}
      </Button>

      {/* Confirm with current password before (re)generating */}
      <Dialog
        isOpen={isPromptOpen}
        onClose={() => setIsPromptOpen(false)}
        title={t('settings.recoveryCodes')}
        size="sm"
      >
        <p class="text-sm text-graphite mb-4">{t('settings.recoveryCodesRegenerateWarning')}</p>
        <Form onSubmit={handleGenerate} spacing="md">
          <PasswordInput
            label={t('settings.currentPassword')}
            value={currentPassword}
            onInput={(e) => setCurrentPassword((e.target as HTMLInputElement).value)}
            disabled={isGenerating}
            required
          />
          <div class="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" onClick={() => setIsPromptOpen(false)} disabled={isGenerating}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={isGenerating}>
              {isGenerating ? t('common.loading') : t('settings.generateRecoveryCodes')}
            </Button>
          </div>
        </Form>
      </Dialog>

      {/* Codes are shown exactly once */}
      <Dialog
        isOpen={generatedCodes !== null}
        onClose={() => setGeneratedCodes(null)}
        title={t('settings.recoveryCodes')}
        size="md"
      >
        <div class="space-y-4">
          <div class="flex items-center space-x-3 rounded-cards border border-fog-border bg-chalk p-4 text-void">
            <span class="text-2xl">🔐</span>
            <div>
              <span class="font-semibold">{t('settings.recoveryCodesShownOnce')}</span>
              <span class="block text-sm">{t('settings.recoveryCodesStoreSafe')}</span>
            </div>
          </div>

          <div class="rounded-cards border border-fog-border bg-chalk p-4">
            <ul class="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-sm text-void">
              {generatedCodes?.map((code) => (
                <li key={code} class="select-all">
                  {code}
                </li>
              ))}
            </ul>
          </div>

          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <Button variant="outline" onClick={handleCopyAll}>
              {hasCopied ? t('settings.recoveryCodesCopiedButton') : t('settings.recoveryCodesCopyAll')}
            </Button>
            <Button variant="primary" onClick={() => setGeneratedCodes(null)}>
              {t('settings.recoveryCodesDone')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
