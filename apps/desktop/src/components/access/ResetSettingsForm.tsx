import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { type FormEvent, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { requireDesktopApi } from '../../lib/desktop'
import { toast } from '../../lib/toast'
import { PasswordField } from './PasswordField'

interface ResetSettingsFormProps {
  onCancel: () => void
}

/** Desktop-only step of the sign-in screen: erase local data with the operator reset key. */
export function ResetSettingsForm({ onCancel }: ResetSettingsFormProps) {
  const { t } = useTranslation()
  const [resetKey, setResetKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (isLoading) return
    setError(null)
    if (!resetKey) {
      setError(t('auth.resetSettingsKeyRequired'))
      return
    }

    setIsLoading(true)
    try {
      await requireDesktopApi().resetSettings(resetKey)
      toast.success(t('auth.resetSettingsSuccess'))
      setResetKey('')
      setTimeout(() => window.location.reload(), 800)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.resetSettingsFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate>
      <VStack gap={4}>
        <Banner status="warning" title={t('auth.resetSettingsWarning')} />
        {error && <Banner status="error" title={error} />}
        <PasswordField
          label={t('auth.resetSettingsKey')}
          value={resetKey}
          onChange={(value) => {
            setResetKey(value)
            setError(null)
          }}
          autoComplete="off"
          isDisabled={isLoading}
          isRequired
          hasAutoFocus
        />
        <HStack gap={2} hAlign="end">
          <Button label={t('auth.backToSignIn')} variant="secondary" isDisabled={isLoading} onClick={onCancel} />
          <Button label={t('auth.resetSettingsConfirm')} variant="destructive" type="submit" isLoading={isLoading} />
        </HStack>
      </VStack>
    </form>
  )
}
