import { authService, type User } from '../../services/auth-sqlite'
import { error, isLoading, user } from './authStore'

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
      const currentUser = authService.getCurrentUser()
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
