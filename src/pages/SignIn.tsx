import { useEffect, useRef, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { Button, Form } from '../components/ui'
import { VirtualKeypad } from '../components/ui/VirtualKeypad'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { authService, type User } from '../services/auth-sqlite'

export default function SignIn() {
  const { t } = useTranslation()
  const { signIn } = useAuth()

  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [password, setPassword] = useState('')
  const [pinDigits, setPinDigits] = useState(['', '', '', '', '', ''])
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loginInProgress, setLoginInProgress] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  // Load users on mount
  useEffect(() => {
    loadUsers()
  }, [])

  // Sync PIN digits with password state
  useEffect(() => {
    setPassword(pinDigits.join(''))
  }, [pinDigits])

  // Auto-login when 6 digits are entered and user is selected
  useEffect(() => {
    const pinValue = pinDigits.join('')
    const isComplete = pinDigits.every((d) => d !== '') && pinValue.length === 6

    // Only trigger if we have exactly 6 digits, user is selected, and not already processing
    if (isComplete && selectedUser && !isLoading && !loginInProgress) {
      // Prevent duplicate login attempts
      setLoginInProgress(true)

      // Brief delay to ensure UI feels responsive and capture stable state
      const timer = setTimeout(() => {
        // Final verification with current state
        const currentPin = pinDigits.join('')
        if (currentPin.length === 6 && selectedUser && !isLoading) {
          performLogin()
        } else {
          // Reset if state changed during delay (e.g., user deleted digits)
          setLoginInProgress(false)
        }
      }, 200)

      return () => {
        clearTimeout(timer)
        setLoginInProgress(false)
      }
    }
  }, [pinDigits, selectedUser, isLoading, loginInProgress])

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showDropdown])

  const loadUsers = async () => {
    try {
      const result = await authService.getAllUsersForLogin()
      setUsers(result)
    } catch (error) {
      // Silent fail - users list is optional
      console.error('Failed to load users:', error)
    }
  }

  const handlePinInput = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1)

    const newPinDigits = [...pinDigits]
    newPinDigits[index] = digit
    setPinDigits(newPinDigits)

    // Reset login progress if user is modifying PIN (except when completing to 6 digits)
    if (digit === '' || pinDigits.filter((d) => d !== '').length < 6) {
      setLoginInProgress(false)
    }

    // Auto-focus next input (but don't focus on the last input since auto-login will handle it)
    if (digit && index < 5) {
      pinInputRefs.current[index + 1]?.focus()
    }
  }

  const handlePinKeyDown = (index: number, e: KeyboardEvent) => {
    if (e.key === 'Backspace') {
      // Reset login progress when user deletes digits
      setLoginInProgress(false)

      if (!pinDigits[index] && index > 0) {
        // Move to previous input on backspace if current is empty
        pinInputRefs.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      pinInputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      pinInputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeypadDigitPress = (digit: string) => {
    // Reset login progress when modifying PIN
    setLoginInProgress(false)

    // Find the first empty input or replace the last digit if all are filled
    const emptyIndex = pinDigits.indexOf('')
    const targetIndex = emptyIndex !== -1 ? emptyIndex : 5

    const newPinDigits = [...pinDigits]
    newPinDigits[targetIndex] = digit
    setPinDigits(newPinDigits)

    // Focus the input we just filled
    pinInputRefs.current[targetIndex]?.focus()

    // Auto-advance to next input if not at the end
    if (targetIndex < 5) {
      setTimeout(() => {
        pinInputRefs.current[targetIndex + 1]?.focus()
      }, 50)
    }
  }

  const handleKeypadBackspace = () => {
    // Reset login progress when deleting
    setLoginInProgress(false)

    // Find the last filled input
    const lastFilledIndex = pinDigits
      .map((d, i) => ({ digit: d, index: i }))
      .filter((item) => item.digit !== '')
      .pop()?.index

    if (lastFilledIndex !== undefined) {
      const newPinDigits = [...pinDigits]
      newPinDigits[lastFilledIndex] = ''
      setPinDigits(newPinDigits)

      // Focus the input we just cleared
      pinInputRefs.current[lastFilledIndex]?.focus()
    }
  }

  const handlePinPaste = (e: ClipboardEvent) => {
    e.preventDefault()
    const pastedData = e.clipboardData?.getData('text') || ''
    const digits = pastedData.replace(/\D/g, '').slice(0, 6).split('')

    const newPinDigits = [...pinDigits]
    digits.forEach((digit, i) => {
      if (i < 6) {
        newPinDigits[i] = digit
      }
    })
    setPinDigits(newPinDigits)

    // Focus the next empty input or last input
    const nextEmptyIndex = newPinDigits.findIndex((d) => !d)
    if (nextEmptyIndex !== -1) {
      pinInputRefs.current[nextEmptyIndex]?.focus()
    } else {
      pinInputRefs.current[5]?.focus()
    }
  }

  const validateForm = (showValidationError = true) => {
    if (!selectedUser) {
      if (showValidationError) toast.error(t('auth.selectUserFirst'))
      return false
    }
    if (!password || password.length !== 6 || !/^\d{6}$/.test(password)) {
      if (showValidationError) toast.error(t('auth.password6digitsRequired'))
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!validateForm(true)) return

    await performLogin()
  }

  const performLogin = async () => {
    setIsLoading(true)

    try {
      if (!selectedUser) return
      const result = await signIn(selectedUser.email, password)

      if (result.success) {
        // Don't show success toast or reset loading - let the smooth transition happen
        // The app will automatically redirect to dashboard
      } else {
        // Keep selection/password on error, just show the error message
        setIsLoading(false)
        setLoginInProgress(false)
        toast.error(result.error || t('auth.signInFailed'))
      }
    } catch (error) {
      setIsLoading(false)
      setLoginInProgress(false)
      const message = error instanceof Error ? error.message : t('errors.generic')
      toast.error(message)
    }
  }

  const handleUserSelect = (user: User) => {
    setSelectedUser(user)
    setShowDropdown(false)
    // Reset login state when user changes
    setLoginInProgress(false)
    // Focus the first PIN input after selection
    setTimeout(() => {
      pinInputRefs.current[0]?.focus()
    }, 100)
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return '👑'
      case 'manager':
        return '👔'
      case 'user':
        return '👤'
      default:
        return '❓'
    }
  }

  return (
    <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div class="w-full max-w-md">
        <div class="bg-white rounded-lg shadow-lg p-8">
          {/* Logo and Title */}
          <div class="text-center mb-8">
            <h1 class="text-2xl font-bold text-gray-900">⚓ Titanic POS</h1>
            <p class="text-sm text-gray-600 mt-2">{t('auth.signInToAccount')}</p>
          </div>

          {/* Sign In Form */}
          <Form onSubmit={handleSubmit} spacing="lg">
            {/* User Selection */}
            <div>
              <h3 class="block text-sm font-medium text-gray-700 mb-2">{t('auth.selectUser')}</h3>

              {/* Selected User Display */}
              {selectedUser && (
                <div class="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
                  <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-semibold text-gray-900">{selectedUser.name}</div>
                    <div class="text-xs text-gray-600">{selectedUser.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(null)
                      setPinDigits(['', '', '', '', '', ''])
                    }}
                    class="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    {t('common.change')}
                  </button>
                </div>
              )}

              {/* Custom Beautiful Dropdown */}
              {!selectedUser && (
                <div class="relative" ref={dropdownRef}>
                  {/* Dropdown Button */}
                  <button
                    type="button"
                    onClick={() => setShowDropdown(!showDropdown)}
                    class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all bg-white text-gray-900 font-medium text-left flex items-center justify-between hover:border-gray-400"
                  >
                    <span class="text-gray-500">{t('auth.selectAccount')}</span>
                    <svg
                      class={`w-5 h-5 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <title>Dropdown arrow</title>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {showDropdown && (
                    <div class="absolute z-10 w-full mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
                      {users.length === 0 ? (
                        <div class="px-4 py-3 text-gray-500 text-center text-sm">{t('auth.noAccountsAvailable')}</div>
                      ) : (
                        users.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => handleUserSelect(user)}
                            class="w-full px-4 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                          >
                            {/* Avatar */}
                            <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                              {user.name.charAt(0).toUpperCase()}
                            </div>

                            {/* User Info */}
                            <div class="flex-1 text-left min-w-0">
                              <div class="font-semibold text-gray-900">{user.name}</div>
                              <div class="text-xs text-gray-600">{user.email}</div>
                            </div>

                            {/* Role Badge */}
                            <div
                              class={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${
                                user.role === 'admin'
                                  ? 'bg-red-100 text-red-700'
                                  : user.role === 'manager'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {getRoleIcon(user.role)} {user.role}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Password Field - Only show when user is selected */}
            {selectedUser && (
              <div>
                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <label htmlFor="pin-input-0" class="block text-sm font-medium text-gray-700">
                      {t('auth.password')}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      class="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                      aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    >
                      {showPassword ? `👁️ ${t('auth.hide')}` : `👁️‍🗨️ ${t('auth.show')}`}
                    </button>
                  </div>

                  {/* PIN Input Boxes */}
                  <div class="flex gap-1 justify-center" onPaste={handlePinPaste}>
                    {pinDigits.map((digit, index) => (
                      <input
                        key={`pin-position-${index + 1}`}
                        ref={(el) => {
                          pinInputRefs.current[index] = el
                        }}
                        type={showPassword ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onInput={(e) => handlePinInput(index, (e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => handlePinKeyDown(index, e as unknown as KeyboardEvent)}
                        class="w-8 h-10 text-center text-lg font-bold border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-200 focus:outline-none transition-all duration-200 bg-white hover:border-gray-400"
                        style={{
                          WebkitTextSecurity: showPassword ? 'none' : 'disc',
                        }}
                        aria-label={`PIN digit ${index + 1}`}
                        id={`pin-input-${index}`}
                      />
                    ))}
                  </div>

                  <p class="text-xs text-center text-gray-500 mt-2">{t('auth.enter6digitPin')}</p>
                </div>
              </div>
            )}

            {/* Virtual Keypad */}
            {selectedUser && (
              <VirtualKeypad
                onDigitPress={handleKeypadDigitPress}
                onBackspace={handleKeypadBackspace}
                disabled={isLoading || loginInProgress}
              />
            )}

            {/* Sign In Button - Only show when user is selected */}
            {selectedUser && (
              <div class="w-full text-center">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={isLoading || password.length !== 6}
                  class="w-full"
                >
                  {isLoading ? t('common.loading') : t('auth.signIn')}
                </Button>
              </div>
            )}
          </Form>

          {/* Footer */}
          <div class="mt-8 pt-6 border-t border-gray-200 text-center">
            <span class="text-xs text-gray-500">
              © 2025 SSO, by{' '}
              <a
                href="https://github.com/dancaldera"
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-600 hover:text-blue-800 hover:underline"
              >
                https://github.com/dancaldera
              </a>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
