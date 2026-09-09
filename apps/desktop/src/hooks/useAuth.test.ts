import { describe, expect, it } from 'vitest'
import { useAuth } from './useAuth'
import { user } from '../stores/auth/authStore'

describe('useAuth', () => {
  it('exposes auth state and actions', () => {
    user.value = { role: 'admin', permissions: ['*'] } as never

    const auth = useAuth()

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.isAdmin).toBe(true)
    expect(auth.user).toBe(user.value)
    expect(typeof auth.signIn).toBe('function')
    expect(typeof auth.signInWithPin).toBe('function')
    expect(typeof auth.signOut).toBe('function')
    expect(typeof auth.hasPermission).toBe('function')
    expect(typeof auth.hasRole).toBe('function')
    expect(typeof auth.clearError).toBe('function')

    user.value = null
  })
})
