// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AuthExpiredError,
  clearPersistedAuth,
  expireSession,
  isAuthExpiredError,
  isExpiredTokenMessage,
  setSessionExpiredHandler,
} from './auth-session'

afterEach(() => {
  setSessionExpiredHandler(null)
  localStorage.clear()
})

describe('auth-session', () => {
  it('expires sessions with default and custom messages', () => {
    localStorage.setItem('pos_user', 'x')
    localStorage.setItem('auth_token', 'y')
    const handler = vi.fn()
    setSessionExpiredHandler(handler)

    try {
      expireSession()
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(AuthExpiredError)
      expect((error as Error).message).toBe('Authentication expired. Please sign in again.')
    }
    expect(handler).toHaveBeenCalledWith('Authentication expired. Please sign in again.')
    expect(localStorage.getItem('pos_user')).toBeNull()
    expect(localStorage.getItem('auth_token')).toBeNull()

    setSessionExpiredHandler(null)
    expect(() => expireSession('Gone')).toThrowError(AuthExpiredError)
    expect(() => expireSession('Gone')).toThrowError('Gone')
  })

  it('clears persisted auth directly', () => {
    localStorage.setItem('pos_user', 'x')
    localStorage.setItem('auth_token', 'y')
    localStorage.setItem('desktop_remote_auth_status', 'z')

    clearPersistedAuth()

    expect(localStorage.getItem('pos_user')).toBeNull()
    expect(localStorage.getItem('auth_token')).toBeNull()
    expect(localStorage.getItem('desktop_remote_auth_status')).toBeNull()
  })

  it('identifies expired errors', () => {
    expect(new AuthExpiredError().name).toBe('AuthExpiredError')
    expect(new AuthExpiredError('x').message).toBe('x')
    expect(isAuthExpiredError(new AuthExpiredError())).toBe(true)
    expect(isAuthExpiredError(new Error('nope'))).toBe(false)
  })

  it('recognizes expired token messages', () => {
    expect(isExpiredTokenMessage(null)).toBe(false)
    expect(isExpiredTokenMessage(undefined)).toBe(false)
    expect(isExpiredTokenMessage('')).toBe(false)
    expect(isExpiredTokenMessage('Request failed: expired token')).toBe(true)
    expect(isExpiredTokenMessage('Token expired, sign in')).toBe(true)
    expect(isExpiredTokenMessage('Invalid or expired token')).toBe(true)
    expect(isExpiredTokenMessage('Something else broke')).toBe(false)
  })
})
