import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetApiUrlCacheForTests } from '../lib/api-config'
import {
  CONNECTION_KEY_STORAGE,
  clearLocalClientState,
  clearStoredConnectionKey,
  connectWithKey,
  fetchCurrentStore,
  getStoredConnectionKey,
  resolveWebStore,
  storeConnectionKey,
} from './connections'

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

const STORE = { id: 'store-1', name: 'Harbor', slug: 'harbor' }

function mockFetch(...responses: Array<() => Response>) {
  const fetchMock = vi.fn()
  for (const response of responses) {
    fetchMock.mockImplementationOnce(async () => response())
  }
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

function sentConnectionHeader(fetchMock: ReturnType<typeof vi.fn>, call = 0): string | null {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined
  return new Headers(init?.headers).get('X-OpenPOS-Connection')
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  globalThis.localStorage = storage as unknown as Storage
  resetApiUrlCacheForTests()
  Reflect.deleteProperty(globalThis, 'window')
})

describe('fetchCurrentStore', () => {
  it('returns the store the API serves', async () => {
    const fetchMock = mockFetch(() => new Response(JSON.stringify({ store: STORE }), { status: 200 }))

    await expect(fetchCurrentStore()).resolves.toEqual(STORE)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/connections/current')
  })

  it('returns null when the API has no store for this client', async () => {
    mockFetch(
      () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
      () => new Response(JSON.stringify({ error: 'connection_not_found' }), { status: 404 }),
    )

    await expect(fetchCurrentStore()).resolves.toBeNull()
    await expect(fetchCurrentStore()).resolves.toBeNull()
  })

  it('surfaces the JSON error for other failures', async () => {
    mockFetch(() => new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }))

    await expect(fetchCurrentStore()).rejects.toThrow('Server error')
  })

  it('falls back to the raw body, then a default message', async () => {
    mockFetch(
      () => new Response('Bad Gateway', { status: 502 }),
      () => new Response(JSON.stringify({ error: 42 }), { status: 500 }),
      () => new Response(JSON.stringify({ error: '' }), { status: 500 }),
      () => new Response('', { status: 500 }),
    )

    await expect(fetchCurrentStore()).rejects.toThrow('Bad Gateway')
    await expect(fetchCurrentStore()).rejects.toThrow('{"error":42}')
    await expect(fetchCurrentStore()).rejects.toThrow('{"error":""}')
    await expect(fetchCurrentStore()).rejects.toThrow('Unable to load the store')
  })

  it('uses the default message when the error body cannot be read', async () => {
    const broken = new Response('ignored', { status: 500 })
    vi.spyOn(broken, 'text').mockRejectedValue(new Error('stream broken'))
    mockFetch(() => broken)

    await expect(fetchCurrentStore()).rejects.toThrow('Unable to load the store')
  })
})

describe('resolveWebStore', () => {
  it('returns the store without touching a working key', async () => {
    storage.setItem(CONNECTION_KEY_STORAGE, 'OPK_saved')
    const fetchMock = mockFetch(() => new Response(JSON.stringify({ store: STORE }), { status: 200 }))

    await expect(resolveWebStore()).resolves.toEqual(STORE)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBe('OPK_saved')
  })

  it('returns null without retrying when no key is stored', async () => {
    const fetchMock = mockFetch(() => new Response('', { status: 404 }))

    await expect(resolveWebStore()).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('forgets a stale key and retries with the page host', async () => {
    storage.setItem(CONNECTION_KEY_STORAGE, 'OPK_stale')
    const fetchMock = mockFetch(
      () => new Response('', { status: 404 }),
      () => new Response(JSON.stringify({ store: STORE }), { status: 200 }),
    )

    await expect(resolveWebStore()).resolves.toEqual(STORE)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sentConnectionHeader(fetchMock, 0)).toBe('OPK_stale')
    expect(sentConnectionHeader(fetchMock, 1)).toBeNull()
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBeNull()
  })

  it('returns null when the retry also finds no store', async () => {
    storage.setItem(CONNECTION_KEY_STORAGE, 'OPK_stale')
    mockFetch(
      () => new Response('', { status: 401 }),
      () => new Response('', { status: 404 }),
    )

    await expect(resolveWebStore()).resolves.toBeNull()
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBeNull()
  })
})

describe('connectWithKey on the web', () => {
  it('stores the trimmed key and returns the store name', async () => {
    const fetchMock = mockFetch(() => new Response(JSON.stringify({ store: STORE }), { status: 200 }))

    await expect(connectWithKey({ key: '  OPK_new  ' })).resolves.toEqual({ key: 'OPK_new', storeName: 'Harbor' })
    expect(sentConnectionHeader(fetchMock)).toBe('OPK_new')
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBe('OPK_new')
  })

  it('reports connection_not_found and clears the key when no store matches', async () => {
    mockFetch(() => new Response('', { status: 404 }))

    await expect(connectWithKey({ key: 'OPK_missing' })).rejects.toThrow('connection_not_found')
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBeNull()
  })

  it('restores the previous key when the new one fails', async () => {
    storage.setItem(CONNECTION_KEY_STORAGE, 'OPK_previous')
    mockFetch(() => new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }))

    await expect(connectWithKey({ key: 'OPK_new' })).rejects.toThrow('Server error')
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBe('OPK_previous')
  })
})

describe('connection key storage', () => {
  it('reads, writes, and clears the stored key', () => {
    expect(getStoredConnectionKey()).toBe('')
    storeConnectionKey('OPK_123')
    expect(getStoredConnectionKey()).toBe('OPK_123')
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBe('OPK_123')
    clearStoredConnectionKey()
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBeNull()
  })

  it('clears local client state including auth leftovers', () => {
    storage.setItem(CONNECTION_KEY_STORAGE, 'OPK_123')
    storage.setItem('pos_user', '{}')
    storage.setItem('auth_token', 'token')
    storage.setItem('desktop_remote_auth_status', '{}')
    storage.setItem('unrelated', 'kept')

    clearLocalClientState()

    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBeNull()
    expect(storage.getItem('pos_user')).toBeNull()
    expect(storage.getItem('auth_token')).toBeNull()
    expect(storage.getItem('desktop_remote_auth_status')).toBeNull()
    expect(storage.getItem('unrelated')).toBe('kept')
  })

  it('tolerates a missing localStorage', () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    try {
      expect(getStoredConnectionKey()).toBe('')
      expect(() => storeConnectionKey('OPK_123')).not.toThrow()
      expect(() => clearStoredConnectionKey()).not.toThrow()
      expect(() => clearLocalClientState()).not.toThrow()
    } finally {
      globalThis.localStorage = storage as unknown as Storage
    }
  })
})
