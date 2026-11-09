import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Switch } from '@astryxdesign/core/Switch'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { validatePasswordStrength, validatePin } from '@openpos/domain'
import { Check, Circle } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { Page } from '../../components/page/Page'
import { useTranslation } from '../../hooks/useTranslation'
import { hrefFor, navigate } from '../../lib/router'
import { toast } from '../../lib/toast'
import { authService, type User } from '../../services/auth-turso'
import { type MemberRole, roleAccessLabel, roleLabel, useMemberAccess } from './memberAccess'
import { PinKeypad } from './PinKeypad'
import { useMember } from './useMember'

interface MemberFormData {
  name: string
  email: string
  role: MemberRole
  password: string
  pinEnabled: boolean
  pin: string
  pinConfirm: string
}

type MemberField = 'name' | 'email' | 'password' | 'pin' | 'pinConfirm'

const EMPTY_FORM: MemberFormData = {
  name: '',
  email: '',
  role: 'user',
  password: '',
  pinEnabled: false,
  pin: '',
  pinConfirm: '',
}

const PIN_LENGTH = 6

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').slice(0, PIN_LENGTH)
}

function formFromMember(member: User): MemberFormData {
  return {
    ...EMPTY_FORM,
    name: member.name,
    email: member.email,
    role: member.role,
    pinEnabled: Boolean(member.pinEnabled),
  }
}

/** Mirrors `validatePasswordStrength` from `@openpos/domain` rule by rule for the live checklist. */
const PASSWORD_RULES: Array<{ key: string; test: (value: string) => boolean }> = [
  { key: 'members.passwordMinLength', test: (value) => value.length >= 8 },
  { key: 'members.passwordUppercase', test: (value) => /[A-Z]/.test(value) },
  { key: 'members.passwordLowercase', test: (value) => /[a-z]/.test(value) },
  { key: 'members.passwordNumber', test: (value) => /[0-9]/.test(value) },
  { key: 'members.passwordSpecial', test: (value) => /[^A-Za-z0-9]/.test(value) },
]

interface MemberFormPageProps {
  /** Member to edit; omit to create a new one. */
  memberId?: string
}

export default function MemberFormPage({ memberId }: MemberFormPageProps) {
  if (memberId) return <EditMember memberId={memberId} />
  return <MemberForm member={null} />
}

function EditMember({ memberId }: { memberId: string }) {
  const { member, isLoading } = useMember(memberId)
  if (isLoading) return <MemberForm member={null} memberId={memberId} isLoading />
  return <MemberForm member={member} memberId={memberId} />
}

interface MemberFormProps {
  member: User | null
  memberId?: string
  isLoading?: boolean
}

function MemberForm({ member, memberId, isLoading = false }: MemberFormProps) {
  const { t } = useTranslation()
  const access = useMemberAccess()
  const isEditing = Boolean(memberId)
  const initial = member ? formFromMember(member) : EMPTY_FORM
  const [formData, setFormData] = useState<MemberFormData>(initial)
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(initial))
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState<{ field: MemberField; message: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const next = member ? formFromMember(member) : EMPTY_FORM
    setFormData(next)
    setSavedSnapshot(JSON.stringify(next))
  }, [member])

  const isDirty = JSON.stringify(formData) !== savedSnapshot
  const backTo = memberId ? `members/${memberId}` : 'members'
  const canEditPin = access.canEditPin(member)
  const showPasswordField = !isEditing || access.canResetPassword
  const isSelf = Boolean(member && member.id === access.currentUserId)
  const keepsExistingPin = Boolean(member?.pinEnabled)

  const update = <K extends keyof MemberFormData>(key: K, value: MemberFormData[K]) => {
    setFormData((previous) => ({ ...previous, [key]: value }))
    if (fieldError?.field === key) setFieldError(null)
  }

  const statusFor = (field: MemberField) =>
    fieldError?.field === field ? { type: 'error' as const, message: fieldError.message } : undefined

  const fail = (field: MemberField, message: string) => {
    setFieldError({ field, message })
    setError(message)
  }

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    setError('')
    setFieldError(null)

    if (!formData.name.trim()) return fail('name', t('members.nameRequired'))
    if (!formData.email.trim()) return fail('email', t('members.emailRequired'))
    const passwordToSend = showPasswordField && formData.password ? formData.password : ''
    if (!isEditing && !formData.password) return fail('password', t('members.passwordRequired'))
    if (passwordToSend && validatePasswordStrength(passwordToSend)) {
      return fail('password', t('members.passwordRequirementsHint'))
    }

    let pinEnabled: boolean | undefined
    let pin: string | undefined
    if (canEditPin) {
      if (formData.pinEnabled) {
        const settingNewPin = formData.pin.length > 0 || formData.pinConfirm.length > 0 || !member?.pinEnabled
        if (settingNewPin) {
          if (formData.pin !== formData.pinConfirm) return fail('pinConfirm', t('members.pinMismatch'))
          if (validatePin(formData.pin)) return fail('pin', t('members.pinRequired'))
          pinEnabled = true
          pin = formData.pin
        } else {
          pinEnabled = true
        }
      } else if (member?.pinEnabled) {
        pinEnabled = false
      }
    }

    setIsSaving(true)
    try {
      let result: { success: boolean; user?: User; error?: string }
      if (member) {
        const updates: {
          name: string
          email: string
          role: MemberRole
          password?: string
          pinEnabled?: boolean
          pin?: string
        } = { name: formData.name, email: formData.email, role: formData.role }
        // Only admins can reset another member's password.
        if (passwordToSend && access.canResetPassword) updates.password = passwordToSend
        if (pinEnabled !== undefined) updates.pinEnabled = pinEnabled
        if (pin) updates.pin = pin
        result = await authService.updateUser(member.id, updates)
      } else {
        result = await authService.createUser({
          name: formData.name,
          email: formData.email,
          role: formData.role,
          password: formData.password,
          pinEnabled,
          pin,
        })
      }

      if (result.success && result.user) {
        toast.success(member ? t('members.userUpdated') : t('members.userCreated'))
        setSavedSnapshot(JSON.stringify(formData))
        navigate(`members/${result.user.id}`)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch {
      setError(t('errors.generic'))
    } finally {
      setIsSaving(false)
    }
  }

  const leave = () => {
    if (isSaving) return
    if (isDirty && !isConfirmingDiscard) {
      setIsConfirmingDiscard(true)
      return
    }
    navigate(backTo)
  }

  const pressDigit = (digit: string) => {
    setFormData((current) =>
      current.pin.length < PIN_LENGTH
        ? { ...current, pin: digitsOnly(`${current.pin}${digit}`) }
        : { ...current, pinConfirm: digitsOnly(`${current.pinConfirm}${digit}`) },
    )
  }

  const pressBackspace = () => {
    setFormData((current) =>
      current.pinConfirm.length > 0
        ? { ...current, pinConfirm: current.pinConfirm.slice(0, -1) }
        : { ...current, pin: current.pin.slice(0, -1) },
    )
  }

  const breadcrumbs = isEditing
    ? [
        { label: t('members.title'), to: 'members' },
        { label: member?.name || t('members.memberHeader'), to: backTo },
        { label: t('common.edit') },
      ]
    : [{ label: t('members.title'), to: 'members' }, { label: t('members.newMember') }]
  const title = isEditing ? t('members.editMemberTitle') : t('members.newMember')

  if (isLoading) {
    return (
      <Page title={title} breadcrumbs={breadcrumbs} width={720}>
        <HStack hAlign="center" padding={10}>
          <Spinner label={t('common.loading')} />
        </HStack>
      </Page>
    )
  }

  if (isEditing && !member) {
    return (
      <Page title={title} breadcrumbs={breadcrumbs} width={720}>
        <EmptyState
          title={t('members.notFoundTitle')}
          description={t('members.notFoundDescription')}
          actions={<Button label={t('members.backToMembers')} href={hrefFor('members')} />}
        />
      </Page>
    )
  }

  const isAllowed = member ? !member.deletedAt && access.canEdit(member) : access.canCreate
  if (!isAllowed) {
    return (
      <Page title={title} breadcrumbs={breadcrumbs} width={720}>
        <EmptyState
          title={t('members.cannotEditTitle')}
          description={member?.deletedAt ? t('members.cannotEditArchived') : t('members.cannotEditDescription')}
          actions={<Button label={t('members.backToMembers')} href={hrefFor(backTo)} />}
        />
      </Page>
    )
  }

  const saveLabel = isEditing ? t('members.saveChanges') : t('members.createMember')

  return (
    <Page
      title={title}
      description={t('members.formPageDescription')}
      breadcrumbs={breadcrumbs}
      width={720}
      actions={
        <>
          <Button label={t('common.cancel')} onClick={leave} isDisabled={isSaving} />
          <Button label={saveLabel} variant="primary" isLoading={isSaving} onClick={() => void save()} />
        </>
      }
    >
      {isConfirmingDiscard && (
        <Banner
          status="warning"
          title={t('members.unsavedChangesTitle')}
          description={t('members.unsavedChangesMessage')}
          collapsible={false}
          endContent={
            <HStack gap={2}>
              <Button label={t('members.keepEditing')} size="sm" onClick={() => setIsConfirmingDiscard(false)} />
              <Button
                label={t('members.discardChanges')}
                size="sm"
                variant="destructive"
                onClick={() => navigate(backTo)}
              />
            </HStack>
          }
        />
      )}
      {error && (
        <Banner
          status="error"
          title={t('members.saveFailed')}
          description={error}
          collapsible={false}
          isDismissable
          onDismiss={() => setError('')}
        />
      )}

      <form onSubmit={(event) => void save(event)} noValidate>
        <VStack gap={6}>
          <FormSection title={t('members.profileSection')}>
            <TextInput
              label={t('members.fullName')}
              value={formData.name}
              onChange={(value) => update('name', value)}
              isRequired
              autoComplete="off"
              placeholder={t('members.enterFullName')}
              status={statusFor('name')}
            />
            <TextInput
              label={t('members.emailAddress')}
              type="email"
              value={formData.email}
              onChange={(value) => update('email', value)}
              isRequired
              autoComplete="off"
              placeholder={t('members.enterEmail')}
              status={statusFor('email')}
            />
            <Selector
              label={t('members.role')}
              description={t('members.roleHint')}
              value={formData.role}
              onChange={(value) => update('role', value as MemberRole)}
              isDisabled={isSelf}
              disabledMessage={isSelf ? t('members.ownRoleLocked') : undefined}
              options={access.roleOptions.map((role) => ({
                value: role,
                label: roleLabel(role, t),
                description: roleAccessLabel(role, t),
              }))}
              width="100%"
            />
          </FormSection>

          {showPasswordField && (
            <FormSection
              title={isEditing ? t('members.resetPasswordSection') : t('members.passwordSection')}
              description={isEditing ? t('members.passwordResetHint') : t('members.passwordSectionHint')}
            >
              <TextInput
                label={isEditing ? t('members.newPassword') : t('auth.password')}
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(value) => update('password', value)}
                isRequired={!isEditing}
                isOptional={isEditing}
                autoComplete="new-password"
                placeholder={isEditing ? t('members.leaveBlankKeepCurrent') : t('members.enterNewPassword')}
                status={statusFor('password')}
              />
              <CheckboxInput label={t('auth.showPassword')} size="sm" value={showPassword} onChange={setShowPassword} />
              {(!isEditing || formData.password.length > 0) && (
                <Grid columns={{ minWidth: 200, max: 3 }} gap={2}>
                  {PASSWORD_RULES.map((rule) => {
                    const isMet = rule.test(formData.password)
                    return (
                      <HStack key={rule.key} gap={2} vAlign="center">
                        {isMet ? <Check size={14} aria-hidden /> : <Circle size={14} aria-hidden />}
                        <Text type="supporting" color={isMet ? 'primary' : 'secondary'}>
                          {t(rule.key)}
                        </Text>
                      </HStack>
                    )
                  })}
                </Grid>
              )}
            </FormSection>
          )}

          {canEditPin && (
            <FormSection title={t('members.pinSection')} description={t('members.enablePinHint')}>
              <Switch
                label={t('members.enablePin')}
                value={formData.pinEnabled}
                onChange={(checked) =>
                  setFormData((previous) => ({ ...previous, pinEnabled: checked, pin: '', pinConfirm: '' }))
                }
                isDisabled={isSaving}
              />
              {formData.pinEnabled && (
                <VStack gap={4}>
                  <Grid columns={{ minWidth: 200, max: 2 }} gap={4}>
                    <TextInput
                      label={t('members.pin')}
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      value={formData.pin}
                      onChange={(value) => update('pin', digitsOnly(value))}
                      isRequired={!keepsExistingPin}
                      isOptional={keepsExistingPin}
                      description={keepsExistingPin ? t('members.leaveBlankKeepPin') : undefined}
                      placeholder={t('members.pinPlaceholder')}
                      status={statusFor('pin')}
                    />
                    <TextInput
                      label={t('members.confirmPin')}
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      value={formData.pinConfirm}
                      onChange={(value) => update('pinConfirm', digitsOnly(value))}
                      isRequired={!keepsExistingPin || formData.pin.length > 0}
                      isOptional={keepsExistingPin && formData.pin.length === 0}
                      placeholder={t('members.pinPlaceholder')}
                      status={statusFor('pinConfirm')}
                    />
                  </Grid>
                  <PinKeypad
                    onDigit={pressDigit}
                    onBackspace={pressBackspace}
                    onClear={() => setFormData((previous) => ({ ...previous, pin: '', pinConfirm: '' }))}
                    clearLabel={t('common.clear')}
                    backspaceLabel={t('members.deleteDigit')}
                    isDisabled={isSaving}
                  />
                </VStack>
              )}
            </FormSection>
          )}

          <HStack gap={2} hAlign="end">
            <Button label={t('common.cancel')} onClick={leave} isDisabled={isSaving} />
            <Button label={saveLabel} variant="primary" type="submit" isLoading={isSaving} />
          </HStack>
        </VStack>
      </form>
    </Page>
  )
}

function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <VStack gap={3}>
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        {description && <Text type="supporting">{description}</Text>}
      </VStack>
      <Card>
        <FormLayout defaultOptionality="optional">{children}</FormLayout>
      </Card>
    </VStack>
  )
}
