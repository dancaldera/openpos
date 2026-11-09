import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Circle, CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { toast } from '../../lib/toast'
import { authService } from '../../services/auth-turso'

const PASSWORD_RULES: { key: string; test: (password: string) => boolean }[] = [
  { key: 'settings.passwordRuleLength', test: (password) => password.length >= 8 },
  { key: 'settings.passwordRuleUppercase', test: (password) => /[A-Z]/.test(password) },
  { key: 'settings.passwordRuleLowercase', test: (password) => /[a-z]/.test(password) },
  { key: 'settings.passwordRuleNumber', test: (password) => /[0-9]/.test(password) },
  { key: 'settings.passwordRuleSpecial', test: (password) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password) },
]

/** Change the signed-in user's own password (requires the current password). */
export function ChangePasswordForm() {
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const isMismatch = confirmPassword !== '' && newPassword !== confirmPassword

  const submit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(t('settings.passwordFieldsRequired'))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('auth.recovery.passwordsDoNotMatch'))
      return
    }

    setIsSaving(true)
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settings.changePasswordFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <VStack gap={4}>
        <TextInput
          label={t('settings.currentPassword')}
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          isRequired
          isDisabled={isSaving}
        />
        <VStack gap={2}>
          <TextInput
            label={t('auth.recovery.newPassword')}
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            isRequired
            isDisabled={isSaving}
          />
          <ul aria-label={t('settings.passwordRules')} className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {PASSWORD_RULES.map((rule) => {
              const isMet = rule.test(newPassword)
              return (
                <li key={rule.key} data-met={isMet}>
                  <HStack gap={2} vAlign="center">
                    <Icon icon={isMet ? CircleCheck : Circle} size="sm" color={isMet ? 'success' : 'secondary'} />
                    <Text type="supporting" color={isMet ? 'primary' : 'secondary'}>
                      {t(rule.key)}
                    </Text>
                  </HStack>
                </li>
              )
            })}
          </ul>
        </VStack>
        <TextInput
          label={t('auth.recovery.confirmPassword')}
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          isRequired
          isDisabled={isSaving}
          status={isMismatch ? { type: 'error', message: t('auth.recovery.passwordsDoNotMatch') } : undefined}
        />
        <HStack>
          <Button type="submit" label={t('settings.changePassword')} variant="primary" isLoading={isSaving} />
        </HStack>
      </VStack>
    </form>
  )
}
