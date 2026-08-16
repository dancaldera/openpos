import { beforeEach, describe, expect, it, mock } from 'bun:test'

class MemoryStorage {
  private values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  clear(): void {
    this.values.clear()
  }
}

const { requestApiJson } = await import('./api-client')
const { AuthExpiredError, setSessionExpiredHandler } = await import('./auth-session')

describe('requestApiJson auth expiration handling', () => {
  let storage: MemoryStorage
  const sessionExpiredHandler = mock(() => {})

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ) as unknown as typeof fetch
    sessionExpiredHandler.mockClear()
    setSessionExpiredHandler(sessionExpiredHandler)
  })

  it('expires the session when a protected request starts without a token', async () => {
    storage.setItem('pos_user', JSON.stringify({ id: '1' }))

    await expect(requestApiJson('/api/query', { requireAuth: true })).rejects.toBeInstanceOf(AuthExpiredError)

    expect(storage.getItem('auth_token')).toBeNull()
    expect(storage.getItem('pos_user')).toBeNull()
    expect(sessionExpiredHandler).toHaveBeenCalledTimes(1)
  })

  it('expires the session when the API returns 401 for a protected request', async () => {
    storage.setItem('auth_token', 'jwt-token')
    storage.setItem('pos_user', JSON.stringify({ id: '1' }))
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401 }),
    ) as unknown as typeof fetch

    await expect(requestApiJson('/api/query', { requireAuth: true })).rejects.toBeInstanceOf(AuthExpiredError)

    expect(storage.getItem('auth_token')).toBeNull()
    expect(storage.getItem('pos_user')).toBeNull()
    expect(sessionExpiredHandler).toHaveBeenCalledTimes(1)
  })

  it('keeps auth state intact for non-authenticated request failures', async () => {
    storage.setItem('auth_token', 'jwt-token')
    storage.setItem('pos_user', JSON.stringify({ id: '1' }))
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    ) as unknown as typeof fetch

    await expect(requestApiJson('/api/settings/public')).rejects.toThrow('Server error')

    expect(storage.getItem('auth_token')).toBe('jwt-token')
    expect(storage.getItem('pos_user')).toBe(JSON.stringify({ id: '1' }))
    expect(sessionExpiredHandler).not.toHaveBeenCalled()
  })

  it('surfaces plain-text API failures when the response is not JSON', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response('JWT_SECRET environment variable is not set', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
    ) as unknown as typeof fetch

    await expect(requestApiJson('/api/auth/login', { method: 'POST' })).rejects.toThrow(
      'JWT_SECRET environment variable is not set',
    )
  })
})
