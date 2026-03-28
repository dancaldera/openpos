import { useState } from 'preact/hooks'
import { useTranslation } from '../../hooks/useTranslation'
import { clsx } from '../../lib/utils'
import { Input } from './Input'
import { EyeIcon, EyeOffIcon } from './icons'

interface PasswordStrength {
  hasMinLength: boolean
  hasUppercase: boolean
  hasLowercase: boolean
  hasNumber: boolean
  hasSpecial: boolean
}

function checkPasswordStrength(password: string): PasswordStrength {
  return {
    hasMinLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  }
}

function isPasswordValid(strength: PasswordStrength): boolean {
  return (
    strength.hasMinLength && strength.hasUppercase && strength.hasLowercase && strength.hasNumber && strength.hasSpecial
  )
}

interface PasswordInputProps {
  label?: string
  value: string
  onInput: (e: Event) => void
  required?: boolean
  placeholder?: string
  disabled?: boolean
  showStrength?: boolean
  error?: string
  helperText?: string
}

function RequirementItem({ met, text }: { met: boolean; text: string }) {
  return (
    <li class={clsx('flex items-center gap-1.5 text-xs', met ? 'text-green-600' : 'text-gray-400')}>
      <span class={clsx('text-sm', met ? 'opacity-100' : 'opacity-50')}>{met ? '✓' : '○'}</span>
      <span>{text}</span>
    </li>
  )
}

export function PasswordInput({
  label,
  value,
  onInput,
  required = false,
  placeholder,
  disabled = false,
  showStrength = false,
  error,
  helperText,
}: PasswordInputProps) {
  const { t } = useTranslation()
  const [showPassword, setShowPassword] = useState(false)

  const strength = checkPasswordStrength(value)
  const isValid = isPasswordValid(strength)

  const eyeIcon = showPassword ? (
    <EyeOffIcon aria-label={t('auth.hidePassword')} />
  ) : (
    <EyeIcon aria-label={t('auth.showPassword')} />
  )

  return (
    <div class="w-full">
      <Input
        label={label}
        type={showPassword ? 'text' : 'password'}
        value={value}
        onInput={onInput}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        error={error}
        helperText={!showStrength ? helperText : undefined}
        rightIcon={eyeIcon}
        onRightIconClick={() => setShowPassword(!showPassword)}
      />

      {showStrength && (
        <div class="mt-2">
          <ul class="grid grid-cols-2 gap-x-3 gap-y-1">
            <RequirementItem met={strength.hasMinLength} text={t('members.passwordMinLength')} />
            <RequirementItem met={strength.hasUppercase} text={t('members.passwordUppercase')} />
            <RequirementItem met={strength.hasLowercase} text={t('members.passwordLowercase')} />
            <RequirementItem met={strength.hasNumber} text={t('members.passwordNumber')} />
            <RequirementItem met={strength.hasSpecial} text={t('members.passwordSpecial')} />
          </ul>
          {value && !isValid && <p class="text-xs text-amber-600 mt-2">{t('members.passwordRequirementsHint')}</p>}
          {value && isValid && <p class="text-xs text-green-600 mt-2">{t('members.passwordValid')}</p>}
        </div>
      )}
    </div>
  )
}
