import { Button } from '@astryxdesign/core/Button'
import { InputGroup } from '@astryxdesign/core/InputGroup'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Check, Circle, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'

interface PasswordFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  placeholder?: string
  isDisabled?: boolean
  isRequired?: boolean
  hasAutoFocus?: boolean
  /** Show the password requirements checklist under the field. */
  hasRequirements?: boolean
  size?: 'md' | 'lg'
}

export function passwordRequirements(password: string) {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }
}

/** Password input with a show/hide toggle and an optional requirements checklist. */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  isDisabled = false,
  isRequired = false,
  hasAutoFocus = false,
  hasRequirements = false,
  size = 'md',
}: PasswordFieldProps) {
  const { t } = useTranslation()
  const [isVisible, setIsVisible] = useState(false)
  const requirements = passwordRequirements(value)

  return (
    <VStack gap={2}>
      <InputGroup label={label} isRequired={isRequired} isDisabled={isDisabled} size={size}>
        <TextInput
          label={label}
          isLabelHidden
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          hasAutoFocus={hasAutoFocus}
          hasSpellCheck={false}
          autoCapitalize="off"
        />
        <Button
          label={isVisible ? t('auth.hidePassword') : t('auth.showPassword')}
          isIconOnly
          icon={isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          isDisabled={isDisabled}
          onClick={() => setIsVisible((current) => !current)}
        />
      </InputGroup>
      {hasRequirements && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <Requirement met={requirements.minLength} label={t('members.passwordMinLength')} />
          <Requirement met={requirements.uppercase} label={t('members.passwordUppercase')} />
          <Requirement met={requirements.lowercase} label={t('members.passwordLowercase')} />
          <Requirement met={requirements.number} label={t('members.passwordNumber')} />
          <Requirement met={requirements.special} label={t('members.passwordSpecial')} />
        </div>
      )}
    </VStack>
  )
}

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <HStack gap={1.5} vAlign="center">
      {met ? <Check size={14} aria-hidden="true" /> : <Circle size={10} aria-hidden="true" />}
      <Text type="supporting" color={met ? 'primary' : 'secondary'}>
        {label}
      </Text>
    </HStack>
  )
}
