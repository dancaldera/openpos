import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import app, { getServerPort, app as namedApp, startServer } from './index'
import { setControlPlaneForTests } from './lib/stores.js'

const { serve } = vi.hoisted(() => ({
  serve: vi.fn((_options: unknown, onListen: (info: { port: number }) => void) => {
    onListen({ port: 4321 })
    return { close: () => {} }
  }),
}))

vi.mock('@hono/node-server', () => ({ serve }))

const savedControlPlaneUrl = process.env.CONTROL_PLANE_URL
const savedDefaultStore = process.env.DEFAULT_STORE
const savedPort = process.env.PORT

// Without a control plane, store lookups fail; db-status must still answer.
beforeAll(() => {
  setControlPlaneForTests(null)
  delete process.env.CONTROL_PLANE_URL
  delete process.env.DEFAULT_STORE
})

afterAll(() => {
  if (savedControlPlaneUrl === undefined) delete process.env.CONTROL_PLANE_URL
  else process.env.CONTROL_PLANE_URL = savedControlPlaneUrl
  if (savedDefaultStore === undefined) delete process.env.DEFAULT_STORE
  else process.env.DEFAULT_STORE = savedDefaultStore
  if (savedPort === undefined) delete process.env.PORT
  else process.env.PORT = savedPort
})

describe('API app', () => {
  it('exports the shared app as default and named exports', () => {
    expect(namedApp).toBe(app)
  })

  it('reads the server port from PORT', () => {
    delete process.env.PORT
    expect(getServerPort()).toBe(3001)
    process.env.PORT = '4010'
    expect(getServerPort()).toBe(4010)
  })

  it('starts the Node server on all interfaces', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const server = await startServer(4321)
      expect(server).toEqual({ close: expect.any(Function) })
      expect(serve).toHaveBeenCalledWith({ fetch: app.fetch, port: 4321, hostname: '0.0.0.0' }, expect.any(Function))
      expect(log).toHaveBeenCalledWith('[API] Server running at http://localhost:4321')
    } finally {
      log.mockRestore()
    }
  })

  it('describes itself at the root', async () => {
    const response = await app.request('/')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ name: 'OpenPOS API', status: 'ok', health: '/api/health' })
  })

  it('returns a health payload', async () => {
    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    })
  })

  it('returns db status when no store connection is selected', async () => {
    const response = await app.request('/api/db-status', { headers: { Host: 'demo.openpos.xyz' } })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'error',
      mode: 'api',
      remoteConfigured: false,
      lastCheckedAt: expect.any(String),
    })
  })

  it('returns JSON for unknown routes', async () => {
    const response = await app.request('/api/does-not-exist')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'Route http://localhost/api/does-not-exist not found',
    })
  })

  it('protects product image routes with auth', async () => {
    const response = await app.request('/api/products/images/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keys: ['products/2026/03/example.jpg'] }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: 'Missing or invalid Authorization header',
    })
  })
})
