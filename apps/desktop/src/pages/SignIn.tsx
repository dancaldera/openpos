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
import { usePlatform } from '../hooks/usePlatform'
import { useTranslation } from '../hooks/useTranslation'
import { APP_VERSION } from '../lib/app-version'
import { appSettingsStore } from '../stores/appSettings/appSettingsStore'

export default function SignIn() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const { appName } = appSettingsStore
  const { isMac } = usePlatform()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isDemoHost, setIsDemoHost] = useState(false)

  useEffect(() => {
    setIsDemoHost(window.location.hostname === 'demo.openpos.xyz')
  }, [])

  const fillDemo = () => {
    setEmail('manager@openpos.xyz')
    setPassword('Manager123!')
  }

  const [isLoading, setIsLoading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number>(0)
  const isDark = useRef(window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      isDark.current = e.matches
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const gap = 18
    const baseRadius = 1.2
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
            speed: 1.2 + Math.random() * 1.2,
          })
        }
      }
    }

    resize()
    window.addEventListener('resize', resize)

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const time = Date.now() / 1000
      const dark = isDark.current

      for (const dot of dots) {
        const pulse = (Math.sin(time * dot.speed + dot.phase) + 1) / 2
        const radius = baseRadius + pulse * 0.3
        const opacity = dark ? 0.08 + pulse * 0.18 : 0.15 + pulse * 0.3

        ctx.beginPath()
        ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = dark ? `rgba(163, 163, 163, ${opacity})` : `rgba(99, 102, 241, ${opacity})`
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
    <div class="drag-region min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-chalk ">
      <canvas ref={canvasRef} class="absolute inset-0 pointer-events-none" />

      {/* Grabbable zone at top for macOS traffic lights */}
      {isMac && <div class="drag-region absolute top-0 left-0 right-0 h-10 z-20" />}

      <div class="no-drag w-full max-w-sm relative z-10">
        <div class="bg-canvas backdrop-blur-xl rounded-cards shadow-sm border border-fog-border p-8">
          <div class="text-center mb-7">
            <h1 class="text-xl font-semibold text-void ">{appName.value}</h1>
            <p class="text-sm text-graphite mt-1">{t('auth.signInToAccount')}</p>
          </div>

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
            />

            <PasswordInput
              label={t('auth.password')}
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              placeholder="••••••••"
              disabled={isLoading}
              required
            />

            <Button type="submit" variant="primary" size="lg" disabled={isLoading} class="w-full mt-1">
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

          <div class="mt-6 pt-5 border-t border-fog-border text-center">
            <span class="text-xs text-graphite ">
              v{APP_VERSION} •{' '}
              <a
                href="https://github.com/dancaldera"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-graphite transition-colors"
              >
                GitHub
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
            </span>
          </div>
        </div>
      </div>

      <UpdateBadge />
      <DbStatusBadge />
    </div>
  )
}
