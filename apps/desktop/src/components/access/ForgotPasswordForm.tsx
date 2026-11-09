import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Mail } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { toast } from '../../lib/toast'
import { authService } from '../../services/auth-turso'
import { PasswordField } from './PasswordField'

interface ForgotPasswordFormProps {
  initialEmail?: string
  /** Called after a successful reset. */
  onDone: () => void
  onCancel: () => void
}

/**
 * Password reset step of the sign-in screen, authorized with the operator's
 * internal API key (INTERNAL_SECRET on the API server).
 */
export function ForgotPasswordForm({ initialEmail = '', onDone, onCancel }: ForgotPasswordFormProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState(initialEmail)
  const [internalSecret, setInternalSecret] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (isLoading) return
    setError(null)

    if (!email || !internalSecret || !newPassword || !confirmPassword) {
      setError(t('auth.fillAllFields'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('auth.recovery.passwordsDoNotMatch'))
      return
    }

    setIsLoading(true)
    try {
      const result = await authService.resetPasswordWithInternalSecret(email.trim(), internalSecret, newPassword)
      if (result.success) {
        toast.success(t('auth.recovery.resetSuccess'))
        onDone()
      } else {
        setError(result.error || t('auth.recovery.resetFailed'))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.recovery.resetFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate>
      <VStack gap={4}>
        {error && <Banner status="error" title={error} />}
        <TextInput
          label={t('auth.email')}
          type="email"
          value={email}
          onChange={(value) => setEmail(value)}
          placeholder="email@example.com"
          startIcon={Mail}
          autoComplete="email"
          isDisabled={isLoading}
          isRequired
          hasAutoFocus={!initialEmail}
        />
        <PasswordField
          label={t('auth.recovery.internalSecret')}
          value={internalSecret}
          onChange={setInternalSecret}
          autoComplete="off"
          isDisabled={isLoading}
          isRequired
          hasAutoFocus={Boolean(initialEmail)}
        />
        <PasswordField
          label={t('auth.recovery.newPassword')}
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          isDisabled={isLoading}
          isRequired
          hasRequirements
        />
        <PasswordField
          label={t('auth.recovery.confirmPassword')}
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          isDisabled={isLoading}
          isRequired
        />
        <HStack gap={2} hAlign="end">
          <Button label={t('auth.backToSignIn')} variant="secondary" isDisabled={isLoading} onClick={onCancel} />
          <Button label={t('auth.recovery.submit')} variant="primary" type="submit" isLoading={isLoading} />
        </HStack>
      </VStack>
    </form>
  )
}
