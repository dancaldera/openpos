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
})
