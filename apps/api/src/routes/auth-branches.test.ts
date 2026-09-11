import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  bcryptCompare,
  bcryptHash,
  connectionErrorStatus,
  execute,
  query,
  readAssignedConnection,
  readCurrentConnectionMeta,
  registerConnection,
  resolveDataPlane,
  signToken,
} = vi.hoisted(() => ({
  bcryptCompare: vi.fn(async (value: string, hash: string) => hash === `hashed:${value}`),
  bcryptHash: vi.fn(async (value: string) => `hashed:${value}`),
  connectionErrorStatus: vi.fn(() => 503),
  execute: vi.fn(async (_sql: string, _params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }> => ({
    lastInsertId: 1,
    rowsAffected: 1,
  })),
  query: vi.fn(async (_sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> => []),
  readAssignedConnection: vi.fn(async (): Promise<{ key: string } | null> => ({ key: 'OPK_assigned' })),
  readCurrentConnectionMeta: vi.fn(async (): Promise<{ key: string } | null> => ({ key: 'OPK_meta' })),
  registerConnection: vi.fn(async () => ({ dataPlane: { fake: 'plane2' } })),
  resolveDataPlane: vi.fn(async (): Promise<Record<string, unknown> | null> => ({ fake: 'plane' })),
  signToken: vi.fn(() => 'test-token'),
}))

vi.mock('bcryptjs', () => ({
  default: { compare: bcryptCompare, hash: bcryptHash },
}))

vi.mock('../lib/connection.js', () => ({
  connectionErrorStatus,
  readAssignedConnection,
  readCurrentConnectionMeta,
  registerConnection,
  resolveDataPlane,
}))

vi.mock('../lib/turso.js', () => ({
  createDataPlaneClient: (plane: unknown) => ({ plane }),
  execute,
  query,
  runWithDataPlane: (_client: unknown, fn: () => unknown) => fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('jwtPayload', { sub: '1', email: 'admin@example.com', role: 'admin' })
    await next()
  },
  signToken,
}))

const { authRouter } = await import('./auth.js')

function createApp() {
  const app = new Hono()
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
    for (const fn of [
      bcryptCompare,
      bcryptHash,
      connectionErrorStatus,
      execute,
      query,
      readAssignedConnection,
      readCurrentConnectionMeta,
      registerConnection,
      resolveDataPlane,
      signToken,
    ]) {
      fn.mockReset()
    }
    bcryptCompare.mockImplementation(async (value: string, hash: string) => hash === `hashed:${value}`)
    bcryptHash.mockImplementation(async (value: string) => `hashed:${value}`)
    connectionErrorStatus.mockReturnValue(503)
    query.mockResolvedValue([])
    readAssignedConnection.mockResolvedValue({ key: 'OPK_assigned' })
    readCurrentConnectionMeta.mockResolvedValue({ key: 'OPK_meta' })
    registerConnection.mockResolvedValue({ dataPlane: { fake: 'plane2' } })
    resolveDataPlane.mockResolvedValue({ fake: 'plane' })
    signToken.mockReturnValue('test-token')
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

  it('requires a store connection', async () => {
    readAssignedConnection.mockResolvedValueOnce(null)
    const res = await createApp().request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: 'ada@example.com', password: 'x' }),
    })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Store connection required' })
  })

  it('registers unknown stores with an admin-name fallback', async () => {
    resolveDataPlane.mockResolvedValueOnce(null)
    query.mockResolvedValueOnce([dbUser()])
    const res = await createApp().request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: '@example.com', password: 'Admin123!' }),
    })

    expect(res.status).toBe(200)
    expect(registerConnection).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'OPK_assigned', adminName: 'Admin' }),
    )
  })

  it('maps store registration failures', async () => {
    const app = createApp()
    resolveDataPlane.mockResolvedValue(null)

    registerConnection.mockRejectedValueOnce(new Error('nope'))
    const failed = await app.request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: 'ada@example.com', password: 'x' }),
    })
    expect(failed.status).toBe(503)
    expect(await failed.json()).toEqual({ error: 'nope' })

    registerConnection.mockRejectedValueOnce('boom')
    const nonError = await app.request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: 'ada@example.com', password: 'x' }),
    })
    expect(nonError.status).toBe(503)
    expect(await nonError.json()).toEqual({ error: 'Unable to register store' })
  })

  it('rejects non-numeric PIN user ids', async () => {
    const res = await createApp().request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ userId: 'abc', pin: '123456' }),
    })
    expect(res.status).toBe(401)
  })

  it('signs in with a PIN and binds the connection key', async () => {
    query.mockResolvedValueOnce([dbUser({ pin_enabled: 1, pin_hash: 'hashed:123456' })])
    const res = await createApp().request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ userId: '1', pin: '123456' }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string; user: { pinEnabled: boolean } }
    expect(body.token).toBe('test-token')
    expect(body.user.pinEnabled).toBe(true)
    expect(signToken).toHaveBeenCalledWith(expect.objectContaining({ connectionKey: 'OPK_meta' }))
  })

  it('omits the connection key when no connection is assigned', async () => {
    readCurrentConnectionMeta.mockResolvedValueOnce(null)
    query.mockResolvedValueOnce([dbUser()])
    const res = await createApp().request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email: 'ada@example.com', password: 'Admin123!' }),
    })

    expect(res.status).toBe(200)
    expect(signToken).toHaveBeenCalledWith(expect.not.objectContaining({ connectionKey: expect.anything() }))
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
