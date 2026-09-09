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
})

describe('requestApi headers and bodies', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', '')
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    resetApiUrlCacheForTests()
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('serializes JSON bodies with a JSON content type', async () => {
    const seen: RequestInit[] = []
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init ?? {})
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as unknown as typeof fetch

    await requestApi('/api/items', { method: 'POST', body: { name: 'apple' } })

    const headers = new Headers(seen[0]?.headers)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(seen[0]?.body).toBe(JSON.stringify({ name: 'apple' }))
  })

  it('keeps an explicit content type untouched', async () => {
    const seen: RequestInit[] = []
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init ?? {})
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as unknown as typeof fetch

    await requestApi('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello',
    })

    expect(new Headers(seen[0]?.headers).get('Content-Type')).toBe('text/plain')
  })

  it('sends FormData without forcing a JSON content type', async () => {
    const seen: RequestInit[] = []
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init ?? {})
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as unknown as typeof fetch
    const form = new FormData()
    form.append('file', 'bytes')

    await requestApi('/api/upload', { method: 'POST', body: form })

    expect(new Headers(seen[0]?.headers).has('Content-Type')).toBe(false)
    expect(seen[0]?.body).toBe(form)
  })

  it('attaches the bearer token and connection key when available', async () => {
    storage.setItem('auth_token', 'jwt-token')
    storage.setItem('openpos_connection_key', 'conn-123')
    const seen: RequestInit[] = []
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init ?? {})
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as unknown as typeof fetch

    await requestApi('/api/query', { requireAuth: true })

    const headers = new Headers(seen[0]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer jwt-token')
    expect(headers.get('X-OpenPOS-Connection')).toBe('conn-123')
  })

  it('omits the connection header when no key is stored', async () => {
    const seen: RequestInit[] = []
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init ?? {})
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as unknown as typeof fetch

    await requestApi('/api/query')

    expect(new Headers(seen[0]?.headers).has('X-OpenPOS-Connection')).toBe(false)
  })
})

describe('requestApiJson responses', () => {
  let storage: MemoryStorage
  const sessionExpiredHandler = vi.fn(() => {})

  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', '')
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    sessionExpiredHandler.mockClear()
    setSessionExpiredHandler(sessionExpiredHandler)
    resetApiUrlCacheForTests()
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('returns undefined for 204 responses', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch

    await expect(requestApiJson('/api/items')).resolves.toBeUndefined()
  })

  it('returns the parsed JSON payload', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ items: [1, 2] }), { status: 200 }),
    ) as unknown as typeof fetch

    await expect(requestApiJson<{ items: number[] }>('/api/items')).resolves.toEqual({ items: [1, 2] })
  })

  it('expires the session when a forbidden response reports an expired token', async () => {
    storage.setItem('auth_token', 'jwt-token')
    storage.setItem('pos_user', JSON.stringify({ id: '1' }))
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: 'expired token, sign in again' }), { status: 403 }),
    ) as unknown as typeof fetch

    await expect(requestApiJson('/api/query', { requireAuth: true })).rejects.toBeInstanceOf(AuthExpiredError)

    expect(storage.getItem('auth_token')).toBeNull()
    expect(sessionExpiredHandler).toHaveBeenCalledTimes(1)
  })

  it('falls back to the status text when JSON carries no error', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false }), {
          status: 400,
          statusText: 'Bad request',
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    await expect(requestApiJson('/api/items')).rejects.toThrow('Bad request')
  })

  it('falls back to the status text when JSON parsing fails', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response('not json', {
          status: 400,
          statusText: 'Bad request',
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    await expect(requestApiJson('/api/items')).rejects.toThrow('Bad request')
  })

  it('falls back to the status text when the body is blank', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('', { status: 500, statusText: 'Server exploded' }),
    ) as unknown as typeof fetch

    await expect(requestApiJson('/api/items')).rejects.toThrow('Server exploded')
  })

  it('falls back to a generic message when nothing else is available', async () => {
    globalThis.fetch = vi.fn(async () => new Response('   ', { status: 500 })) as unknown as typeof fetch

    await expect(requestApiJson('/api/items')).rejects.toThrow('API request failed')
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

describe('requestApiJson error details', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', '')
    globalThis.localStorage = new MemoryStorage() as unknown as Storage
    setSessionExpiredHandler(null)
    resetApiUrlCacheForTests()
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('surfaces JSON error payloads', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'boom' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    await expect(requestApiJson('/api/items')).rejects.toThrow('boom')
  })

  it('ignores non-string JSON error payloads', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 42 }), {
          status: 400,
          statusText: 'Bad request',
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    await expect(requestApiJson('/api/items')).rejects.toThrow('Bad request')
  })

  it('handles responses without a content type', async () => {
    globalThis.fetch = vi.fn(async () => {
      const response = new Response('', { status: 500, statusText: 'Nope' })
      response.headers.delete('content-type')
      return response
    }) as unknown as typeof fetch

    await expect(requestApiJson('/api/items')).rejects.toThrow('Nope')
  })

  it('skips connection headers when localStorage is unavailable', async () => {
    vi.stubGlobal('localStorage', undefined)
    try {
      const seen: RequestInit[] = []
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(init ?? {})
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }) as unknown as typeof fetch

      await requestApi('/api/query')

      expect(new Headers(seen[0]?.headers).has('X-OpenPOS-Connection')).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports unreachable servers without a configured base url', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch

    await expect(requestApi('/api/connections/assigned')).rejects.toThrow(
      'Cannot reach the API server. Check your internet connection and the configured API URL.',
    )
  })
})
