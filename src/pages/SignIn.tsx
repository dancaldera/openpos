import { useEffect, useRef, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { Form } from '../components/ui'
import { VirtualKeypad } from '../components/ui/VirtualKeypad'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { authService, type User } from '../services/auth-sqlite'

export default function SignIn() {
  const { t } = useTranslation()
  const { signIn } = useAuth()

  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [pinDigits, setPinDigits] = useState(['', '', '', '', '', ''])
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number>(0)

  // Load users on mount
  useEffect(() => {
    loadUsers()
  }, [])

  // Auto-login when 6 digits are entered
  useEffect(() => {
    const pinValue = pinDigits.join('')
    if (pinValue.length === 6 && selectedUser && !isLoading) {
      performLogin(pinValue)
    }
  }, [pinDigits, selectedUser, isLoading])

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

  // Animated dotted background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const gap = 16
    const baseRadius = 1.5
    const dots: { x: number; y: number; phase: number; speed: number }[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      dots.length = 0

      for (let x = gap; x < canvas.width; x += gap) {
        for (let y = gap; y < canvas.height; y += gap) {
          dots.push({
            x,
            y,
            phase: Math.random() * Math.PI * 2,
            speed: 1.5 + Math.random() * 1.5,
          })
        }
      }
    }

    resize()
    window.addEventListener('resize', resize)

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const time = Date.now() / 1000

      for (const dot of dots) {
        const pulse = (Math.sin(time * dot.speed + dot.phase) + 1) / 2
        const radius = baseRadius + pulse * 0.3
        const opacity = 0.2 + pulse * 0.4
        const glowSize = 2 + pulse * 2

        // Glow
        ctx.beginPath()
        ctx.arc(dot.x, dot.y, glowSize, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(59, 130, 246, ${opacity * 0.2})`
        ctx.fill()

        // Dot
        ctx.beginPath()
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99, 102, 241, ${opacity})`
        ctx.fill()
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationRef.current)
    }
  }, [])

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

    // Auto-focus next input
    if (digit && index < 5) {
      pinInputRefs.current[index + 1]?.focus()
    }
  }

  const handlePinKeyDown = (index: number, e: KeyboardEvent) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      pinInputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      pinInputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeypadDigitPress = (digit: string) => {
    const emptyIndex = pinDigits.indexOf('')
    if (emptyIndex === -1) return // All filled

    const newPinDigits = [...pinDigits]
    newPinDigits[emptyIndex] = digit
    setPinDigits(newPinDigits)

    // Focus next input
    if (emptyIndex < 5) {
      pinInputRefs.current[emptyIndex + 1]?.focus()
    }
  }

  const handleKeypadBackspace = () => {
    let lastFilledIndex = -1
    for (let i = pinDigits.length - 1; i >= 0; i--) {
      if (pinDigits[i] !== '') {
        lastFilledIndex = i
        break
      }
    }
    if (lastFilledIndex === -1) return

    const newPinDigits = [...pinDigits]
    newPinDigits[lastFilledIndex] = ''
    setPinDigits(newPinDigits)
    pinInputRefs.current[lastFilledIndex]?.focus()
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

  const performLogin = async (pin: string) => {
    if (!selectedUser || isLoading) return

    setIsLoading(true)

    try {
      const result = await signIn(selectedUser.email, pin)

      if (!result.success) {
        setIsLoading(false)
        setPinDigits(['', '', '', '', '', ''])
        pinInputRefs.current[0]?.focus()
        toast.error(result.error || t('auth.signInFailed'))
      }
      // Success: app redirects automatically
    } catch (error) {
      setIsLoading(false)
      setPinDigits(['', '', '', '', '', ''])
      pinInputRefs.current[0]?.focus()
      const message = error instanceof Error ? error.message : t('errors.generic')
      toast.error(message)
    }
  }

  const handleUserSelect = (user: User) => {
    setSelectedUser(user)
    setShowDropdown(false)
    setPinDigits(['', '', '', '', '', ''])
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
    <div class="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-blue-100">
      <canvas ref={canvasRef} class="absolute inset-0" />
      <div class="w-full max-w-md relative z-10">
        <div class="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl p-8">
          {/* Logo and Title */}
          <div class="text-center mb-8">
            <h1 class="text-2xl font-bold text-gray-900">⚓ Titanic POS</h1>
            <p class="text-sm text-gray-600 mt-2">{t('auth.signInToAccount')}</p>
          </div>

          {/* Sign In Form */}
          <Form onSubmit={() => {}} spacing="lg">
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
                  <div class="flex gap-2 justify-center" onPaste={handlePinPaste}>
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
                        disabled={isLoading}
                        class="w-10 h-12 text-center text-xl font-bold border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                disabled={isLoading}
              />
            )}

            {/* Loading indicator */}
            {isLoading && <div class="text-center text-sm text-gray-500">{t('common.loading')}</div>}
          </Form>

          {/* Footer */}
          <div class="mt-8 pt-6 border-t border-gray-200 text-center">
            <span class="text-xs text-gray-500">
              v0.2.0 • © 2025 SSO, by{' '}
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
