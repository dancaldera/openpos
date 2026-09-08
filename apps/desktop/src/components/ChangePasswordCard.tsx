import { useState } from 'preact/hooks'
import { toast } from 'sonner'
import { useTranslation } from '../hooks/useTranslation'
import { authService } from '../services/auth-turso'
import { Button, Form, PasswordInput } from './ui'

/** Change the signed-in user's own password (requires the current password). */
export function ChangePasswordCard() {
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(t('auth.fillAllFields'))
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('auth.recovery.passwordsDoNotMatch'))
      return
    }

    setIsLoading(true)
    try {
      const result = await authService.changePassword(currentPassword, newPassword)
      if (result.success) {
        toast.success(t('settings.changePasswordSuccess'))
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        toast.error(result.error || t('settings.changePasswordFailed'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.changePasswordFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <h3 class="text-lg font-medium text-void mb-1">{t('settings.changePassword')}</h3>
      <p class="text-sm text-graphite mb-4">{t('settings.changePasswordDesc')}</p>

      <Form onSubmit={handleSubmit} spacing="md">
        <PasswordInput
          label={t('settings.currentPassword')}
          value={currentPassword}
          onInput={(e) => setCurrentPassword((e.target as HTMLInputElement).value)}
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
        <div class="flex justify-start pt-1">
          <Button type="submit" variant="primary" disabled={isLoading}>
            {isLoading ? t('common.loading') : t('settings.changePassword')}
          </Button>
        </div>
      </Form>
    </div>
  )
}
