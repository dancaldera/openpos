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

const requestApiJson = mock(async () => ({
  user: {
    id: '1',
    email: 'ana@example.com',
    name: 'Ana',
    role: 'admin' as const,
    permissions: ['*'],
    createdAt: '2026-03-27T00:00:00.000Z',
  },
}))

mock.module('../lib/api-client', () => ({
  requestApiJson,
}))

mock.module('../lib/db-adapter', () => ({
  execute: mock(async () => ({ lastInsertId: 0, rowsAffected: 0 })),
  query: mock(async () => []),
}))

mock.module('../lib/desktop', () => ({
  requireDesktopApi: mock(() => {
    throw new Error('Desktop API should not be used in web mode tests')
  }),
}))

mock.module('../lib/platform', () => ({
  isDesktop: false,
}))

const { AuthService } = await import('./auth-turso')
const { AuthExpiredError } = await import('../lib/auth-session')

describe('AuthService.restoreCurrentUser', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    service.signOut()
    requestApiJson.mockReset()
  })

  it('validates the stored token and refreshes the persisted user from /api/auth/me', async () => {
    storage.setItem(
      'pos_user',
      JSON.stringify({
        id: 'stale',
        email: 'stale@example.com',
        name: 'Stale User',
        role: 'user',
        permissions: [],
        createdAt: '',
      }),
    )
    storage.setItem('auth_token', 'valid-token')
    requestApiJson.mockImplementation(async () => ({
      user: {
        id: '1',
        email: 'ana@example.com',
        name: 'Ana',
        role: 'admin',
        permissions: ['*'],
        createdAt: '2026-03-27T00:00:00.000Z',
      },
    }))

    const restoredUser = await service.restoreCurrentUser()

    expect(requestApiJson).toHaveBeenCalledWith('/api/auth/me', { requireAuth: true })
    expect(restoredUser?.email).toBe('ana@example.com')
    expect(storage.getItem('pos_user')).toBe(
      JSON.stringify({
        id: '1',
        email: 'ana@example.com',
        name: 'Ana',
        role: 'admin',
        permissions: ['*'],
        createdAt: '2026-03-27T00:00:00.000Z',
      }),
    )
  })

  it('clears persisted auth when the stored token is expired', async () => {
    storage.setItem(
      'pos_user',
      JSON.stringify({
        id: '1',
        email: 'ana@example.com',
        name: 'Ana',
        role: 'admin',
        permissions: ['*'],
        createdAt: '2026-03-27T00:00:00.000Z',
      }),
    )
    storage.setItem('auth_token', 'expired-token')
    requestApiJson.mockImplementation(async () => {
      throw new AuthExpiredError()
    })

    const restoredUser = await service.restoreCurrentUser()

    expect(restoredUser).toBeNull()
    expect(storage.getItem('auth_token')).toBeNull()
    expect(storage.getItem('pos_user')).toBeNull()
  })
})
