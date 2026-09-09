import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetApiUrlCacheForTests } from '../lib/api-config'
import { CONNECTION_KEY_STORAGE } from './connections'

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

const { bindWebAssignedConnection, fetchAssignedConnection } = await import('./connections')

describe('assigned web connection', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    resetApiUrlCacheForTests()
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('stores the API assigned store key', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ key: 'OPK_assigned', storeName: 'Harbor', published: true }), { status: 200 }),
    ) as unknown as typeof fetch

    await expect(bindWebAssignedConnection()).resolves.toEqual({
      key: 'OPK_assigned',
      storeName: 'Harbor',
      published: true,
    })
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBe('OPK_assigned')
  })

  it('clears a stale key when the API has no assigned store', async () => {
    storage.setItem(CONNECTION_KEY_STORAGE, 'OPK_stale')
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: 'connection_not_found' }), { status: 404 }),
    ) as unknown as typeof fetch

    await expect(fetchAssignedConnection()).resolves.toBeNull()
    await expect(bindWebAssignedConnection()).resolves.toBeNull()
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBeNull()
  })

  it('surfaces API failures other than a missing store', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    ) as unknown as typeof fetch

    await expect(bindWebAssignedConnection()).rejects.toThrow('Server error')
  })

  it('falls back to the raw body for non-JSON errors and empty bodies', async () => {
    globalThis.fetch = vi.fn(async () => new Response('Bad Gateway', { status: 502 })) as unknown as typeof fetch

    await expect(fetchAssignedConnection()).rejects.toThrow('Bad Gateway')

    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: 42 }), { status: 500 }),
    ) as unknown as typeof fetch

    await expect(fetchAssignedConnection()).rejects.toThrow('{"error":42}')

    globalThis.fetch = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch

    await expect(fetchAssignedConnection()).rejects.toThrow('Unable to load the assigned store')
  })
})

describe('connection key storage', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
  })

  it('reads, writes, and clears the stored key', async () => {
    const { clearStoredConnectionKey, getStoredConnectionKey, storeConnectionKey } = await import('./connections')

    expect(getStoredConnectionKey()).toBe('')
    storeConnectionKey('OPK_123')
    expect(getStoredConnectionKey()).toBe('OPK_123')
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBe('OPK_123')
    clearStoredConnectionKey()
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBeNull()
  })

  it('clears local client state including auth leftovers', async () => {
    const { clearLocalClientState } = await import('./connections')

    storage.setItem(CONNECTION_KEY_STORAGE, 'OPK_123')
    storage.setItem('pos_user', '{}')
    storage.setItem('auth_token', 'token')
    storage.setItem('desktop_remote_auth_status', '{}')

    clearLocalClientState()

    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBeNull()
    expect(storage.getItem('pos_user')).toBeNull()
    expect(storage.getItem('auth_token')).toBeNull()
    expect(storage.getItem('desktop_remote_auth_status')).toBeNull()
  })

  it('storage helpers tolerate a missing localStorage', async () => {
    const { clearLocalClientState, clearStoredConnectionKey, getStoredConnectionKey, storeConnectionKey } =
      await import('./connections')

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

describe('web store connections', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    resetApiUrlCacheForTests()
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('creates a store through the API and stores the key', async () => {
    const { createStoreConnection } = await import('./connections')

    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ key: 'OPK_new', storeName: 'Tienda', published: false }), { status: 200 }),
    ) as unknown as typeof fetch

    const result = await createStoreConnection({
      storeName: 'Tienda',
      adminName: 'Ana',
      adminEmail: 'ana@example.com',
      adminPassword: 'secret123',
    })

    expect(result.key).toBe('OPK_new')
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBe('OPK_new')
  })

  it('joins a store through the API and stores the key', async () => {
    const { joinStoreConnection } = await import('./connections')

    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ key: 'OPK_join', storeName: 'Tienda', published: true }), { status: 200 }),
    ) as unknown as typeof fetch

    const result = await joinStoreConnection({ key: 'OPK_join', seed: 'seed-words' })

    expect(result.key).toBe('OPK_join')
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBe('OPK_join')
  })

  it('imports a remote store through the API and stores the key', async () => {
    const { importStoreConnection } = await import('./connections')

    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ key: 'OPK_imp', storeName: 'Remote', published: true }), { status: 200 }),
    ) as unknown as typeof fetch

    const result = await importStoreConnection({ url: 'libsql://remote', authToken: 'token' })

    expect(result.key).toBe('OPK_imp')
    expect(storage.getItem(CONNECTION_KEY_STORAGE)).toBe('OPK_imp')
  })

  it('registers with the stored key and falls back to payload store name', async () => {
    const { registerStoreConnection } = await import('./connections')

    storage.setItem(CONNECTION_KEY_STORAGE, 'OPK_stored')
    let seenBody: Record<string, unknown> = {}
    globalThis.fetch = vi.fn(async (_url: unknown, init: unknown) => {
      seenBody = JSON.parse((init as { body: string }).body) as Record<string, unknown>
      return new Response(JSON.stringify({ key: 'OPK_stored', storeName: 'Fallback', published: true }), {
        status: 200,
      })
    }) as unknown as typeof fetch

    const result = await registerStoreConnection({ adminName: 'Ana' })

    expect(result.key).toBe('OPK_stored')
    expect(seenBody).toMatchObject({ key: 'OPK_stored', storeName: '' })
  })

  it('registers with an explicit store name', async () => {
    const { registerStoreConnection } = await import('./connections')

    storage.setItem(CONNECTION_KEY_STORAGE, 'OPK_stored')
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ key: 'OPK_stored', storeName: 'Explicit', published: true }), { status: 200 }),
    ) as unknown as typeof fetch

    const result = await registerStoreConnection({ storeName: 'Explicit' })

    expect(result.storeName).toBe('Explicit')
  })

  it('requires a stored key to register', async () => {
    const { registerStoreConnection } = await import('./connections')

    await expect(registerStoreConnection({})).rejects.toThrow('Store connection required')
  })

  it('bootstraps the owner through the API', async () => {
    const { bootstrapStoreOwner } = await import('./connections')

    storage.setItem(CONNECTION_KEY_STORAGE, 'OPK_stored')
    let seenBody: Record<string, unknown> = {}
    globalThis.fetch = vi.fn(async (_url: unknown, init: unknown) => {
      seenBody = JSON.parse((init as { body: string }).body) as Record<string, unknown>
      return new Response(JSON.stringify({ key: 'OPK_stored', storeName: 'Tienda', published: true }), {
        status: 200,
      })
    }) as unknown as typeof fetch

    const result = await bootstrapStoreOwner({
      storeName: 'Tienda',
      adminName: 'Ana',
      adminEmail: 'ana@example.com',
      adminPassword: 'secret123',
    })

    expect(seenBody).toMatchObject({ key: 'OPK_stored', storeName: 'Tienda' })
    expect(result).toMatchObject({ key: 'OPK_stored' })
  })
})
