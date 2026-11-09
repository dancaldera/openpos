import { Avatar } from '@astryxdesign/core/Avatar'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Mail } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { AccessScreen } from '../components/access/AccessScreen'
import { ForgotPasswordForm } from '../components/access/ForgotPasswordForm'
import { MemberPicker } from '../components/access/MemberPicker'
import { PasswordField } from '../components/access/PasswordField'
import { PinKeypad } from '../components/access/PinKeypad'
import { ResetSettingsForm } from '../components/access/ResetSettingsForm'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { APP_VERSION } from '../lib/app-version'
import { isDesktop } from '../lib/platform'
import { toast } from '../lib/toast'
import { authService, type User } from '../services/auth-turso'

const PIN_LENGTH = 6
const RELEASES_URL = 'https://releases.pos.softmelody.dev/releases/latest.json'
const CONTACT_URL = 'https://wa.me/523322633323'
const CONTACT_PHONE = '+52 332 263 3323'
const DEMO_HOST = 'demo.pos.softmelody.dev'

type View = 'signIn' | 'forgotPassword' | 'resetSettings'
type Mode = 'pin' | 'email'

function digitsOnly(value: string, max = PIN_LENGTH): string {
  return value.replace(/\D/g, '').slice(0, max)
}

export default function SignIn() {
  const { t } = useTranslation()
  const { signIn, signInWithPin } = useAuth()

  const [view, setView] = useState<View>('signIn')
  const [mode, setMode] = useState<Mode>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pinUsers, setPinUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [isPinInitLoading, setIsPinInitLoading] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pinSubmitLock = useRef(false)
  const isDemoHost = typeof window !== 'undefined' && window.location.hostname === DEMO_HOST

  useEffect(() => {
    let cancelled = false
    setIsPinInitLoading(true)
    authService
      .getAllUsersForLogin()
      .then((users) => {
        if (cancelled) return
        const withPin = users.filter((member) => member.pinEnabled)
        setPinUsers(withPin)
        if (withPin.length > 0) setMode('pin')
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setIsPinInitLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const changeMode = (next: Mode) => {
    setMode(next)
    setSelectedUser(null)
    setPin('')
    setError(null)
  }

  const fillDemo = () => {
    changeMode('email')
    setView('signIn')
    setEmail('manager@openpos.xyz')
    setPassword('Manager123!')
  }

  const handlePinSubmit = async (member: User, nextPin: string) => {
    if (pinSubmitLock.current) return
    pinSubmitLock.current = true
    setIsLoading(true)
    setError(null)
    try {
      const result = await signInWithPin(member.id, nextPin)
      if (!result.success) {
        setError(result.error || t('auth.invalidPin'))
        setPin('')
      } else if (result.warning) {
        toast.warning(result.warning)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.signInFailed'))
      setPin('')
    } finally {
      pinSubmitLock.current = false
      setIsLoading(false)
    }
  }

  const appendPinDigit = (digit: string) => {
    if (isLoading || !selectedUser) return
    const nextPin = digitsOnly(`${pin}${digit}`)
    setPin(nextPin)
    setError(null)
    if (nextPin.length === PIN_LENGTH) void handlePinSubmit(selectedUser, nextPin)
  }

  const handleEmailSubmit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (isLoading) return
    if (!email || !password) {
      setError(t('auth.fillAllFields'))
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const result = await signIn(email, password)
      if (!result.success) {
        setError(result.error || t('auth.signInFailed'))
      } else if (result.warning) {
        toast.warning(result.warning)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.signInFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  const footer = [
    <Link
      key="version"
      href={RELEASES_URL}
      target="_blank"
      size="sm"
      color="secondary"
      tooltip={t('auth.viewLatestRelease')}
    >
      {`v${APP_VERSION}`}
    </Link>,
    <Link key="contact" href={CONTACT_URL} target="_blank" size="sm" color="secondary" tooltip={CONTACT_PHONE}>
      {t('auth.contact')}
    </Link>,
    isDemoHost && <Button key="demo" label={t('auth.useDemoAccount')} variant="ghost" size="sm" onClick={fillDemo} />,
    isDesktop && view === 'signIn' && (
      <Button
        key="reset"
        label={t('auth.resetSettings')}
        variant="ghost"
        size="sm"
        isDisabled={isLoading}
        onClick={() => {
          setError(null)
          setView('resetSettings')
        }}
      />
    ),
  ]

  if (view === 'forgotPassword') {
    return (
      <AccessScreen title={t('auth.recovery.title')} description={t('auth.recovery.description')} footer={footer}>
        <ForgotPasswordForm initialEmail={email} onDone={() => setView('signIn')} onCancel={() => setView('signIn')} />
      </AccessScreen>
    )
  }

  if (view === 'resetSettings') {
    return (
      <AccessScreen title={t('auth.resetSettings')} description={t('auth.resetSettingsDesc')} footer={footer}>
        <ResetSettingsForm onCancel={() => setView('signIn')} />
      </AccessScreen>
    )
  }

  const description = isPinInitLoading
    ? undefined
    : mode === 'pin' && selectedUser
      ? t('auth.signingInAs', { name: selectedUser.name })
      : mode === 'pin'
        ? t('auth.selectMember')
        : t('auth.signInToAccount')

  return (
    <AccessScreen title={t('auth.signIn')} description={description} footer={footer} hasSyncStatus>
      {isPinInitLoading ? (
        <div className="flex min-h-40 items-center justify-center">
          <Spinner size="lg" aria-label={t('common.loading')} />
        </div>
      ) : (
        <VStack gap={5}>
          {pinUsers.length > 0 && (
            <SegmentedControl
              label={t('auth.signInMethod')}
              value={mode}
              onChange={(value) => changeMode(value as Mode)}
              layout="fill"
              isDisabled={isLoading}
            >
              <SegmentedControlItem value="pin" label={t('auth.modePin')} />
              <SegmentedControlItem value="email" label={t('auth.modeEmail')} />
            </SegmentedControl>
          )}

          {error && <Banner status="error" title={error} />}

          {mode === 'pin' && !selectedUser && (
            <MemberPicker
              users={pinUsers}
              isDisabled={isLoading}
              onSelect={(member) => {
                setSelectedUser(member)
                setPin('')
                setError(null)
              }}
            />
          )}

          {mode === 'pin' && selectedUser && (
            <VStack gap={4}>
              <HStack gap={3} vAlign="center">
                <Avatar name={selectedUser.name} size="md" tooltip={false} />
                <StackItem size="fill">
                  <VStack gap={0}>
                    <Text weight="semibold" maxLines={1}>
                      {selectedUser.name}
                    </Text>
                    <Text type="supporting">{t(`members.${selectedUser.role}`)}</Text>
                  </VStack>
                </StackItem>
                <Button
                  label={t('auth.switchMember')}
                  variant="ghost"
                  size="sm"
                  isDisabled={isLoading}
                  onClick={() => {
                    setSelectedUser(null)
                    setPin('')
                    setError(null)
                  }}
                />
              </HStack>
              <TextInput
                label={t('auth.enter6digitPin')}
                type="password"
                value={pin}
                isReadOnly
                isLoading={isLoading}
                size="lg"
                placeholder={t('auth.pinPlaceholder')}
              />
              <PinKeypad
                isDisabled={isLoading}
                onDigit={appendPinDigit}
                onBackspace={() => {
                  if (!isLoading) setPin((current) => current.slice(0, -1))
                }}
              />
            </VStack>
          )}

          {mode === 'email' && (
            <form onSubmit={(event) => void handleEmailSubmit(event)} noValidate>
              <VStack gap={4}>
                <TextInput
                  label={t('auth.email')}
                  type="email"
                  value={email}
                  onChange={(value) => {
                    setEmail(value)
                    setError(null)
                  }}
                  placeholder="email@example.com"
                  startIcon={Mail}
                  autoComplete="email"
                  isDisabled={isLoading}
                  isRequired
                  hasAutoFocus
                />
                <VStack gap={1}>
                  <PasswordField
                    label={t('auth.password')}
                    value={password}
                    onChange={(value) => {
                      setPassword(value)
                      setError(null)
                    }}
                    autoComplete="current-password"
                    isDisabled={isLoading}
                    isRequired
                  />
                  <HStack hAlign="end">
                    <Button
                      label={t('auth.forgotPassword')}
                      variant="ghost"
                      size="sm"
                      isDisabled={isLoading}
                      onClick={() => {
                        setError(null)
                        setView('forgotPassword')
                      }}
                    />
                  </HStack>
                </VStack>
                <Button
                  label={t('auth.signIn')}
                  type="submit"
                  variant="primary"
                  size="lg"
                  width="100%"
                  isLoading={isLoading}
                  isDisabled={!email || !password}
                />
              </VStack>
            </form>
          )}
        </VStack>
      )}
    </AccessScreen>
  )
}
