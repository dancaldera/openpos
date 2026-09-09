import { describe, expect, it } from 'vitest'
import { error, isAdmin, isAuthenticated, isLoading, isManager, isUser, user } from './authStore'

describe('authStore', () => {
  it('derives flags from the current user', () => {
    expect(isAuthenticated.value).toBe(false)
    expect(isLoading.value).toBe(false)
    expect(error.value).toBeNull()

    user.value = { role: 'admin' } as never
    expect(isAuthenticated.value).toBe(true)
    expect(isAdmin.value).toBe(true)
    expect(isManager.value).toBe(false)
    expect(isUser.value).toBe(false)

    user.value = { role: 'manager' } as never
    expect(isAdmin.value).toBe(false)
    expect(isManager.value).toBe(true)

    user.value = { role: 'user' } as never
    expect(isManager.value).toBe(false)
    expect(isUser.value).toBe(true)

    user.value = null
    expect(isAuthenticated.value).toBe(false)
  })
})
