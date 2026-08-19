import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { useTranslation } from '../hooks/useTranslation'
import { authService } from '../services/auth-turso'
import { Button, Dialog, Form, Input, PasswordInput } from './ui'
import { MailIcon } from './ui/icons'

interface ForgotPasswordDialogProps {
  isOpen: boolean
  onClose: () => void
  initialEmail?: string
}

type RecoveryMode = 'email' | 'code'

/**
 * Password recovery from the sign-in screen.
 * The primary flow sends a Resend email with a one-time link to the public
 * reset page. Recovery codes remain available as an offline fallback.
 */
export function ForgotPasswordDialog({ isOpen, onClose, initialEmail = '' }: ForgotPasswordDialogProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<RecoveryMode>('email')
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [linkRequested, setLinkRequested] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setMode('email')
      setEmail(initialEmail)
      setCode('')
      setNewPassword('')
      setConfirmPassword('')
      setLinkRequested(false)
    }
  }, [isOpen, initialEmail])

  const handleRequestLink = async () => {
    if (!email) {
      toast.error(t('validation.emailRequired'))
      return
    }

    setIsLoading(true)
    try {
      const result = await authService.requestPasswordReset(email)
      if (result.success) {
        setLinkRequested(true)
      } else {
        toast.error(result.error || t('auth.recovery.resetFailed'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth.recovery.resetFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleRecoveryCodeReset = async () => {
    if (!email || !code || !newPassword || !confirmPassword) {
      toast.error(t('auth.fillAllFields'))
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('auth.recovery.passwordsDoNotMatch'))
      return
    }

    setIsLoading(true)
    try {
      const result = await authService.resetPasswordWithRecoveryCode(email.trim(), code.trim(), newPassword)
      if (result.success) {
        toast.success(t('auth.recovery.resetSuccess'))
        onClose()
      } else {
        toast.error(result.error || t('auth.recovery.resetFailed'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth.recovery.resetFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'email' ? t('auth.recovery.title') : t('auth.recovery.codeTitle')}
      size="sm"
    >
      {mode === 'email' && linkRequested ? (
        <div class="space-y-4">
          <div class="rounded-cards border border-fog-border bg-chalk p-4 text-sm text-void">
            {t('auth.recovery.resetLinkSent')}
          </div>
          <p class="text-sm text-graphite">{t('auth.recovery.resetLinkSentDescription')}</p>
          <div class="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      ) : mode === 'email' ? (
        <>
          <p class="text-sm text-graphite mb-4">{t('auth.recovery.emailDescription')}</p>
          <Form onSubmit={handleRequestLink} spacing="md">
            <Input
              label={t('auth.email')}
              type="email"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              placeholder="email@example.com"
              disabled={isLoading}
              required
              leftIcon={<MailIcon />}
            />

            <div class="flex flex-col gap-3 pt-2">
              <Button type="submit" variant="primary" disabled={isLoading}>
                {isLoading ? t('auth.recovery.sendingResetLink') : t('auth.recovery.sendResetLink')}
              </Button>
              <button
                type="button"
                onClick={() => setMode('code')}
                class="text-xs text-graphite hover:text-void underline underline-offset-4 transition-colors cursor-pointer"
              >
                {t('auth.recovery.useRecoveryCode')}
              </button>
            </div>
          </Form>
        </>
      ) : (
        <>
          <p class="text-sm text-graphite mb-4">{t('auth.recovery.description')}</p>
          <Form onSubmit={handleRecoveryCodeReset} spacing="md">
            <Input
              label={t('auth.email')}
              type="email"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              placeholder="email@example.com"
              disabled={isLoading}
              required
              leftIcon={<MailIcon />}
            />

            <Input
              label={t('auth.recovery.code')}
              value={code}
              onInput={(e) => setCode((e.target as HTMLInputElement).value)}
              placeholder="XXXXX-XXXXX-XXXXX"
              disabled={isLoading}
              required
              class="uppercase tracking-wide"
            />

            <PasswordInput
              label={t('auth.recovery.newPassword')}
              value={newPassword}
              onInput={(e) => setNewPassword((e.target as HTMLInputElement).value)}
              disabled={isLoading}
              required
              showStrength
            />

            <PasswordInput
              label={t('auth.recovery.confirmPassword')}
              value={confirmPassword}
              onInput={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
              disabled={isLoading}
              required
            />

            <div class="flex flex-col gap-3 pt-2">
              <div class="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" variant="primary" disabled={isLoading}>
                  {isLoading ? t('common.loading') : t('auth.recovery.submit')}
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setMode('email')}
                class="text-xs text-graphite hover:text-void underline underline-offset-4 transition-colors cursor-pointer"
              >
                {t('auth.recovery.useEmailLink')}
              </button>
            </div>
          </Form>
        </>
      )}
    </Dialog>
  )
}
