import { describe, expect, it, vi } from 'vitest'

const { connectWithKey } = await import('./connection-connect.cjs')

const KEY = 'OPK_ABCD-EFGH-JKMN-PQRS'
const API = 'https://api.example.com'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function okPayload(overrides = {}) {
  return {
    key: KEY,
    store: { id: 's1', name: 'Corner Shop', slug: 'corner' },
    dataPlane: { url: 'libsql://store.turso.io', authToken: 'token' },
    ...overrides,
  }
}

describe('connectWithKey', () => {
  it('rejects invalid connection keys without calling the API', async () => {
    const fetchImpl = vi.fn()

    await expect(connectWithKey({ apiUrl: API, key: 'nope', fetchImpl })).rejects.toThrow('invalid_connection_key')
    await expect(connectWithKey({ apiUrl: API, key: undefined, fetchImpl })).rejects.toThrow(
      'invalid_connection_key',
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts the normalized key and returns the store credentials', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(okPayload()))

    await expect(connectWithKey({ apiUrl: API, key: KEY.toLowerCase(), fetchImpl })).resolves.toEqual({
      key: KEY,
      storeName: 'Corner Shop',
      dataPlane: { url: 'libsql://store.turso.io', authToken: 'token' },
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${API}/api/connections/connect`)
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } })
    expect(JSON.parse(init.body)).toEqual({ key: KEY })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('falls back to the requested key and a default store name', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ key: 'garbage', dataPlane: { url: 'https://store.example.com', authToken: 42 } }),
    )

    await expect(connectWithKey({ apiUrl: API, key: KEY, fetchImpl, timeoutMs: 50 })).resolves.toEqual({
      key: KEY,
      storeName: 'OpenPOS',
      dataPlane: { url: 'https://store.example.com', authToken: '42' },
    })
  })

  it('accepts local file databases without a token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(okPayload({ dataPlane: { url: 'file:/tmp/store.db' } })))

    await expect(connectWithKey({ apiUrl: API, key: KEY, fetchImpl })).resolves.toEqual({
      key: KEY,
      storeName: 'Corner Shop',
      dataPlane: { url: 'file:/tmp/store.db' },
    })
  })

  it('accepts http database URLs with a token', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(okPayload({ dataPlane: { url: 'http://localhost:8080', authToken: 'dev' } })),
    )

    await expect(connectWithKey({ apiUrl: API, key: KEY, fetchImpl })).resolves.toMatchObject({
      dataPlane: { url: 'http://localhost:8080', authToken: 'dev' },
    })
  })

  it('reports unreachable API servers', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })

    await expect(connectWithKey({ apiUrl: API, key: KEY, fetchImpl })).rejects.toThrow(
      `Cannot reach the API server at ${API}. Check the API URL and network connection.`,
    )
  })

  it('surfaces API error codes', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'connection_not_found' }, 404))

    await expect(connectWithKey({ apiUrl: API, key: KEY, fetchImpl })).rejects.toThrow('connection_not_found')
  })

  it('falls back to the status code when the error body is missing or unusable', async () => {
    await expect(
      connectWithKey({ apiUrl: API, key: KEY, fetchImpl: async () => new Response('Bad Gateway', { status: 502 }) }),
    ).rejects.toThrow('Connection failed (502)')
    await expect(
      connectWithKey({ apiUrl: API, key: KEY, fetchImpl: async () => jsonResponse({ error: '' }, 500) }),
    ).rejects.toThrow('Connection failed (500)')
    await expect(
      connectWithKey({ apiUrl: API, key: KEY, fetchImpl: async () => jsonResponse({ error: 42 }, 400) }),
    ).rejects.toThrow('Connection failed (400)')
  })

  it('rejects missing or unsupported database URLs', async () => {
    const invalidUrl = 'The API returned an invalid store database URL'

    await expect(
      connectWithKey({ apiUrl: API, key: KEY, fetchImpl: async () => new Response('not json', { status: 200 }) }),
    ).rejects.toThrow(invalidUrl)
    await expect(
      connectWithKey({ apiUrl: API, key: KEY, fetchImpl: async () => jsonResponse(okPayload({ dataPlane: null })) }),
    ).rejects.toThrow(invalidUrl)
    await expect(
      connectWithKey({
        apiUrl: API,
        key: KEY,
        fetchImpl: async () => jsonResponse(okPayload({ dataPlane: { url: 'postgres://db', authToken: 't' } })),
      }),
    ).rejects.toThrow(invalidUrl)
    await expect(
      connectWithKey({
        apiUrl: API,
        key: KEY,
        fetchImpl: async () => jsonResponse(okPayload({ dataPlane: { url: 42, authToken: 't' } })),
      }),
    ).rejects.toThrow(invalidUrl)
  })

  it('requires a token for hosted databases', async () => {
    const fetchImpl = async () => jsonResponse(okPayload({ dataPlane: { url: 'libsql://store.turso.io' } }))

    await expect(connectWithKey({ apiUrl: API, key: KEY, fetchImpl })).rejects.toThrow(
      'The API did not return a store database token',
    )
  })

  it('uses the global fetch by default', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(okPayload()))
    try {
      await expect(connectWithKey({ apiUrl: API, key: KEY })).resolves.toMatchObject({ storeName: 'Corner Shop' })
      expect(fetchSpy).toHaveBeenCalledWith(`${API}/api/connections/connect`, expect.any(Object))
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
