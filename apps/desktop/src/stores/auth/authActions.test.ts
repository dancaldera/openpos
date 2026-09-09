import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authService, toastWarning } = vi.hoisted(() => ({
  authService: {
    signIn: vi.fn(),
    signInWithPin: vi.fn(),
    signOut: vi.fn(),
    restoreCurrentUser: vi.fn(),
    hasPermission: vi.fn(),
    hasRole: vi.fn(),
  },
  toastWarning: vi.fn(),
}))

vi.mock('../../services/auth-turso', () => ({
  authService,
}))

vi.mock('sonner', () => ({
  toast: { warning: toastWarning },
}))

const { authActions } = await import('./authActions')
const { error, isLoading, user } = await import('./authStore')
const { AuthExpiredError, expireSession } = await import('../../lib/auth-session')

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  } as Storage
}

describe('authActions', () => {
  beforeEach(() => {
    user.value = null
    error.value = null
    isLoading.value = false
    authService.signIn.mockReset()
    authService.signInWithPin.mockReset()
    authService.signOut.mockReset()
    authService.restoreCurrentUser.mockReset()
    authService.hasPermission.mockReset()
    authService.hasRole.mockReset()
    toastWarning.mockClear()
    globalThis.localStorage = memoryStorage()
  })

  it('signs in and stores the user on success', async () => {
    const account = { id: '1', role: 'admin' }
    authService.signIn.mockResolvedValueOnce({ success: true, user: account })

    const result = await authActions.signIn('a@example.com', 'secret')

    expect(result).toEqual({ success: true, user: account })
    expect(user.value).toEqual(account)
    expect(error.value).toBeNull()
  })

  it('records the failure when credentials are rejected', async () => {
    authService.signIn.mockResolvedValueOnce({ success: false, error: 'bad password' })

    const result = await authActions.signIn('a@example.com', 'wrong')

    expect(result.success).toBe(false)
    expect(error.value).toBe('bad password')
    expect(user.value).toBeNull()
  })

  it('defaults the sign-in error message when none is provided', async () => {
    authService.signIn.mockResolvedValueOnce({ success: false })

    await authActions.signIn('a@example.com', 'wrong')

    expect(error.value).toBe('Sign in failed')
  })

  it('rethrows sign-in crashes after recording the message', async () => {
    authService.signIn.mockRejectedValueOnce(new Error('db down'))

    await expect(authActions.signIn('a@example.com', 'secret')).rejects.toThrow('db down')

    expect(error.value).toBe('db down')
    expect(user.value).toBeNull()
  })

  it('maps non-Error sign-in crashes to a generic message', async () => {
    authService.signIn.mockRejectedValueOnce('kaput')

    await expect(authActions.signIn('a@example.com', 'secret')).rejects.toBe('kaput')

    expect(error.value).toBe('Sign in failed')
  })

  it('signs in with a pin on success', async () => {
    const account = { id: '2', role: 'user' }
    authService.signInWithPin.mockResolvedValueOnce({ success: true, user: account })

    const result = await authActions.signInWithPin('2', '1234')

    expect(result).toEqual({ success: true, user: account })
    expect(user.value).toEqual(account)
    expect(error.value).toBeNull()
  })

  it('records pin failures', async () => {
    authService.signInWithPin.mockResolvedValueOnce({ success: false, error: 'wrong pin' })

    await authActions.signInWithPin('2', '0000')

    expect(error.value).toBe('wrong pin')
    expect(user.value).toBeNull()
  })

  it('defaults the pin error message when none is provided', async () => {
    authService.signInWithPin.mockResolvedValueOnce({ success: false })

    await authActions.signInWithPin('2', '0000')

    expect(error.value).toBe('Sign in failed')
  })

  it('rethrows pin crashes after recording the message', async () => {
    authService.signInWithPin.mockRejectedValueOnce(new Error('db down'))

    await expect(authActions.signInWithPin('2', '1234')).rejects.toThrow('db down')

    expect(error.value).toBe('db down')
    expect(user.value).toBeNull()
  })

  it('maps non-Error pin crashes to a generic message', async () => {
    authService.signInWithPin.mockRejectedValueOnce('kaput')

    await expect(authActions.signInWithPin('2', '1234')).rejects.toBe('kaput')

    expect(error.value).toBe('Sign in failed')
  })

  it('signs out and clears state', () => {
    user.value = { id: '1' } as never
    error.value = 'stale'

    authActions.signOut()

    expect(user.value).toBeNull()
    expect(error.value).toBeNull()
    expect(authService.signOut).toHaveBeenCalledTimes(1)
  })

  it('restores the current user on initialization', async () => {
    const account = { id: '1', role: 'manager' }
    authService.restoreCurrentUser.mockResolvedValueOnce(account)

    await authActions.initializeAuth()

    expect(user.value).toEqual(account)
    expect(error.value).toBeNull()
    expect(isLoading.value).toBe(false)
  })

  it('clears the user when no session exists', async () => {
    authService.restoreCurrentUser.mockResolvedValueOnce(null)

    await authActions.initializeAuth()

    expect(user.value).toBeNull()
    expect(isLoading.value).toBe(false)
  })

  it('records Error initialization failures', async () => {
    authService.restoreCurrentUser.mockRejectedValueOnce(new Error('locked'))

    await authActions.initializeAuth()

    expect(user.value).toBeNull()
    expect(error.value).toBe('locked')
    expect(isLoading.value).toBe(false)
  })

  it('records non-Error initialization failures', async () => {
    authService.restoreCurrentUser.mockRejectedValueOnce('kaput')

    await authActions.initializeAuth()

    expect(error.value).toBe('Auth initialization failed')
    expect(isLoading.value).toBe(false)
  })

  it('clears errors and delegates permission checks', () => {
    error.value = 'stale'
    authService.hasPermission.mockReturnValueOnce(true)
    authService.hasRole.mockReturnValueOnce(false)

    authActions.clearError()

    expect(error.value).toBeNull()
    expect(authActions.hasPermission('orders.view')).toBe(true)
    expect(authActions.hasRole('admin')).toBe(false)
    expect(authService.hasPermission).toHaveBeenCalledWith('orders.view')
    expect(authService.hasRole).toHaveBeenCalledWith('admin')
  })

  it('warns and signs out when the session expires', () => {
    user.value = { id: '1' } as never

    expect(() => expireSession('session over')).toThrow(AuthExpiredError)

    expect(toastWarning).toHaveBeenCalledWith('session over')
    expect(user.value).toBeNull()
    expect(authService.signOut).toHaveBeenCalledTimes(1)
  })
})
