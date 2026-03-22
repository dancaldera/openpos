import { useState } from 'preact/hooks'

import { useTranslation } from '../../hooks/useTranslation'

import { Input } from './Input'

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
    <li class={`flex items-center gap-1.5 text-xs ${met ? 'text-green-600' : 'text-gray-400'}`}>
      <span class={`text-sm ${met ? 'opacity-100' : 'opacity-50'}`}>{met ? '✓' : '○'}</span>
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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      role="img"
      aria-label={t('auth.hidePassword')}
    >
      <title>{t('auth.hidePassword')}</title>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      role="img"
      aria-label={t('auth.showPassword')}
    >
      <title>{t('auth.showPassword')}</title>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
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
