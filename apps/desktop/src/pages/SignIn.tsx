import { useEffect, useRef, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { DbStatusBadge } from '../components/ui/DbStatusBadge'
import { Form } from '../components/ui/Form'
import { Input } from '../components/ui/Input'
import { MailIcon, SpinnerIcon } from '../components/ui/icons'
import { PasswordInput } from '../components/ui/PasswordInput'
import { UpdateBadge } from '../components/ui/UpdateBadge'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { APP_VERSION } from '../lib/app-version'
import { appSettingsStore } from '../stores/appSettings/appSettingsStore'

export default function SignIn() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const { appName } = appSettingsStore

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
  }, [])

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
    <div class="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-blue-100">
      <canvas ref={canvasRef} class="absolute inset-0" />
      <div class="w-full max-w-md relative z-10">
        <div class="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl p-8">
          <div class="text-center mb-8">
            <h1 class="text-2xl font-bold text-gray-900">{appName.value}</h1>
            <p class="text-sm text-gray-600 mt-2">{t('auth.signInToAccount')}</p>
          </div>

          <Form onSubmit={handleSubmit} spacing="lg">
            <Input
              label={t('auth.email')}
              type="email"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              placeholder="email@example.com"
              disabled={isLoading}
              required
              size="lg"
              leftIcon={<MailIcon />}
            />

            <PasswordInput
              label={t('auth.password')}
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              placeholder="••••••••"
              disabled={isLoading}
              required
            />

            <Button type="submit" variant="primary" size="lg" disabled={isLoading} class="w-full">
              {isLoading ? (
                <>
                  <SpinnerIcon class="animate-spin h-5 w-5 mr-2" />
                  {t('common.loading')}
                </>
              ) : (
                t('auth.signIn')
              )}
            </Button>
          </Form>

          <div class="mt-8 pt-6 border-t border-gray-200 text-center">
            <span class="text-xs text-gray-500">
              v{APP_VERSION} • © 2025 • MIT License •{' '}
              <a
                href="https://github.com/dancaldera/openpos"
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-600 hover:text-blue-800 hover:underline"
              >
                GitHub
              </a>
            </span>
          </div>
        </div>
      </div>

      <UpdateBadge />
      <DbStatusBadge />
    </div>
  )
}
