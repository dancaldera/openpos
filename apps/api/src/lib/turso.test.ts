import { afterEach, describe, expect, it, vi } from 'vitest'

const { execute, createClient } = vi.hoisted(() => ({
  execute: vi.fn(async () => ({
    columns: ['safe_id', 'unsafe_id', 'name'],
    rows: [[42n, 9007199254740993n, 'barcode product']],
    rowsAffected: 0,
    lastInsertRowid: undefined,
  })),
  createClient: vi.fn(() => ({ execute })),
}))

vi.mock('@libsql/client', () => ({ createClient }))

const {
  createDataPlaneClient,
  executeWithClient,
  getTursoClient,
  mapQueryRows,
  probeDataPlane,
  probeTursoConnection,
  query,
  queryWithClient,
  resetDataPlaneClientsForTests,
  runWithDataPlane,
} = await import('./turso')

afterEach(() => {
  resetDataPlaneClientsForTests()
  createClient.mockClear()
})

describe('Turso client', () => {
  it('requests bigint integers and serializes unsafe integers as strings', async () => {
    const client = createDataPlaneClient({
      url: 'libsql://example.turso.io',
      authToken: 'token',
    })
    const rows = await runWithDataPlane(client, () => query('SELECT safe_id, unsafe_id, name FROM products'))

    expect(createClient).toHaveBeenCalledWith({
      url: 'libsql://example.turso.io',
      authToken: 'token',
      intMode: 'bigint',
    })
    expect(rows).toEqual([
      {
        safe_id: 42,
        unsafe_id: '9007199254740993',
        name: 'barcode product',
      },
    ])
  })

  it('does not require a data plane from env when a client is provided', async () => {
    const client = createDataPlaneClient({ url: 'file:/tmp/openpos-test.sqlite' })
    await runWithDataPlane(client, () => query('SELECT 1'))

    expect(createClient).toHaveBeenCalledWith({
      url: 'file:/tmp/openpos-test.sqlite',
      intMode: 'bigint',
    })
  })

  it('requires a store URL and caches clients per config', () => {
    expect(() => createDataPlaneClient({ url: '' })).toThrow('Store connection required')

    const first = createDataPlaneClient({ url: 'libsql://a.test', authToken: 't' })
    expect(createDataPlaneClient({ url: 'libsql://a.test', authToken: 't' })).toBe(first)
    expect(createDataPlaneClient({ url: 'libsql://b.test', authToken: 't' })).not.toBe(first)
  })

  it('requires an active data plane outside runWithDataPlane', () => {
    expect(() => getTursoClient()).toThrow('Store connection required')
    expect(queryWithClient({ execute } as never, 'SELECT 1')).resolves.toBeDefined()
  })

  it('coerces nested bigints inside object rows', () => {
    expect(mapQueryRows(['a'], [{ nested: [1n, 2n], missing: null, zero: 0, name: 'x' }])).toEqual([
      { nested: [1, 2], missing: null, zero: 0, name: 'x' },
    ])
    expect(mapQueryRows(['a', 'b'], [[1n]])).toEqual([{ a: 1, b: undefined }])
  })

  it('normalizes insert metadata across bigint, number, and missing values', async () => {
    const fake = (meta: object) => ({ execute: async () => ({ columns: [], rows: [], ...meta }) }) as never

    await expect(executeWithClient(fake({}), 'INSERT')).resolves.toEqual({ lastInsertId: 0, rowsAffected: 0 })
    await expect(executeWithClient(fake({ lastInsertRowid: 7, rowsAffected: 2 }), 'INSERT')).resolves.toEqual({
      lastInsertId: 7,
      rowsAffected: 2,
    })
    await expect(executeWithClient(fake({ lastInsertRowid: 9n, rowsAffected: 3n }), 'INSERT')).resolves.toEqual({
      lastInsertId: 9,
      rowsAffected: 3,
    })
  })

  it('probes data planes without throwing', async () => {
    await expect(probeDataPlane({ url: 'libsql://example.turso.io', authToken: 'token' })).resolves.toBe(true)

    execute.mockRejectedValueOnce(new Error('down'))
    await expect(probeDataPlane({ url: 'libsql://other.turso.io', authToken: 'token' })).resolves.toBe(false)
  })

  it('probes the ambient data plane connection', async () => {
    await expect(probeTursoConnection()).resolves.toBe(false)

    const client = createDataPlaneClient({ url: 'libsql://example.turso.io', authToken: 'token' })
    await expect(runWithDataPlane(client, () => probeTursoConnection())).resolves.toBe(true)

    execute.mockRejectedValueOnce(new Error('down'))
    await expect(runWithDataPlane(client, () => probeTursoConnection())).resolves.toBe(false)
  })
})
