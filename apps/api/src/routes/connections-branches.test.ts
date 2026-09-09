import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  bootstrapStoreOwner,
  createConnection,
  importRemoteConnection,
  joinConnection,
  readAssignedConnection,
  readCurrentConnectionMeta,
  registerConnection,
} = vi.hoisted(() => ({
  bootstrapStoreOwner: vi.fn(async () => ({ key: 'OPK_x', storeName: 'Shop' })),
  createConnection: vi.fn(async () => ({ key: 'OPK_x', seed: 'OPS_y', storeName: 'Shop' })),
  importRemoteConnection: vi.fn(async () => ({ key: 'OPK_x', seed: 'OPS_y', storeName: 'Shop' })),
  joinConnection: vi.fn(async () => ({ key: 'OPK_x', storeName: 'Shop' })),
  readAssignedConnection: vi.fn(async () => null),
  readCurrentConnectionMeta: vi.fn(async () => null),
  registerConnection: vi.fn(async () => ({ key: 'OPK_x', storeName: 'Shop', published: false })),
}))

vi.mock('../lib/connection.js', () => ({
  bootstrapStoreOwner,
  CONNECTION_ERRORS: { notFound: 'connection_not_found' },
  connectionErrorStatus: () => 500,
  createConnection,
  importRemoteConnection,
  joinConnection,
  readAssignedConnection,
  readCurrentConnectionMeta,
  registerConnection,
}))

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next()
  },
}))

const { connectionsRouter } = await import('./connections.js')

function createApp() {
  const app = new Hono()
  app.route('/api/connections', connectionsRouter)
  return app
}

const jsonHeaders = { 'Content-Type': 'application/json' }

describe('connectionsRouter branches', () => {
  beforeEach(() => {
    for (const fn of [
      bootstrapStoreOwner,
      createConnection,
      importRemoteConnection,
      joinConnection,
      readAssignedConnection,
      readCurrentConnectionMeta,
      registerConnection,
    ]) {
      fn.mockReset()
    }
    createConnection.mockResolvedValue({ key: 'OPK_x', seed: 'OPS_y', storeName: 'Shop' })
    joinConnection.mockResolvedValue({ key: 'OPK_x', storeName: 'Shop' })
    importRemoteConnection.mockResolvedValue({ key: 'OPK_x', seed: 'OPS_y', storeName: 'Shop' })
    registerConnection.mockResolvedValue({ key: 'OPK_x', storeName: 'Shop', published: false })
    bootstrapStoreOwner.mockResolvedValue({ key: 'OPK_x', storeName: 'Shop' })
    readCurrentConnectionMeta.mockResolvedValue(null)
  })

  it('creates stores with defaulted fields and maps errors', async () => {
    const app = createApp()

    const created = await app.request('/api/connections', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(created.status).toBe(201)
    expect(createConnection).toHaveBeenCalledWith({ storeName: '', adminName: '', adminEmail: '', adminPassword: '' })

    const badJson = await app.request('/api/connections', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{nope',
    })
    expect(badJson.status).toBe(400)

    createConnection.mockRejectedValueOnce(new Error('taken'))
    const failed = await app.request('/api/connections', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ storeName: 'S' }),
    })
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: 'taken' })

    createConnection.mockRejectedValueOnce('boom')
    const nonError = await app.request('/api/connections', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ storeName: 'S' }),
    })
    expect(nonError.status).toBe(500)
    expect(await nonError.json()).toEqual({ error: 'Unable to create store' })
  })

  it('joins with defaulted credentials and maps non-errors', async () => {
    const app = createApp()

    const joined = await app.request('/api/connections/join', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(joined.status).toBe(200)
    expect(joinConnection).toHaveBeenCalledWith({ key: '', seed: '' })

    const badJson = await app.request('/api/connections/join', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{nope',
    })
    expect(badJson.status).toBe(400)

    joinConnection.mockRejectedValueOnce('boom')
    const nonError = await app.request('/api/connections/join', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ key: 'k', seed: 's' }),
    })
    expect(nonError.status).toBe(500)
    expect(await nonError.json()).toEqual({ error: 'Unable to join store' })
  })

  it('imports with invalid JSON and maps non-errors', async () => {
    const app = createApp()

    const badJson = await app.request('/api/connections/import', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{nope',
    })
    expect(badJson.status).toBe(400)

    importRemoteConnection.mockRejectedValueOnce('boom')
    const nonError = await app.request('/api/connections/import', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ url: 'file:x' }),
    })
    expect(nonError.status).toBe(500)
    expect(await nonError.json()).toEqual({ error: 'Unable to import store' })
  })

  it('registers with defaulted keys and maps non-errors', async () => {
    const app = createApp()

    const registered = await app.request('/api/connections/register', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(registered.status).toBe(200)
    expect(registerConnection).toHaveBeenCalledWith({
      key: '',
      url: undefined,
      authToken: undefined,
      storeName: undefined,
      adminName: undefined,
      adminEmail: undefined,
      adminPassword: undefined,
    })

    const badJson = await app.request('/api/connections/register', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{nope',
    })
    expect(badJson.status).toBe(400)

    registerConnection.mockRejectedValueOnce('boom')
    const nonError = await app.request('/api/connections/register', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ key: 'k' }),
    })
    expect(nonError.status).toBe(500)
    expect(await nonError.json()).toEqual({ error: 'Unable to register store' })
  })

  it('bootstraps owners with defaults and maps errors', async () => {
    const app = createApp()

    const full = await app.request('/api/connections/owner', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        key: 'k',
        storeName: 'S',
        adminName: 'A',
        adminEmail: 'a@b.c',
        adminPassword: 'pw',
      }),
    })
    expect(full.status).toBe(200)
    expect(bootstrapStoreOwner).toHaveBeenCalledWith({
      key: 'k',
      storeName: 'S',
      adminName: 'A',
      adminEmail: 'a@b.c',
      adminPassword: 'pw',
    })

    bootstrapStoreOwner.mockClear()
    const empty = await app.request('/api/connections/owner', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(empty.status).toBe(200)
    expect(bootstrapStoreOwner).toHaveBeenCalledWith({
      key: '',
      storeName: '',
      adminName: '',
      adminEmail: '',
      adminPassword: '',
    })

    const badJson = await app.request('/api/connections/owner', {
      method: 'POST',
      headers: jsonHeaders,
      body: '{nope',
    })
    expect(badJson.status).toBe(400)

    bootstrapStoreOwner.mockRejectedValueOnce(new Error('taken'))
    const failed = await app.request('/api/connections/owner', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ key: 'k' }),
    })
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: 'taken' })

    bootstrapStoreOwner.mockRejectedValueOnce('boom')
    const nonError = await app.request('/api/connections/owner', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ key: 'k' }),
    })
    expect(nonError.status).toBe(500)
    expect(await nonError.json()).toEqual({ error: 'Unable to create owner' })
  })

  it('reads current connection metadata or 404s', async () => {
    const app = createApp()

    const missing = await app.request('/api/connections/current')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'connection_not_found' })

    readCurrentConnectionMeta.mockResolvedValueOnce({ key: 'OPK_x', storeName: 'Shop' })
    const found = await app.request('/api/connections/current')
    expect(found.status).toBe(200)
    expect(await found.json()).toEqual({ key: 'OPK_x', storeName: 'Shop' })
  })
})
