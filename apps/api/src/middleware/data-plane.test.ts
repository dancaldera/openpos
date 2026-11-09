import { generateConnectionKey } from '@openpos/data'
import { type Handler, Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../types.js'

const { resolveStore, resolveRequestStore, createDataPlaneClient, runWithDataPlane } = vi.hoisted(() => ({
  resolveStore: vi.fn(),
  resolveRequestStore: vi.fn(),
  createDataPlaneClient: vi.fn(),
  runWithDataPlane: vi.fn(),
}))

vi.mock('../lib/stores.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/stores.js')>()),
  resolveStore,
  resolveRequestStore,
}))

vi.mock('../lib/turso.js', () => ({
  createDataPlaneClient,
  runWithDataPlane,
}))

const { dataPlaneMiddleware } = await import('./data-plane.js')
const { signToken } = await import('./auth.js')

const savedSecret = process.env.JWT_SECRET
const dataPlane = { url: 'libsql://test', authToken: 'token' }

function resolved(id: string) {
  return { store: { id, name: `Store ${id}`, slug: id }, dataPlane }
}

beforeEach(() => {
  process.env.JWT_SECRET = 'data-plane-test-secret'
  resolveStore.mockReset().mockResolvedValue(null)
  resolveRequestStore.mockReset().mockResolvedValue(null)
  createDataPlaneClient.mockReset().mockImplementation((config: unknown) => ({ config }))
  runWithDataPlane.mockReset().mockImplementation((_client: unknown, run: () => unknown) => run())
})

afterEach(() => {
  if (savedSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = savedSecret
})

function createApp() {
  const app = new Hono<AppEnv>()
  app.use('/*', dataPlaneMiddleware)
  const echo: Handler<AppEnv> = (c) => c.json({ store: c.get('store') ?? null })
  app.get('/api/query', echo)
  app.get('/api/settings', echo)
  app.get('/api/settings/public', echo)
  app.post('/api/auth/login', echo)
  app.get('/api/connections/current', echo)
  app.get('/api/auth/hash', echo)
  app.get('/api/health', echo)
  return app
}

async function bearer(extra: Record<string, unknown> = {}) {
  const token = await signToken({ sub: '1', email: 'a@b.c', name: 'Ada', role: 'admin', permissions: [], ...extra })
  return `Bearer ${token}`
}

describe('dataPlaneMiddleware', () => {
  it('skips exempt and non-data paths', async () => {
    const app = createApp()

    for (const path of ['/api/auth/hash', '/api/health']) {
      const res = await app.request(path)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ store: null })
    }
    expect(resolveStore).not.toHaveBeenCalled()
    expect(resolveRequestStore).not.toHaveBeenCalled()
    expect(runWithDataPlane).not.toHaveBeenCalled()
  })

  it('rejects protected paths without a bearer token', async () => {
    const app = createApp()

    for (const headers of [{}, { Authorization: 'Token x' }]) {
      const res = await app.request('/api/query', { headers })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Missing or invalid Authorization header' })
    }
    expect(resolveRequestStore).not.toHaveBeenCalled()
  })

  it('rejects invalid tokens on protected paths', async () => {
    const res = await createApp().request('/api/settings', { headers: { Authorization: 'Bearer not-a-token' } })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Invalid or expired token' })
  })

  it('binds sessions to the store id inside the token', async () => {
    resolveStore.mockResolvedValue(resolved('store-1'))
    resolveRequestStore.mockResolvedValue(resolved('other'))

    const res = await createApp().request('/api/query', {
      headers: { Authorization: await bearer({ storeId: 'store-1' }), 'X-OpenPOS-Connection': generateConnectionKey() },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ store: { id: 'store-1', name: 'Store store-1', slug: 'store-1' } })
    expect(resolveStore).toHaveBeenCalledWith({ id: 'store-1' })
    expect(resolveRequestStore).not.toHaveBeenCalled()
    expect(createDataPlaneClient).toHaveBeenCalledWith(dataPlane)
    expect(runWithDataPlane).toHaveBeenCalledTimes(1)
  })

  it('binds legacy sessions by the connection key inside the token', async () => {
    const key = generateConnectionKey()
    resolveStore.mockResolvedValue(resolved('legacy'))

    const res = await createApp().request('/api/query', {
      headers: { Authorization: await bearer({ connectionKey: key }) },
    })

    expect(res.status).toBe(200)
    expect(resolveStore).toHaveBeenCalledWith({ key })
  })

  it('reports token-bound stores that no longer resolve', async () => {
    const res = await createApp().request('/api/query', {
      headers: { Authorization: await bearer({ storeId: 'gone' }) },
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'connection_not_found' })
    expect(resolveRequestStore).not.toHaveBeenCalled()
  })

  it('falls back to the request store when the token has no store binding', async () => {
    resolveRequestStore.mockResolvedValue(resolved('by-host'))

    const res = await createApp().request('/api/query', { headers: { Authorization: await bearer() } })

    expect(res.status).toBe(200)
    expect(((await res.json()) as { store: { id: string } }).store.id).toBe('by-host')
    expect(resolveStore).not.toHaveBeenCalled()
    expect(resolveRequestStore).toHaveBeenCalledTimes(1)
  })

  it('lets public paths resolve the request store without auth', async () => {
    resolveRequestStore.mockResolvedValue(resolved('public'))
    const app = createApp()

    for (const path of ['/api/settings/public', '/api/connections/current']) {
      const res = await app.request(path)
      expect(res.status).toBe(200)
      expect(((await res.json()) as { store: { id: string } }).store.id).toBe('public')
    }

    const login = await app.request('/api/auth/login', { method: 'POST' })
    expect(login.status).toBe(200)
  })

  it('ignores invalid tokens on public paths', async () => {
    resolveRequestStore.mockResolvedValue(resolved('public'))

    const res = await createApp().request('/api/auth/login', {
      method: 'POST',
      headers: { Authorization: 'Bearer not-a-token' },
    })

    expect(res.status).toBe(200)
    expect(resolveStore).not.toHaveBeenCalled()
    expect(resolveRequestStore).toHaveBeenCalledTimes(1)
  })

  it('reports unknown connection keys sent in the header', async () => {
    const res = await createApp().request('/api/auth/login', {
      method: 'POST',
      headers: { 'X-OpenPOS-Connection': generateConnectionKey() },
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'connection_not_found' })
  })

  it('requires a store connection when nothing resolves', async () => {
    const app = createApp()

    const res = await app.request('/api/settings/public')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Store connection required' })

    const invalidKey = await app.request('/api/settings/public', { headers: { 'X-OpenPOS-Connection': 'nope' } })
    expect(invalidKey.status).toBe(401)

    const authed = await app.request('/api/query', { headers: { Authorization: await bearer() } })
    expect(authed.status).toBe(401)
    expect(await authed.json()).toEqual({ error: 'Store connection required' })
  })
})
