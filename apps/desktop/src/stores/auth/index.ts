import { computed, signal } from '@preact/signals'
import { setSessionExpiredHandler } from '../../lib/auth-session'
import { authService, type User } from '../../services/auth-turso'

// Auth state signals
export const user = signal<User | null>(null)
export const isLoading = signal(false)
export const error = signal<string | null>(null)

// Computed values
export const isAuthenticated = computed(() => !!user.value)
export const isAdmin = computed(() => user.value?.role === 'admin')
export const isManager = computed(() => user.value?.role === 'manager')
export const isUser = computed(() => user.value?.role === 'user')

export const authActions = {
  async signIn(email: string, password: string) {
    error.value = null

    try {
      const result = await authService.signIn(email, password)

      if (result.success && result.user) {
        user.value = result.user
        error.value = null
      } else {
        error.value = result.error || 'Sign in failed'
        user.value = null
      }

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sign in failed'
      error.value = errorMessage
      user.value = null
      throw err
    }
  },

  signOut() {
    user.value = null
    error.value = null
    authService.signOut()
  },

  async initializeAuth() {
    isLoading.value = true

    try {
      const currentUser = await authService.restoreCurrentUser()
      user.value = currentUser
      error.value = null
    } catch (err) {
      user.value = null
      error.value = err instanceof Error ? err.message : 'Auth initialization failed'
    } finally {
      isLoading.value = false
    }
  },

  clearError() {
    error.value = null
  },

  hasPermission(permission: string): boolean {
    return authService.hasPermission(permission)
  },

  hasRole(role: User['role']): boolean {
    return authService.hasRole(role)
  },
}

setSessionExpiredHandler(() => {
  authActions.signOut()
})
