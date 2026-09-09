import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { execute, query, mockJwtPayload, mockHash } = vi.hoisted(() => ({
  execute: vi.fn(async () => ({ lastInsertId: 1, rowsAffected: 1 })),
  query: vi.fn(async () => []),
  mockJwtPayload: { value: { sub: '1', permissions: ['*'] } },
  mockHash: vi.fn(async (value: string) => `hashed:${value}`),
}))

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('jwtPayload', mockJwtPayload.value)
    await next()
  },
}))

vi.mock('../lib/turso.js', () => ({
  execute,
  query,
}))

vi.mock('bcryptjs', () => ({
  default: { hash: mockHash },
}))

const { usersRouter } = await import('./users.js')

function createApp() {
  const app = new Hono()
  app.route('/api/users', usersRouter)
  return app
}

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    email: 'ada@example.com',
    password: 'hashed:x',
    name: 'Ada',
    role: 'user',
    permissions: '["sales.view"]',
    created_at: '2026-01-01T00:00:00.000Z',
    last_login: null,
    deleted_at: null,
    password_hashed: 1,
    pin_enabled: 0,
    pin_hash: null,
    ...overrides,
  }
}

describe('usersRouter', () => {
  beforeEach(() => {
    execute.mockReset()
    query.mockReset()
    mockHash.mockClear()
    execute.mockResolvedValue({ lastInsertId: 2, rowsAffected: 1 })
    query.mockResolvedValue([])
    mockJwtPayload.value = { sub: '1', permissions: ['*'] }
  })

  it.each([
    { method: 'GET', path: '/api/users', permission: 'users.view' },
    { method: 'POST', path: '/api/users', permission: 'users.create' },
    { method: 'PUT', path: '/api/users/2', permission: 'users.edit' },
    { method: 'DELETE', path: '/api/users/2', permission: 'users.delete' },
  ])('enforces $permission on $method $path', async ({ method, path, permission }) => {
    const app = createApp()
    query.mockResolvedValue([])

    mockJwtPayload.value = { sub: '1', permissions: [] }
    const denied = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({}),
    })
    expect(denied.status).toBe(403)

    mockJwtPayload.value = { sub: '1', permissions: [permission] }
    const allowed = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({}),
    })
    expect(allowed.status).not.toBe(403)
  })

  it('lists users with paging and empty counts', async () => {
    query.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([dbUser({ pin_enabled: 1, pin_hash: 'hashed:123456' })])
    const app = createApp()

    const res = await app.request('/api/users?page=2&limit=10')
    const body = (await res.json()) as { users: Array<{ pinEnabled: boolean }>; totalCount: number; page: number }

    expect(res.status).toBe(200)
    expect(body.totalCount).toBe(1)
    expect(body.page).toBe(2)
    expect(body.users[0].pinEnabled).toBe(true)

    query.mockReset()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const empty = await app.request('/api/users')
    expect(((await empty.json()) as { totalCount: number }).totalCount).toBe(0)
  })

  it('gets a single user or 404s', async () => {
    query.mockResolvedValueOnce([dbUser({ pin_enabled: 1, pin_hash: null })])
    const app = createApp()

    const found = await app.request('/api/users/2')
    expect(found.status).toBe(200)
    expect(((await found.json()) as { user: { pinEnabled: boolean } }).user.pinEnabled).toBe(false)

    query.mockReset()
    query.mockResolvedValueOnce([])
    const missing = await app.request('/api/users/3')
    expect(missing.status).toBe(404)
  })

  it('creates users with hashed passwords and default permissions', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([dbUser()])
    const app = createApp()

    const res = await app.request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'Ada@Example.com', name: 'Ada', role: 'manager', password: 'Str0ng!pass' }),
    })

    expect(res.status).toBe(201)
    expect(mockHash).toHaveBeenCalledWith('Str0ng!pass', 12)
    const params = execute.mock.calls[0][1] as unknown[]
    expect(params[0]).toBe('ada@example.com')
    expect(params[1]).toBe('hashed:Str0ng!pass')
    expect(JSON.parse(params[4] as string)).toContain('users.view')
  })

  it('creates users with a PIN and falls back for unknown roles', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([dbUser()])
    const app = createApp()

    const res = await app.request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'b@example.com',
        name: 'B',
        role: 'weird',
        password: 'Str0ng!pass',
        pinEnabled: true,
        pin: '123456',
      }),
    })

    expect(res.status).toBe(201)
    expect(mockHash).toHaveBeenCalledWith('123456', 12)
    const params = execute.mock.calls[0][1] as unknown[]
    expect(JSON.parse(params[4] as string)).toEqual(['sales.view', 'sales.create', 'products.view'])
    expect(params.slice(5)).toEqual([expect.any(String), expect.any(String), 1, 'hashed:123456'])
  })

  it('rejects duplicate emails, weak passwords, and bad PINs', async () => {
    const app = createApp()

    query.mockResolvedValueOnce([{ id: 9 }])
    const duplicate = await app.request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', name: 'A', role: 'user', password: 'Str0ng!pass' }),
    })
    expect(duplicate.status).toBe(409)

    query.mockReset()
    query.mockResolvedValueOnce([])
    const weak = await app.request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', name: 'A', role: 'user', password: 'weak' }),
    })
    expect(weak.status).toBe(400)

    query.mockReset()
    query.mockResolvedValueOnce([])
    const badPin = await app.request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', name: 'A', role: 'user', password: 'Str0ng!pass', pinEnabled: true, pin: '12' }),
    })
    expect(badPin.status).toBe(400)

    query.mockReset()
    query.mockResolvedValueOnce([])
    const missingPin = await app.request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', name: 'A', role: 'user', password: 'Str0ng!pass', pinEnabled: true }),
    })
    expect(missingPin.status).toBe(400)
  })

  it('updates user fields selectively', async () => {
    query.mockResolvedValueOnce([dbUser()])
    const app = createApp()

    const res = await app.request('/api/users/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New', email: 'New@Example.com', role: 'manager', password: 'Str0ng!pass' }),
    })

    expect(res.status).toBe(200)
    const [sql, params] = execute.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('name = ?')
    expect(sql).toContain('permissions = ?')
    expect(sql).toContain('password_hashed = 1')
    expect(params).toContain('new@example.com')
    expect(params).toContain('hashed:Str0ng!pass')
  })

  it('falls back to user permissions for unmapped roles on update', async () => {
    query.mockResolvedValueOnce([dbUser()])
    const app = createApp()

    const res = await app.request('/api/users/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'weird' }),
    })

    expect(res.status).toBe(200)
    const params = execute.mock.calls[0][1] as unknown[]
    expect(params[0]).toBe('weird')
    expect(JSON.parse(params[1] as string)).toEqual(['sales.view', 'sales.create', 'products.view'])
  })

  it('rejects weak passwords on update', async () => {
    const app = createApp()

    const res = await app.request('/api/users/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'weak' }),
    })

    expect(res.status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
  })

  it('disables PINs and sets new ones', async () => {
    const app = createApp()

    query.mockResolvedValueOnce([dbUser()])
    const disabled = await app.request('/api/users/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinEnabled: false }),
    })
    expect(disabled.status).toBe(200)
    expect((execute.mock.calls[0][1] as unknown[]).slice(0, 2)).toEqual([0, null])

    query.mockReset()
    query.mockResolvedValueOnce([dbUser()])
    const withPin = await app.request('/api/users/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '654321' }),
    })
    expect(withPin.status).toBe(200)
    expect(mockHash).toHaveBeenCalledWith('654321', 12)

    query.mockReset()
    query.mockResolvedValueOnce([dbUser()])
    const badPin = await app.request('/api/users/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinEnabled: true, pin: '12' }),
    })
    expect(badPin.status).toBe(400)
  })

  it('enables PINs only when a hash already exists', async () => {
    const app = createApp()

    query.mockResolvedValueOnce([{ pin_hash: 'hashed:123456' }]).mockResolvedValueOnce([dbUser()])
    const enabled = await app.request('/api/users/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinEnabled: true }),
    })
    expect(enabled.status).toBe(200)

    query.mockReset()
    query.mockResolvedValueOnce([{ pin_hash: null }])
    const noHash = await app.request('/api/users/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinEnabled: true }),
    })
    expect(noHash.status).toBe(400)

    query.mockReset()
    query.mockResolvedValueOnce([])
    const noRow = await app.request('/api/users/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinEnabled: true }),
    })
    expect(noRow.status).toBe(400)
  })

  it('updates nothing for empty bodies and 404s missing users', async () => {
    const app = createApp()

    query.mockResolvedValueOnce([dbUser()])
    const empty = await app.request('/api/users/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(empty.status).toBe(200)
    expect(execute).not.toHaveBeenCalled()

    query.mockReset()
    query.mockResolvedValueOnce([])
    const missing = await app.request('/api/users/3', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    expect(missing.status).toBe(404)
  })

  it('deletes users but never self', async () => {
    const app = createApp()

    const deleted = await app.request('/api/users/2', { method: 'DELETE' })
    expect(deleted.status).toBe(200)

    const selfDelete = await app.request('/api/users/1', { method: 'DELETE' })
    expect(selfDelete.status).toBe(400)

    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })
    const missing = await app.request('/api/users/3', { method: 'DELETE' })
    expect(missing.status).toBe(404)
  })
})
