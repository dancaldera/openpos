import bcrypt from 'bcryptjs'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { execute, query } = vi.hoisted(() => ({
  execute: vi.fn(
    async (_sql: string, _params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }> => ({
      lastInsertId: 1,
      rowsAffected: 1,
    }),
  ),
  query: vi.fn(async (_sql: string, _params?: unknown[]): Promise<Array<Record<string, unknown>>> => []),
}))

vi.mock('../middleware/auth.js', () => ({
  signToken: vi.fn(() => 'test-token'),
  authMiddleware: async (c: unknown, next: () => Promise<void>) => {
    // biome-ignore lint/suspicious/noExplicitAny: test doubles Hono context
    ;(c as any).set('jwtPayload', {
      sub: '1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      permissions: ['*'],
    })
    await next()
  },
}))

vi.mock('../lib/turso.js', () => ({
  execute,
  query,
}))

process.env.JWT_SECRET = 'password-reset-test-secret'
process.env.INTERNAL_SECRET = 'operator-admin-secret'

const { authRouter } = await import('./auth')

function createApp() {
  const app = new Hono()
  app.route('/api/auth', authRouter)
  return app
}

beforeEach(() => {
  process.env.INTERNAL_SECRET = 'operator-admin-secret'
})

describe('POST /api/auth/verify-internal-secret', () => {
  beforeEach(() => {
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 })
  })

  it('requires the internal secret', async () => {
    const response = await createApp().request('/api/auth/verify-internal-secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)
  })

  it('rejects a wrong secret without touching the database', async () => {
    const response = await createApp().request('/api/auth/verify-internal-secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalSecret: 'wrong-secret' }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Invalid internal secret' })
    expect(query).not.toHaveBeenCalled()
  })

  it('reports when INTERNAL_SECRET is not configured', async () => {
    delete process.env.INTERNAL_SECRET

    const response = await createApp().request('/api/auth/verify-internal-secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalSecret: 'operator-admin-secret' }),
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Internal secret is not configured' })
  })

  it('accepts the configured secret', async () => {
    const response = await createApp().request('/api/auth/verify-internal-secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalSecret: 'operator-admin-secret' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ valid: true })
  })
})

describe('POST /api/auth/admin-reset-password', () => {
  beforeEach(() => {
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 })
  })

  it('requires email, password, and internal secret', async () => {
    const response = await createApp().request('/api/auth/admin-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', newPassword: 'NewPass1!' }),
    })

    expect(response.status).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects an invalid internal secret without looking up the user', async () => {
    const response = await createApp().request('/api/auth/admin-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
        newPassword: 'NewPass1!',
        internalSecret: 'wrong-secret',
      }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Invalid internal secret' })
    expect(query).not.toHaveBeenCalled()
  })

  it('reports when INTERNAL_SECRET is not configured', async () => {
    delete process.env.INTERNAL_SECRET

    const response = await createApp().request('/api/auth/admin-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
        newPassword: 'NewPass1!',
        internalSecret: 'operator-admin-secret',
      }),
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Internal secret is not configured' })
  })

  it('returns not found for unknown emails after a valid secret', async () => {
    query.mockResolvedValue([])

    const response = await createApp().request('/api/auth/admin-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'unknown@example.com',
        newPassword: 'NewPass1!',
        internalSecret: 'operator-admin-secret',
      }),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'User not found' })
  })

  it('resets the password when the internal secret matches', async () => {
    query.mockResolvedValueOnce([{ id: 7 }])

    const response = await createApp().request('/api/auth/admin-reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ADMIN@example.com',
        newPassword: 'NewPass1!',
        internalSecret: 'operator-admin-secret',
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(query.mock.calls[0]?.[1]).toEqual(['admin@example.com'])
    expect(execute.mock.calls[0]?.[1]?.[2]).toBe(7)
    await expect(bcrypt.compare('NewPass1!', execute.mock.calls[0]?.[1]?.[0] as string)).resolves.toBe(true)
  })
})
