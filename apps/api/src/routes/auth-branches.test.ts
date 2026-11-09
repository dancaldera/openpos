import type { StoreRecord } from '@openpos/control-plane'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../types.js'

const { bcryptCompare, bcryptHash, execute, query, signToken } = vi.hoisted(() => ({
  bcryptCompare: vi.fn(async (value: string, hash: string) => hash === `hashed:${value}`),
  bcryptHash: vi.fn(async (value: string) => `hashed:${value}`),
  execute: vi.fn(
    async (_sql: string, _params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }> => ({
      lastInsertId: 1,
      rowsAffected: 1,
    }),
  ),
  query: vi.fn(async (_sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> => []),
  signToken: vi.fn(async (_payload: Record<string, unknown>) => 'test-token'),
}))

vi.mock('bcryptjs', () => ({
  default: { compare: bcryptCompare, hash: bcryptHash },
}))

vi.mock('../lib/turso.js', () => ({
  execute,
  query,
}))

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('jwtPayload', { sub: '1', email: 'admin@example.com', role: 'admin' })
    await next()
  },
  signToken,
}))

const { authRouter } = await import('./auth.js')

const store: StoreRecord = {
  id: 'store-1',
  slug: 'shop',
  name: 'Shop',
  connectionKey: 'OPK_AAAA_AAAA_AAAA_AAAA',
  databaseName: 'openpos-shop',
  databaseUrl: 'libsql://shop',
  status: 'active',
  domains: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

// The data-plane middleware sets the request store before auth routes run.
function createApp() {
  const app = new Hono<AppEnv>()
  app.use('/*', async (c, next) => {
    c.set('store', store)
    await next()
  })
  app.route('/api/auth', authRouter)
  return app
}

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    email: 'ada@example.com',
    password: 'hashed:Admin123!',
    name: 'Ada',
    role: 'admin',
    permissions: '["*"]',
    created_at: '2026-01-01T00:00:00.000Z',
    last_login: null,
    deleted_at: null,
    password_hashed: 1,
    pin_enabled: 0,
    pin_hash: null,
    ...overrides,
  }
}

const jsonHeaders = { 'Content-Type': 'application/json' }

describe('authRouter branches', () => {
  beforeEach(() => {
    for (const fn of [bcryptCompare, bcryptHash, execute, query, signToken]) {
      fn.mockReset()
    }
    bcryptCompare.mockImplementation(async (value: string, hash: string) => hash === `hashed:${value}`)
    bcryptHash.mockImplementation(async (value: string) => `hashed:${value}`)
    query.mockResolvedValue([])
    signToken.mockResolvedValue('test-token')
  })

  it('rejects invalid JSON on login', async () => {
    const res = await createApp().request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{nope',
    })
    expect(res.status).toBe(400)
  })

  it('rejects malformed PINs and missing credentials', async () => {
    const app = createApp()

    const badPin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ userId: '1', pin: '12' }),
    })
    expect(badPin.status).toBe(401)

    const missing = await app.request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(missing.status).toBe(400)
  })

  it('rejects non-numeric PIN user ids', async () => {
    const res = await createApp().request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ userId: 'abc', pin: '123456' }),
    })
    expect(res.status).toBe(401)
  })

  it('signs in with a PIN and binds the token to the request store', async () => {
    query.mockResolvedValueOnce([dbUser({ pin_enabled: 1, pin_hash: 'hashed:123456' })])
    const res = await createApp().request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ userId: '1', pin: '123456' }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string; user: { pinEnabled: boolean }; store: unknown }
    expect(body.token).toBe('test-token')
    expect(body.user.pinEnabled).toBe(true)
    expect(body.store).toEqual({ id: 'store-1', name: 'Shop', slug: 'shop' })
    expect(signToken).toHaveBeenCalledWith(expect.objectContaining({ sub: '1', storeId: 'store-1' }))
    expect(signToken).toHaveBeenCalledWith(expect.not.objectContaining({ connectionKey: expect.anything() }))
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE users SET last_login'))).toBe(true)
  })

  it('rejects unknown, disabled, and wrong PINs', async () => {
    const app = createApp()
    const pinLogin = () =>
      app.request('/api/auth/login', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ userId: 1, pin: '123456' }),
      })

    query.mockResolvedValueOnce([])
    expect((await pinLogin()).status).toBe(401)

    query.mockResolvedValueOnce([dbUser({ pin_enabled: 0, pin_hash: 'hashed:123456' })])
    expect((await pinLogin()).status).toBe(401)

    query.mockResolvedValueOnce([dbUser({ pin_enabled: 1, pin_hash: 'hashed:654321' })])
    const wrong = await pinLogin()
    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toEqual({ error: 'Invalid PIN' })
    expect(signToken).not.toHaveBeenCalled()
  })

  it('signs in with email and password and returns the store', async () => {
    query.mockResolvedValueOnce([dbUser()])
    const res = await createApp().request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: ' Ada@Example.com ', password: 'Admin123!' }),
    })

    expect(res.status).toBe(200)
    expect(query.mock.calls[0]?.[1]).toEqual(['ada@example.com'])
    const body = (await res.json()) as { token: string; store: unknown; user: { permissions: string[] } }
    expect(body).toMatchObject({ token: 'test-token', store: { id: 'store-1', name: 'Shop', slug: 'shop' } })
    expect(body.user.permissions).toEqual(['*'])
    expect(signToken).toHaveBeenCalledWith(expect.objectContaining({ storeId: 'store-1', permissions: ['*'] }))
  })

  it('rejects unknown emails and wrong passwords', async () => {
    const app = createApp()

    query.mockResolvedValueOnce([])
    const unknown = await app.request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: 'nobody@example.com', password: 'x' }),
    })
    expect(unknown.status).toBe(401)

    query.mockReset()
    query.mockResolvedValueOnce([dbUser()])
    const wrong = await app.request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: 'ada@example.com', password: 'wrong' }),
    })
    expect(wrong.status).toBe(401)
  })

  it('lazy-migrates legacy plain-text passwords', async () => {
    query.mockResolvedValueOnce([dbUser({ password: 'legacy-pw', password_hashed: 0 })])
    const res = await createApp().request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: 'ada@example.com', password: 'legacy-pw' }),
    })

    expect(res.status).toBe(200)
    expect(bcryptHash).toHaveBeenCalledWith('legacy-pw', 12)
    const updateCall = query.mock.calls.find(([sql]) => String(sql).includes('password_hashed = 1'))
    expect(updateCall?.[1]).toEqual(['hashed:legacy-pw', 1])
  })

  it('rejects wrong legacy passwords without migrating', async () => {
    query.mockResolvedValueOnce([dbUser({ password: 'legacy-pw', password_hashed: 0 })])
    const res = await createApp().request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: 'ada@example.com', password: 'wrong' }),
    })

    expect(res.status).toBe(401)
    expect(bcryptHash).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('hashes passwords or rejects bad input', async () => {
    const app = createApp()

    const badJson = await app.request('/api/auth/hash', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{nope',
    })
    expect(badJson.status).toBe(400)

    const missing = await app.request('/api/auth/hash', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(missing.status).toBe(400)

    const hashed = await app.request('/api/auth/hash', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ password: 'secret' }),
    })
    expect(hashed.status).toBe(200)
    expect(await hashed.json()).toEqual({ hash: 'hashed:secret' })
  })

  it('verifies hashes or rejects bad input', async () => {
    const app = createApp()

    const badJson = await app.request('/api/auth/verify', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{nope',
    })
    expect(badJson.status).toBe(400)

    for (const body of [{}, { password: 'x' }, { hash: 'hashed:x' }]) {
      const missing = await app.request('/api/auth/verify', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      })
      expect(missing.status).toBe(400)
    }

    const valid = await app.request('/api/auth/verify', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ password: 'x', hash: 'hashed:x' }),
    })
    expect(valid.status).toBe(200)
    expect(await valid.json()).toEqual({ valid: true })

    const invalid = await app.request('/api/auth/verify', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ password: 'x', hash: 'hashed:y' }),
    })
    expect(await invalid.json()).toEqual({ valid: false })
  })

  it('rejects invalid JSON when verifying the internal secret', async () => {
    const res = await createApp().request('/api/auth/verify-internal-secret', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{nope',
    })
    expect(res.status).toBe(400)
  })

  it('returns the current user from JWT', async () => {
    const res = await createApp().request('/api/auth/me')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ user: { sub: '1', email: 'admin@example.com', role: 'admin' } })
  })

  it('rejects invalid JSON, empty, and weak admin resets', async () => {
    const app = createApp()

    const badJson = await app.request('/api/auth/admin-reset-password', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{nope',
    })
    expect(badJson.status).toBe(400)

    const empty = await app.request('/api/auth/admin-reset-password', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(empty.status).toBe(400)

    const weak = await app.request('/api/auth/admin-reset-password', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: 'admin@example.com', newPassword: 'weak', internalSecret: 's' }),
    })
    expect(weak.status).toBe(400)
  })
})
