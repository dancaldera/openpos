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

/**
 * Password reset from the sign-in screen, authorized with the operator's
 * internal API key (INTERNAL_SECRET on the API server).
 */
export function ForgotPasswordDialog({ isOpen, onClose, initialEmail = '' }: ForgotPasswordDialogProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState(initialEmail)
  const [internalSecret, setInternalSecret] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setEmail(initialEmail)
      setInternalSecret('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }, [isOpen, initialEmail])

  const handleReset = async () => {
    if (!email || !internalSecret || !newPassword || !confirmPassword) {
      toast.error(t('auth.fillAllFields'))
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('auth.recovery.passwordsDoNotMatch'))
      return
    }

    setIsLoading(true)
    try {
      const result = await authService.resetPasswordWithInternalSecret(email.trim(), internalSecret, newPassword)
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
    <Dialog isOpen={isOpen} onClose={onClose} title={t('auth.recovery.title')} size="sm">
      <p class="text-sm text-graphite mb-4">{t('auth.recovery.description')}</p>
      <Form onSubmit={handleReset} spacing="md">
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

        <PasswordInput
          label={t('auth.recovery.internalSecret')}
          value={internalSecret}
          onInput={(e) => setInternalSecret((e.target as HTMLInputElement).value)}
          disabled={isLoading}
          required
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

        <div class="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={isLoading}>
            {isLoading ? t('common.loading') : t('auth.recovery.submit')}
          </Button>
        </div>
      </Form>
    </Dialog>
  )
}
