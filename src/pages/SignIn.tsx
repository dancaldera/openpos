import { useState } from 'preact/hooks'
import { Toaster, toast } from 'sonner'
import { Button, Container, Form, FormActions, FormField, Heading, Input, Text } from '../components/ui'
import { useTranslation } from '../hooks/useTranslation'

interface SignInProps {
  onSignIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
}

export default function SignIn({ onSignIn }: SignInProps) {
  const { t } = useTranslation()

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [errors, setErrors] = useState({
    email: '',
    password: '',
  })
  const [isLoading, setIsLoading] = useState(false)

  const handleInputChange = (field: string) => (e: Event) => {
    const value = (e.target as HTMLInputElement).value
    setFormData((prev) => ({ ...prev, [field]: value }))

    // Clear field error when user starts typing
    if (errors[field as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [field]: '' }))
    }
  }

  const validateForm = () => {
    const newErrors = {
      email: '',
      password: '',
    }

    if (!formData.email) {
      newErrors.email = t('validation.required')
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = t('validation.invalidEmail')
    }

    if (!formData.password) {
      newErrors.password = t('validation.required')
    } else if (formData.password.length < 6) {
      newErrors.password = t('validation.minLength', { min: 6 })
    }

    setErrors(newErrors)
    return !newErrors.email && !newErrors.password
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    setIsLoading(true)
    try {
      const result = await onSignIn(formData.email, formData.password)

      if (!result.success) {
        toast.error(result.error || t('auth.invalidCredentials'))
      } else {
        toast.success(t('auth.signInSuccess'))
      }
    } catch (_error) {
      toast.error(t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  const fillDemoCredentials = () => {
    setFormData({
      email: 'admin@postpos.com',
      password: 'admin123',
    })
    setErrors({ email: '', password: '' })
    toast.success(t('auth.demoCredentialsLoaded'))
  }

  return (
    <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <Container size="sm" padding="none" class="w-full max-w-md">
        <div class="bg-white rounded-lg shadow-lg p-8">
          {/* Logo and Title */}
          <div class="text-center mb-8">
            <div class="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Text color="white" weight="bold" size="xl">
                P
              </Text>
            </div>
            <Heading level={1} size="2xl" color="primary">
              Post POS
            </Heading>
            <Text variant="caption" color="muted" class="mt-2">
              {t('auth.signInToAccount')}
            </Text>
          </div>

          {/* Demo Credentials Helper - Remove in production */}
          {import.meta.env.DEV && (
            <div class="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <Text variant="small" color="primary" weight="medium" class="mb-2">
                Demo Credentials
              </Text>
              <Text variant="small" color="muted" class="mb-3">
                Email: admin@postpos.com
                <br />
                Password: admin123
              </Text>
              <Button variant="outline" size="sm" onClick={fillDemoCredentials} class="w-full">
                Use Demo Credentials
              </Button>
            </div>
          )}

          {/* Sign In Form */}
          <Form onSubmit={handleSubmit} spacing="lg">
            <FormField>
              <Input
                label={t('auth.email')}
                type="email"
                placeholder={t('auth.email')}
                value={formData.email}
                onInput={handleInputChange('email')}
                error={errors.email}
                required
              />
            </FormField>

            <FormField>
              <Input
                label={t('auth.password')}
                type="password"
                placeholder={t('auth.password')}
                value={formData.password}
                onInput={handleInputChange('password')}
                error={errors.password}
                required
              />
            </FormField>

            <FormActions align="center">
              <Button type="submit" variant="primary" size="lg" disabled={isLoading} class="w-full">
                {isLoading ? t('common.loading') : t('auth.signIn')}
              </Button>
            </FormActions>
          </Form>

          {/* Footer */}
          <div class="mt-8 pt-6 border-t border-gray-200 text-center">
            <Text variant="small" color="muted">
              © 2025 Post POS. All rights reserved.
            </Text>
          </div>
        </div>
      </Container>
      <Toaster position="top-right" />
    </div>
  )
}
