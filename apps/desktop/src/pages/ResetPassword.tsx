import { useState } from 'preact/hooks'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { Form } from '../components/ui/Form'
import { SpinnerIcon } from '../components/ui/icons'
import { PasswordInput } from '../components/ui/PasswordInput'
import { useTranslation } from '../hooks/useTranslation'
import { authService } from '../services/auth-turso'
import { appSettingsStore } from '../stores/appSettings/appSettingsStore'

function getResetToken(): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('token')?.trim() || ''
}

export default function ResetPassword() {
  const { t } = useTranslation()
  const { appName } = appSettingsStore
  const [token] = useState(getResetToken)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  const handleSubmit = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error(t('auth.fillAllFields'))
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error(t('auth.recovery.passwordsDoNotMatch'))
      return
    }

    setIsLoading(true)
    try {
      const result = await authService.resetPasswordWithToken(token, newPassword)
      if (result.success) {
        setIsComplete(true)
        window.history.replaceState({}, '', '/reset-password')
      } else {
        toast.error(result.error || t('auth.recovery.resetFailed'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth.recovery.resetFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  const content = !token ? (
    <div class="space-y-4">
      <p class="text-sm text-graphite">{t('auth.recovery.invalidLink')}</p>
      <a href="/" class="block text-center text-sm text-void underline underline-offset-4">
        {t('auth.recovery.backToSignIn')}
      </a>
    </div>
  ) : isComplete ? (
    <div class="space-y-4">
      <div class="rounded-cards border border-fog-border bg-chalk p-4 text-sm text-void">
        {t('auth.recovery.resetSuccess')}
      </div>
      <a href="/" class="block text-center text-sm text-void underline underline-offset-4">
        {t('auth.recovery.backToSignIn')}
      </a>
    </div>
  ) : (
    <Form onSubmit={handleSubmit} spacing="md">
      <p class="text-sm text-graphite">{t('auth.recovery.pageDescription')}</p>
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
      <Button type="submit" variant="primary" size="lg" disabled={isLoading} class="w-full">
        {isLoading ? (
          <>
            <SpinnerIcon class="animate-spin h-4 w-4 mr-2" />
            {t('common.loading')}
          </>
        ) : (
          t('auth.recovery.resetPassword')
        )}
      </Button>
    </Form>
  )

  return (
    <div class="min-h-screen flex items-center justify-center p-4 bg-chalk">
      <div class="w-full max-w-sm">
        <div class="bg-canvas rounded-cards shadow-sm border border-fog-border p-8">
          <div class="text-center mb-7">
            <h1 class="text-xl font-semibold text-void">{appName.value}</h1>
            <p class="text-sm text-graphite mt-1">{t('auth.recovery.pageTitle')}</p>
          </div>
          {content}
        </div>
      </div>
    </div>
  )
}
