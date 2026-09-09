import { useEffect, useRef, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { ForgotPasswordDialog } from '../components/ForgotPasswordDialog'
import { Button } from '../components/ui/Button'
import { DbStatusBadge } from '../components/ui/DbStatusBadge'
import { Dialog } from '../components/ui/Dialog'
import { Form } from '../components/ui/Form'
import { Input } from '../components/ui/Input'
import { CloseIcon, MailIcon, SearchIcon, SpinnerIcon, WhatsAppIcon } from '../components/ui/icons'
import { PasswordInput } from '../components/ui/PasswordInput'
import { UpdateBadge } from '../components/ui/UpdateBadge'
import { VirtualKeypad } from '../components/ui/VirtualKeypad'
import { useAuth } from '../hooks/useAuth'
import { usePlatform } from '../hooks/usePlatform'
import { useTranslation } from '../hooks/useTranslation'
import { APP_VERSION } from '../lib/app-version'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'
import { authService, type User } from '../services/auth-turso'
import { appSettingsStore } from '../stores/appSettings/appSettingsStore'

function digitsOnly(value: string, max = 6): string {
  return value.replace(/\D/g, '').slice(0, max)
}

export default function SignIn() {
  const { t } = useTranslation()
  const { signIn, signInWithPin } = useAuth()
  const { appName } = appSettingsStore
  const { isMac } = usePlatform()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isDemoHost, setIsDemoHost] = useState(false)
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false)
  const [isResetSettingsOpen, setIsResetSettingsOpen] = useState(false)
  const [resetKey, setResetKey] = useState('')
  const [mode, setMode] = useState<'pin' | 'email'>('email')
  const [pinUsers, setPinUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isPinInitLoading, setIsPinInitLoading] = useState(true)
  const pinSubmitLock = useRef(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filteredUsers = pinUsers.filter((member) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return member.name.toLowerCase().includes(q) || member.role.toLowerCase().includes(q)
  })

  useEffect(() => {
    setIsDemoHost(window.location.hostname === 'demo.openpos.xyz')
  }, [])

  useEffect(() => {
    let cancelled = false
    setIsPinInitLoading(true)
    void authService
      .getAllUsersForLogin()
      .then((users) => {
        if (cancelled) return
        const withPin = users.filter((member) => member.pinEnabled)
        setPinUsers(withPin)
        if (withPin.length > 0) {
          setMode('pin')
        }
      })
      .catch(() => {
        if (cancelled) return
      })
      .finally(() => {
        if (!cancelled) setIsPinInitLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (mode === 'pin' && !selectedUser && !isPinInitLoading && pinUsers.length > 0) {
      searchInputRef.current?.focus()
    }
  }, [mode, selectedUser, isPinInitLoading, pinUsers.length])

  const fillDemo = () => {
    setMode('email')
    setSelectedUser(null)
    setPin('')
    setEmail('manager@openpos.xyz')
    setPassword('Manager123!')
  }

  const handleResetSettings = async () => {
    if (!resetKey) {
      toast.error(t('auth.resetSettingsKeyRequired'))
      return
    }

    try {
      await requireDesktopApi().resetSettings(resetKey)
      toast.success(t('auth.resetSettingsSuccess'))
      setIsResetSettingsOpen(false)
      setResetKey('')
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth.resetSettingsFailed'))
    }
  }

  const [isLoading, setIsLoading] = useState(false)

  const handlePinSubmit = async (member: User, nextPin: string) => {
    if (pinSubmitLock.current) return
    pinSubmitLock.current = true
    setIsLoading(true)
    try {
      const result = await signInWithPin(member.id, nextPin)
      if (!result.success) {
        toast.error(result.error || t('auth.invalidPin'))
        setPin('')
      } else if (result.warning) {
        toast.warning(result.warning)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth.signInFailed'))
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
    if (nextPin.length === 6) {
      void handlePinSubmit(selectedUser, nextPin)
    }
  }

  const handleSubmit = async () => {
    if (!email || !password) {
      toast.error(t('auth.fillAllFields'))
      return
    }

    setIsLoading(true)
    try {
      const result = await signIn(email, password)
      if (!result.success) {
        toast.error(result.error || t('auth.signInFailed'))
      } else if (result.warning) {
        toast.warning(result.warning)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth.signInFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div class="drag-region signin-page min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div class="signin-glow signin-glow--cyan" aria-hidden="true" />
      <div class="signin-glow signin-glow--violet" aria-hidden="true" />
      <svg
        class="signin-waves absolute inset-0 pointer-events-none"
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="signin-wave-back" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style="stop-color: var(--signin-wave-back-from)" stop-opacity="0.08" />
            <stop offset="0.55" style="stop-color: var(--signin-wave-back-mid)" stop-opacity="0.16" />
            <stop offset="1" style="stop-color: var(--signin-wave-back-to)" stop-opacity="0.1" />
          </linearGradient>
          <linearGradient id="signin-wave-middle" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style="stop-color: var(--signin-wave-middle-from)" stop-opacity="0.16" />
            <stop offset="0.5" style="stop-color: var(--signin-wave-middle-mid)" stop-opacity="0.08" />
            <stop offset="1" style="stop-color: var(--signin-wave-middle-to)" stop-opacity="0.14" />
          </linearGradient>
          <linearGradient id="signin-wave-front" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style="stop-color: var(--signin-wave-front-from)" stop-opacity="0.08" />
            <stop offset="0.5" style="stop-color: var(--signin-wave-front-mid)" stop-opacity="0.16" />
            <stop offset="1" style="stop-color: var(--signin-wave-front-to)" stop-opacity="0.08" />
          </linearGradient>
        </defs>

        <g class="signin-wave signin-wave--back">
          <path
            fill="url(#signin-wave-back)"
            d="M-100 620C140 460 330 520 570 650s420 150 650-30 360-180 580-40v420H-100Z"
          />
        </g>
        <g class="signin-wave signin-wave--middle">
          <path
            fill="url(#signin-wave-middle)"
            d="M-100 760c220-180 430-230 680-90s420 120 610-40 280-150 510-20v330H-100Z"
          />
        </g>
        <g class="signin-wave signin-wave--front">
          <path
            fill="url(#signin-wave-front)"
            d="M-100 875c220-150 410-170 625-70s410 100 585-25 320-110 590 10v150H-100Z"
          />
        </g>
      </svg>
      <div class="signin-vignette absolute inset-0 pointer-events-none" aria-hidden="true" />

      {/* Grabbable zone at top for macOS traffic lights */}
      {isMac && <div class="drag-region absolute top-0 left-0 right-0 h-10 z-20" />}

      <div class="no-drag w-full relative z-10 max-w-md">
        <div class="bg-canvas backdrop-blur-xl rounded-cards shadow-sm border border-fog-border p-8 min-h-[540px] flex flex-col">
          <div class="text-center mb-7">
            <h1 class="text-xl font-semibold text-void ">{appName.value}</h1>
            <p class="text-sm text-graphite mt-1">
              {isPinInitLoading
                ? '\u00A0'
                : mode === 'pin' && selectedUser
                  ? t('auth.signingInAs', { name: selectedUser.name })
                  : mode === 'pin'
                    ? t('auth.selectMember')
                    : t('auth.signInToAccount')}
            </p>
          </div>

          <div class="flex-1 flex flex-col justify-start min-h-[380px]">
            {isPinInitLoading ? (
              <div class="flex flex-1 items-center justify-center">
                <SpinnerIcon class="h-6 w-6 animate-spin text-graphite" aria-hidden="true" />
              </div>
            ) : (
              <>
                {mode === 'pin' && !selectedUser && (
                  <div>
                    {pinUsers.length > 0 && (
                      <div class="relative mb-3">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <SearchIcon class="h-4 w-4 text-graphite" />
                        </div>
                        <input
                          type="search"
                          value={searchQuery}
                          onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                          placeholder={t('auth.searchMembers')}
                          ref={searchInputRef}
                          class="w-full rounded-input border border-fog-border bg-canvas pl-9 pr-9 py-2.5 text-sm text-void placeholder:text-graphite focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            class="absolute inset-y-0 right-0 pr-3 flex items-center text-graphite hover:text-void cursor-pointer"
                            aria-label={t('common.clear')}
                          >
                            <CloseIcon class="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                    <div class="max-h-72 space-y-2 overflow-y-auto">
                      {pinUsers.length === 0 ? (
                        <p class="text-sm text-center text-graphite">{t('auth.noAccountsAvailable')}</p>
                      ) : filteredUsers.length === 0 ? (
                        <p class="text-sm text-center text-graphite">{t('auth.noMembersFound')}</p>
                      ) : (
                        filteredUsers.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            disabled={isLoading}
                            onClick={() => {
                              setSelectedUser(member)
                              setSearchQuery('')
                              setPin('')
                            }}
                            class="flex w-full min-h-14 items-center gap-3 rounded-cards border border-fog-border bg-canvas px-3 py-3 text-left transition-colors hover:bg-chalk cursor-pointer disabled:opacity-50"
                          >
                            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chalk text-lg font-semibold text-void">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div class="min-w-0">
                              <div class="truncate font-semibold text-void">{member.name}</div>
                              <div class="text-xs capitalize text-graphite">{member.role}</div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {mode === 'pin' && selectedUser && (
                  <div>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => {
                        setSelectedUser(null)
                        setSearchQuery('')
                        setPin('')
                      }}
                      class="mb-2 text-xs text-graphite hover:text-void underline underline-offset-4 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('common.back')}
                    </button>
                    <p class="sr-only">{t('auth.enter6digitPin')}</p>
                    <div class="my-5 flex justify-center gap-3" aria-hidden="true">
                      {Array.from({ length: 6 }, (_, index) => (
                        <span
                          key={index}
                          class={`h-3.5 w-3.5 rounded-full transition-colors ${pin.length > index ? 'bg-void' : 'border border-fog-border bg-chalk'}`}
                        />
                      ))}
                    </div>
                    <VirtualKeypad
                      size="large"
                      disabled={isLoading}
                      onDigitPress={appendPinDigit}
                      onBackspace={() => {
                        if (!isLoading) setPin((current) => current.slice(0, -1))
                      }}
                    />
                    <div class="mt-4 flex h-6 items-center justify-center text-sm text-graphite" aria-live="polite">
                      <span
                        class={`flex items-center gap-2 transition-opacity ${isLoading ? 'opacity-100' : 'opacity-0'}`}
                      >
                        <SpinnerIcon class="h-4 w-4 animate-spin" aria-hidden="true" />
                        {t('common.loading')}
                      </span>
                    </div>
                  </div>
                )}

                {mode === 'email' && (
                  <Form onSubmit={handleSubmit} spacing="md">
                    <Input
                      label={t('auth.email')}
                      type="email"
                      value={email}
                      onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                      placeholder="email@example.com"
                      disabled={isLoading}
                      required
                      leftIcon={<MailIcon />}
                      autocomplete="email"
                      autoFocus
                    />

                    <PasswordInput
                      label={t('auth.password')}
                      value={password}
                      onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                      placeholder="••••••••"
                      disabled={isLoading}
                      required
                      autoComplete="current-password"
                    />

                    <div class="flex justify-end -mt-1">
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => setIsForgotPasswordOpen(true)}
                        class="text-xs text-graphite hover:text-void underline underline-offset-4 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('auth.forgotPassword')}
                      </button>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      disabled={isLoading || !email || !password}
                      class="w-full mt-1"
                    >
                      {isLoading ? (
                        <>
                          <SpinnerIcon class="animate-spin h-4 w-4 mr-2" />
                          {t('common.loading')}
                        </>
                      ) : (
                        t('auth.signIn')
                      )}
                    </Button>
                  </Form>
                )}
              </>
            )}
          </div>
          <div class="mt-6 pt-5 border-t border-fog-border text-center">
            {pinUsers.length > 0 && !isPinInitLoading && (
              <div class="mb-3">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    if (mode === 'pin') {
                      setMode('email')
                      setSelectedUser(null)
                      setSearchQuery('')
                      setPin('')
                    } else {
                      setMode('pin')
                    }
                  }}
                  class="text-xs text-void underline underline-offset-4 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {mode === 'pin' ? t('auth.signInWithEmail') : t('auth.signInWithPin')}
                </button>
              </div>
            )}
            <span class="text-xs text-graphite inline-flex items-center gap-1 flex-wrap justify-center">
              <a
                href="https://releases.openpos.xyz/releases/latest.json"
                target="_blank"
                rel="noopener noreferrer"
                class="underline underline-offset-4 hover:text-graphite"
                title="View latest release"
              >
                v{APP_VERSION}
              </a>{' '}
              •{' '}
              <a
                href="https://wa.me/523322633323"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 cursor-pointer underline underline-offset-4 transition-colors hover:text-graphite"
                aria-label="Contact via WhatsApp +52 332 263 3323"
                title="Chat on WhatsApp — +52 332 263 3323 (tel fallback)"
                onClick={(e) => {
                  // Best-effort tel fallback: if wa.me doesn't handle (no WhatsApp), the browser stays — user can still call.
                  // No preventDefault, just hint for assistive tech.
                  void e
                }}
              >
                <WhatsAppIcon class="h-3 w-3 shrink-0" aria-hidden="true" />
                Contact
              </a>
              <a href="tel:+523322633323" class="sr-only" aria-hidden="false" tabIndex={-1}>
                +52 332 263 3323
              </a>
              {isDemoHost && (
                <>
                  {' '}
                  •{' '}
                  <button
                    type="button"
                    onClick={fillDemo}
                    class="text-xs text-void underline underline-offset-4 cursor-pointer"
                    title="Fill demo credentials"
                  >
                    demo
                  </button>
                </>
              )}
              {isDesktop && (
                <>
                  {' '}
                  •{' '}
                  <button
                    type="button"
                    onClick={() => setIsResetSettingsOpen(true)}
                    class="text-xs text-graphite underline underline-offset-4 hover:text-void cursor-pointer"
                  >
                    {t('auth.resetSettings')}
                  </button>
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      <div class="no-drag fixed bottom-4 left-4 z-50">
        <UpdateBadge placement="floating" />
      </div>
      <DbStatusBadge />

      <Dialog
        isOpen={isResetSettingsOpen}
        onClose={() => setIsResetSettingsOpen(false)}
        title={t('auth.resetSettings')}
        size="sm"
      >
        <p class="text-sm text-graphite mb-4">{t('auth.resetSettingsDesc')}</p>
        <Form onSubmit={handleResetSettings} spacing="md">
          <PasswordInput
            label={t('auth.resetSettingsKey')}
            value={resetKey}
            onInput={(e) => setResetKey((e.target as HTMLInputElement).value)}
            required
          />
          <div class="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsResetSettingsOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('auth.resetSettingsConfirm')}
            </Button>
          </div>
        </Form>
      </Dialog>

      <ForgotPasswordDialog
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
        initialEmail={email}
      />
    </div>
  )
}
