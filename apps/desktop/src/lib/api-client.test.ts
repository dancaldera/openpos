import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetApiUrlCacheForTests } from './api-config'

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

const { requestApi, requestApiJson } = await import('./api-client')
const { AuthExpiredError, setSessionExpiredHandler } = await import('./auth-session')

describe('requestApi error handling', () => {
  let storage: MemoryStorage
  const sessionExpiredHandler = vi.fn(() => {})

  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', '')
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ) as unknown as typeof fetch
    sessionExpiredHandler.mockClear()
    setSessionExpiredHandler(sessionExpiredHandler)
    resetApiUrlCacheForTests()
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('expires the session when a protected request starts without a token and an API is configured', async () => {
    storage.setItem('pos_user', JSON.stringify({ id: '1' }))
    globalThis.window = {
      openposDesktop: {
        getConfig: async () => ({
          apiUrl: 'https://api.example.com',
          configPath: '',
          configSource: 'userData',
          userDataConfigPath: '',
        }),
      },
    } as Window & typeof globalThis

    await expect(requestApiJson('/api/query', { requireAuth: true })).rejects.toBeInstanceOf(AuthExpiredError)

    expect(storage.getItem('auth_token')).toBeNull()
    expect(storage.getItem('pos_user')).toBeNull()
    expect(sessionExpiredHandler).toHaveBeenCalledTimes(1)
  })

  it('keeps the local desktop session when no API URL is configured', async () => {
    storage.setItem('pos_user', JSON.stringify({ id: '1' }))

    await expect(requestApiJson('/api/settings/database', { requireAuth: true })).rejects.toThrow(
      'Remote API is not configured',
    )

    expect(storage.getItem('pos_user')).toBe(JSON.stringify({ id: '1' }))
    expect(sessionExpiredHandler).not.toHaveBeenCalled()
  })

  it('expires the session when the API returns 401 for a protected request', async () => {
    storage.setItem('auth_token', 'jwt-token')
    storage.setItem('pos_user', JSON.stringify({ id: '1' }))
    globalThis.fetch = vi.fn(
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
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    ) as unknown as typeof fetch

    await expect(requestApiJson('/api/settings/public')).rejects.toThrow('Server error')

    expect(storage.getItem('auth_token')).toBe('jwt-token')
    expect(storage.getItem('pos_user')).toBe(JSON.stringify({ id: '1' }))
    expect(sessionExpiredHandler).not.toHaveBeenCalled()
  })

  it('surfaces plain-text API failures when the response is not JSON', async () => {
    globalThis.fetch = vi.fn(
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
  it('maps network failures to an actionable message for all API callers', async () => {
    globalThis.window = {
      openposDesktop: {
        getConfig: async () => ({
          apiUrl: 'https://api.example.com',
          configPath: '',
          configSource: 'userData',
          userDataConfigPath: '',
        }),
      },
    } as Window & typeof globalThis
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch

    await expect(requestApi('/api/connections/assigned')).rejects.toThrow(
      'Cannot reach the API server at https://api.example.com',
    )
    await expect(requestApiJson('/api/auth/login')).rejects.toThrow(
      'Cannot reach the API server at https://api.example.com',
    )
    expect(sessionExpiredHandler).not.toHaveBeenCalled()
  })

  it('fails a hung request with a timeout message', async () => {
    globalThis.window = {
      openposDesktop: {
        getConfig: async () => ({
          apiUrl: 'https://api.example.com',
          configPath: '',
          configSource: 'userData',
          userDataConfigPath: '',
        }),
      },
    } as Window & typeof globalThis
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) {
          reject(new Error('request signal missing'))
          return
        }
        if (signal.aborted) {
          reject(signal.reason)
          return
        }
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    }) as unknown as typeof fetch

    await expect(requestApiJson('/api/auth/login', { timeoutMs: 10 })).rejects.toThrow(
      'The API server at https://api.example.com did not respond in time',
    )
  })

  it('preserves caller cancellation instead of reporting it as an API outage', async () => {
    const controller = new AbortController()
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) {
          reject(new Error('request signal missing'))
          return
        }
        if (signal.aborted) {
          reject(signal.reason)
          return
        }
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    }) as unknown as typeof fetch

    const request = requestApiJson('/api/auth/login', {
      signal: controller.signal,
      timeoutMs: 10_000,
    })
    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
})
