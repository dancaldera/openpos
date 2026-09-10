import { generateConnectionKey } from '@openpos/data'
import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { readAssignedConnection, resolveDataPlane, createDataPlaneClient, runWithDataPlane } = vi.hoisted(() => ({
  readAssignedConnection: vi.fn(),
  resolveDataPlane: vi.fn(),
  createDataPlaneClient: vi.fn(),
  runWithDataPlane: vi.fn(),
}))

vi.mock('../lib/connection.js', () => ({
  readAssignedConnection,
  resolveDataPlane,
}))

vi.mock('../lib/turso.js', () => ({
  createDataPlaneClient,
  runWithDataPlane,
}))

const { dataPlaneMiddleware } = await import('./data-plane.js')

const savedSecret = process.env.JWT_SECRET

beforeEach(() => {
  process.env.JWT_SECRET = 'data-plane-test-secret'
  readAssignedConnection.mockReset().mockResolvedValue(null)
  resolveDataPlane.mockReset().mockResolvedValue({ url: 'libsql://test', authToken: 'token' })
  createDataPlaneClient.mockImplementation((config: unknown) => ({ config }))
  runWithDataPlane.mockImplementation((_client: unknown, run: () => unknown) => run())
})

afterEach(() => {
  if (savedSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = savedSecret
})

function createApp() {
  const app = new Hono()
  app.use('/*', dataPlaneMiddleware)
  app.get('/api/query', (c) => c.json({ ok: true }))
  app.get('/api/auth/login', (c) => c.json({ ok: true }))
  app.post('/api/auth/login', (c) => c.json({ ok: true }))
  app.get('/api/settings/public', (c) => c.json({ ok: true }))
  app.get('/api/auth/hash', (c) => c.json({ ok: true }))
  app.get('/health', (c) => c.json({ ok: true }))
  return app
}

function bearer(payload: Record<string, unknown>) {
  return `Bearer ${jwt.sign(payload, 'data-plane-test-secret')}`
}

describe('dataPlaneMiddleware', () => {
  it('skips exempt and non-data paths', async () => {
    const app = createApp()

    for (const path of ['/api/auth/hash', '/health']) {
      const res = await app.request(path)
      expect(res.status).toBe(200)
    }
    expect(readAssignedConnection).not.toHaveBeenCalled()
  })

  it('rejects data paths without an authorization header', async () => {
    const app = createApp()

    const res = await app.request('/api/query')
    expect(res.status).toBe(401)

    const malformed = await app.request('/api/query', { headers: { Authorization: 'Token x' } })
    expect(malformed.status).toBe(401)
  })

  it('resolves the data plane from the connection header', async () => {
    const app = createApp()
    const key = generateConnectionKey()

    const res = await app.request('/api/query', {
      headers: { Authorization: bearer({ sub: '1' }), 'X-OpenPOS-Connection': key },
    })

    expect(res.status).toBe(200)
    expect(resolveDataPlane).toHaveBeenCalledWith(key)
    expect(createDataPlaneClient).toHaveBeenCalledWith({ url: 'libsql://test', authToken: 'token' })
    expect(runWithDataPlane).toHaveBeenCalledTimes(1)
  })

  it('falls back to the connection key inside the token', async () => {
    const app = createApp()
    const key = generateConnectionKey()

    const res = await app.request('/api/query', {
      headers: { Authorization: bearer({ sub: '1', connectionKey: key }) },
    })

    expect(res.status).toBe(200)
    expect(resolveDataPlane).toHaveBeenCalledWith(key)
  })

  it('falls back to the assigned store when the token has no key', async () => {
    const app = createApp()
    const key = generateConnectionKey()
    readAssignedConnection.mockResolvedValue({ key })

    const res = await app.request('/api/query', { headers: { Authorization: bearer({ sub: '1' }) } })

    expect(res.status).toBe(200)
    expect(resolveDataPlane).toHaveBeenCalledWith(key)
  })

  it('ignores invalid tokens and uses the assigned store', async () => {
    const app = createApp()
    const key = generateConnectionKey()
    readAssignedConnection.mockResolvedValue({ key })

    const res = await app.request('/api/query', { headers: { Authorization: 'Bearer not-a-token' } })

    expect(res.status).toBe(200)
    expect(resolveDataPlane).toHaveBeenCalledWith(key)
  })

  it('lets public paths reach the assigned store without auth', async () => {
    const app = createApp()
    const key = generateConnectionKey()
    readAssignedConnection.mockResolvedValue({ key })

    const res = await app.request('/api/settings/public')

    expect(res.status).toBe(200)
    expect(resolveDataPlane).toHaveBeenCalledWith(key)
  })

  it('requires a store connection when nothing resolves', async () => {
    const app = createApp()

    const res = await app.request('/api/settings/public')

    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: string }).error).toBe('Store connection required')
  })

  it('lets login through when the store is unknown', async () => {
    const app = createApp()
    const key = generateConnectionKey()
    resolveDataPlane.mockResolvedValue(null)

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { Authorization: bearer({ sub: '1' }), 'X-OpenPOS-Connection': key },
    })

    expect(res.status).toBe(200)
  })

  it('rejects unknown stores on protected paths', async () => {
    const app = createApp()
    const key = generateConnectionKey()
    resolveDataPlane.mockResolvedValue(null)

    const res = await app.request('/api/query', {
      headers: { Authorization: bearer({ sub: '1' }), 'X-OpenPOS-Connection': key },
    })

    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: string }).error).toBe('connection_not_found')
  })
})
