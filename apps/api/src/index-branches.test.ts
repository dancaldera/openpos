import type { AddressInfo } from 'node:net'
import { generateConnectionKey } from '@openpos/data'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dataPlaneMiddleware, execute, probeDataPlane, query, readAssignedConnection, resolveDataPlane } = vi.hoisted(
  () => ({
    dataPlaneMiddleware: vi.fn(async (_c: unknown, next: () => Promise<void>) => {
      await next()
    }),
    execute: vi.fn(async () => ({ lastInsertId: 1, rowsAffected: 1 })),
    probeDataPlane: vi.fn(async () => true),
    query: vi.fn(async () => []),
    readAssignedConnection: vi.fn(async () => null),
    resolveDataPlane: vi.fn(async () => null),
  }),
)

vi.mock('./lib/connection.js', () => ({
  readAssignedConnection,
  resolveDataPlane,
}))

vi.mock('./lib/turso.js', () => ({
  execute,
  probeDataPlane,
  query,
}))

vi.mock('./middleware/auth.js', () => ({
  authMiddleware: async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('jwtPayload', { sub: '1', role: 'admin', permissions: ['*'] })
    await next()
  },
}))

vi.mock('./middleware/cors.js', () => ({
  corsMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next()
  },
}))

vi.mock('./middleware/data-plane.js', () => ({
  dataPlaneMiddleware,
}))

const { default: app, getServerPort, startServer } = await import('./index.js')

const jsonHeaders = { 'Content-Type': 'application/json' }

function silenceConsole(method: 'error' | 'log') {
  const spy = vi.spyOn(console, method).mockImplementation(() => {})
  return () => spy.mockRestore()
}

async function waitForListening(server: { listening: boolean; once: (event: string, cb: () => void) => void }) {
  if (!server.listening) {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  }
}

async function closeServer(server: { close: (cb: (error?: Error) => void) => void }) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}

describe('index branches', () => {
  beforeEach(() => {
    for (const fn of [dataPlaneMiddleware, execute, probeDataPlane, query, readAssignedConnection, resolveDataPlane]) {
      fn.mockReset()
    }
    dataPlaneMiddleware.mockImplementation(async (_c: unknown, next: () => Promise<void>) => {
      await next()
    })
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 })
    probeDataPlane.mockResolvedValue(true)
    query.mockResolvedValue([])
    readAssignedConnection.mockResolvedValue(null)
    resolveDataPlane.mockResolvedValue(null)
  })

  it('serves the welcome payload', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: 'OpenPOS API', status: 'ok', health: '/api/health' })
  })

  it('reports db-status for reachable, missing, and failing planes', async () => {
    const key = generateConnectionKey()

    resolveDataPlane.mockResolvedValueOnce({ url: 'file:/tmp/x.sqlite' })
    const remote = await app.request('/api/db-status', { headers: { 'X-OpenPOS-Connection': key } })
    expect(remote.status).toBe(200)
    expect(await remote.json()).toMatchObject({ status: 'remote', mode: 'api', remoteConfigured: true })

    const missing = await app.request('/api/db-status', { headers: { 'X-OpenPOS-Connection': key } })
    expect(await missing.json()).toMatchObject({ status: 'error', remoteConfigured: false })

    resolveDataPlane.mockResolvedValueOnce({ url: 'file:/tmp/x.sqlite' })
    probeDataPlane.mockResolvedValueOnce(false)
    const failing = await app.request('/api/db-status', { headers: { 'X-OpenPOS-Connection': key } })
    expect(await failing.json()).toMatchObject({ status: 'error', remoteConfigured: true })
  })

  it('falls back to the assigned connection for db-status', async () => {
    const assignedKey = generateConnectionKey()
    readAssignedConnection.mockResolvedValueOnce({ key: assignedKey, storeName: 'S', published: false })

    const res = await app.request('/api/db-status')
    expect(res.status).toBe(200)
    expect(resolveDataPlane).toHaveBeenCalledWith(assignedKey)
    expect(await res.json()).toMatchObject({ status: 'error', remoteConfigured: false })
  })

  it('runs direct SQL queries', async () => {
    const appRef = app
    query.mockResolvedValueOnce([{ one: 1 }])
    const withParams = await appRef.request('/api/query', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ sql: 'SELECT 1', params: [1] }),
    })
    expect(withParams.status).toBe(200)
    expect(await withParams.json()).toEqual({ rows: [{ one: 1 }] })
    expect(query).toHaveBeenCalledWith('SELECT 1', [1])

    query.mockReset()
    query.mockResolvedValueOnce([])
    const withoutParams = await appRef.request('/api/query', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ sql: 'SELECT 1' }),
    })
    expect(withoutParams.status).toBe(200)
    expect(query).toHaveBeenCalledWith('SELECT 1', [])
  })

  it('validates direct SQL queries', async () => {
    const missing = await app.request('/api/query', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(missing.status).toBe(400)

    const nonString = await app.request('/api/query', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ sql: 123 }),
    })
    expect(nonString.status).toBe(400)
  })

  it('maps direct query failures', async () => {
    const restore = silenceConsole('error')
    try {
      query.mockRejectedValueOnce(new Error('bad sql'))
      const failed = await app.request('/api/query', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ sql: 'SELECT 1' }),
      })
      expect(failed.status).toBe(500)
      expect(await failed.json()).toEqual({ error: 'bad sql' })

      query.mockRejectedValueOnce('boom')
      const nonError = await app.request('/api/query', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ sql: 'SELECT 1' }),
      })
      expect(nonError.status).toBe(500)
      expect(await nonError.json()).toEqual({ error: 'Query failed' })
    } finally {
      restore()
    }
  })

  it('runs direct SQL executes', async () => {
    execute.mockResolvedValueOnce({ lastInsertId: 5, rowsAffected: 2 })
    const withParams = await app.request('/api/execute', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ sql: 'DELETE FROM x', params: [1] }),
    })
    expect(withParams.status).toBe(200)
    expect(await withParams.json()).toEqual({ lastInsertId: 5, rowsAffected: 2 })
    expect(execute).toHaveBeenCalledWith('DELETE FROM x', [1])

    execute.mockReset()
    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })
    const withoutParams = await app.request('/api/execute', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ sql: 'DELETE FROM x' }),
    })
    expect(withoutParams.status).toBe(200)
    expect(execute).toHaveBeenCalledWith('DELETE FROM x', [])
  })

  it('validates direct SQL executes', async () => {
    const missing = await app.request('/api/execute', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(missing.status).toBe(400)

    const nonString = await app.request('/api/execute', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ sql: 123 }),
    })
    expect(nonString.status).toBe(400)
  })

  it('maps direct execute failures', async () => {
    const restore = silenceConsole('error')
    try {
      execute.mockRejectedValueOnce(new Error('bad sql'))
      const failed = await app.request('/api/execute', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ sql: 'DELETE FROM x' }),
      })
      expect(failed.status).toBe(500)
      expect(await failed.json()).toEqual({ error: 'bad sql' })

      execute.mockRejectedValueOnce('boom')
      const nonError = await app.request('/api/execute', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ sql: 'DELETE FROM x' }),
      })
      expect(nonError.status).toBe(500)
      expect(await nonError.json()).toEqual({ error: 'Execute failed' })
    } finally {
      restore()
    }
  })

  it('handles downstream errors', async () => {
    const restore = silenceConsole('error')
    try {
      dataPlaneMiddleware.mockImplementationOnce(async () => {
        throw new Error('down')
      })
      const failed = await app.request('/api/health')
      expect(failed.status).toBe(500)
      expect(await failed.json()).toEqual({ error: 'down' })
    } finally {
      restore()
    }
  })

  it('resolves the server port from the environment', () => {
    const original = process.env.PORT
    try {
      process.env.PORT = '4321'
      expect(getServerPort()).toBe(4321)

      delete process.env.PORT
      expect(getServerPort()).toBe(3001)
    } finally {
      if (original === undefined) delete process.env.PORT
      else process.env.PORT = original
    }
  })

  it('starts a server without an assigned store', async () => {
    const restore = silenceConsole('log')
    try {
      const server = await startServer(0)
      try {
        await waitForListening(server)
        const { port } = server.address() as AddressInfo
        const res = await fetch(`http://127.0.0.1:${port}/api/health`)
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ status: 'ok' })
      } finally {
        await closeServer(server)
      }
    } finally {
      restore()
    }
  })

  it('starts a server with an assigned store', async () => {
    const restore = silenceConsole('log')
    try {
      readAssignedConnection.mockResolvedValueOnce({ key: 'OPK_x', storeName: 'Corner', published: false })
      const server = await startServer(0)
      try {
        await waitForListening(server)
        const { port } = server.address() as AddressInfo
        const res = await fetch(`http://127.0.0.1:${port}/`)
        expect(res.status).toBe(200)
      } finally {
        await closeServer(server)
      }
    } finally {
      restore()
    }
  })
})
