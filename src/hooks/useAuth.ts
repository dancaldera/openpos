import type { User } from '../services/auth-turso'
import { authActions } from '../stores/auth/authActions'
import { error, isAdmin, isAuthenticated, isLoading, isManager, isUser, user } from '../stores/auth/authStore'

interface UseAuthReturn {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  isAdmin: boolean
  isManager: boolean
  isUser: boolean
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => void
  hasPermission: (permission: string) => boolean
  hasRole: (role: User['role']) => boolean
  clearError: () => void
}

export function useAuth(): UseAuthReturn {
  return {
    // State from signals (reactive)
    user: user.value,
    isAuthenticated: isAuthenticated.value,
    isLoading: isLoading.value,
    error: error.value,
    isAdmin: isAdmin.value,
    isManager: isManager.value,
    isUser: isUser.value,

    // Actions
    signIn: authActions.signIn,
    signOut: authActions.signOut,
    hasPermission: authActions.hasPermission,
    hasRole: authActions.hasRole,
    clearError: authActions.clearError,
  }
}
