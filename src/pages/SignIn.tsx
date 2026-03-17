import { useEffect, useRef, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { appSettingsStore } from '../stores/appSettings/appSettingsStore'

export default function SignIn() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const { appName } = appSettingsStore

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number>(0)

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

        ctx.beginPath()
        ctx.arc(dot.x, dot.y, glowSize, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(59, 130, 246, ${opacity * 0.2})`
        ctx.fill()

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
  })

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error(t('auth.fillAllFields'))
      return
    }

    setIsLoading(true)
    try {
      const result = await signIn(email, password)
      if (!result.success) {
        toast.error(result.error || t('auth.signInFailed'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth.signInFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div class="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-blue-100">
      <canvas ref={canvasRef} class="absolute inset-0" />
      <div class="w-full max-w-md relative z-10">
        <div class="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl p-8">
          <div class="text-center mb-8">
            <h1 class="text-2xl font-bold text-gray-900">{appName.value}</h1>
            <p class="text-sm text-gray-600 mt-2">{t('auth.signInToAccount')}</p>
          </div>

          <form onSubmit={handleSubmit} class="space-y-6">
            <div>
              <label htmlFor="email" class="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.email')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                placeholder="email@example.com"
                disabled={isLoading}
                required
                class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all bg-white text-gray-900 disabled:bg-gray-100"
              />
            </div>

            <div>
              <div class="flex items-center justify-between mb-2">
                <label htmlFor="password" class="block text-sm font-medium text-gray-700">
                  {t('auth.password')}
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  class="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  {showPassword ? t('auth.hide') : t('auth.show')}
                </button>
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                placeholder="••••••••"
                disabled={isLoading}
                required
                class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all bg-white text-gray-900 disabled:bg-gray-100"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" role="img">
                    <title>Loading</title>
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                      fill="none"
                    />
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {t('common.loading')}
                </>
              ) : (
                t('auth.signIn')
              )}
            </button>
          </form>

          <div class="mt-8 pt-6 border-t border-gray-200 text-center">
            <span class="text-xs text-gray-500">
              v0.2.1 • © 2025 OSS, by{' '}
              <a
                href="https://github.com/dancaldera"
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-600 hover:text-blue-800 hover:underline"
              >
                dancaldera
              </a>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
