import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveStore, resolveRequestStore, query, execute, probeDataPlane } = vi.hoisted(() => ({
  resolveStore: vi.fn(),
  resolveRequestStore: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  probeDataPlane: vi.fn(),
}))

vi.mock('./lib/stores.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/stores.js')>()),
  resolveStore,
  resolveRequestStore,
}))

vi.mock('./lib/turso.js', () => ({
  createDataPlaneClient: (config: unknown) => ({ config }),
  runWithDataPlane: (_client: unknown, run: () => unknown) => run(),
  execute,
  probeDataPlane,
  query,
}))

const { app } = await import('./app.js')
const { default: worker } = await import('./worker.js')
const { signToken } = await import('./middleware/auth.js')

const savedSecret = process.env.JWT_SECRET
const dataPlane = { url: 'libsql://demo', authToken: 'token' }
const resolved = { store: { id: 'store-1', name: 'Demo', slug: 'demo' }, dataPlane }
const json = { 'Content-Type': 'application/json' }
let auth: Record<string, string>

beforeEach(async () => {
  process.env.JWT_SECRET = 'app-routes-test-secret'
  for (const fn of [resolveStore, resolveRequestStore, query, execute, probeDataPlane]) fn.mockReset()
  resolveStore.mockResolvedValue(resolved)
  resolveRequestStore.mockResolvedValue(resolved)
  auth = {
    ...json,
    Authorization: `Bearer ${await signToken({ sub: '1', email: 'a@b.c', name: 'Ada', role: 'admin', permissions: [], storeId: 'store-1' })}`,
  }
})

afterAll(() => {
  if (savedSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = savedSecret
})

describe('worker entry', () => {
  it('serves the shared app', () => {
    expect(worker.fetch).toBe(app.fetch)
  })
})

describe('GET /api/db-status', () => {
  it('reports reachable and unreachable store databases', async () => {
    probeDataPlane.mockResolvedValueOnce(true)
    const reachable = await app.request('/api/db-status')
    expect(await reachable.json()).toMatchObject({ status: 'remote', mode: 'api', remoteConfigured: true })
    expect(probeDataPlane).toHaveBeenCalledWith(dataPlane)

    probeDataPlane.mockResolvedValueOnce(false)
    const unreachable = await app.request('/api/db-status')
    expect(await unreachable.json()).toMatchObject({ status: 'error', remoteConfigured: true })
  })

  it('reports store lookup failures as unconfigured', async () => {
    resolveRequestStore.mockRejectedValueOnce(new Error('control plane down'))
    const response = await app.request('/api/db-status')
    expect(await response.json()).toMatchObject({ status: 'error', remoteConfigured: false })
    expect(probeDataPlane).not.toHaveBeenCalled()
  })
})

describe.each(['query', 'execute'] as const)('POST /api/%s', (route) => {
  const runner = route === 'query' ? query : execute

  it('requires a sql string', async () => {
    for (const body of [{}, { sql: 42 }]) {
      const response = await app.request(`/api/${route}`, { method: 'POST', headers: auth, body: JSON.stringify(body) })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'sql parameter is required and must be a string' })
    }
    expect(runner).not.toHaveBeenCalled()
  })

  it('runs statements against the store database', async () => {
    runner.mockResolvedValueOnce(route === 'query' ? [{ id: 1 }] : { lastInsertId: 1, rowsAffected: 1 })
    const withParams = await app.request(`/api/${route}`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ sql: 'SELECT ?', params: [1] }),
    })
    expect(withParams.status).toBe(200)
    expect(await withParams.json()).toEqual(
      route === 'query' ? { rows: [{ id: 1 }] } : { lastInsertId: 1, rowsAffected: 1 },
    )
    expect(runner).toHaveBeenCalledWith('SELECT ?', [1])

    runner.mockResolvedValueOnce(route === 'query' ? [] : { lastInsertId: 0, rowsAffected: 0 })
    await app.request(`/api/${route}`, { method: 'POST', headers: auth, body: JSON.stringify({ sql: 'SELECT 1' }) })
    expect(runner).toHaveBeenLastCalledWith('SELECT 1', [])
  })

  it('reports database errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      runner.mockRejectedValueOnce(new Error('no such table'))
      const failed = await app.request(`/api/${route}`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ sql: 'x' }),
      })
      expect(failed.status).toBe(500)
      expect(await failed.json()).toEqual({ error: 'no such table' })

      runner.mockRejectedValueOnce('boom')
      const nonError = await app.request(`/api/${route}`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ sql: 'x' }),
      })
      expect(nonError.status).toBe(500)
      expect(await nonError.json()).toEqual({ error: route === 'query' ? 'Query failed' : 'Execute failed' })
    } finally {
      consoleError.mockRestore()
    }
  })

  it('maps unhandled errors to JSON', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await app.request(`/api/${route}`, { method: 'POST', headers: auth, body: '{' })
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: expect.any(String) })
    } finally {
      consoleError.mockRestore()
    }
  })
})

describe('POST /api/connections/connect', () => {
  it('rejects non-string keys', async () => {
    const response = await app.request('/api/connections/connect', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ key: 123 }),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_connection_key' })
    expect(resolveStore).not.toHaveBeenCalled()
  })
})
