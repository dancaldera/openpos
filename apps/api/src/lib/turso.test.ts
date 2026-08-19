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

const { createDataPlaneClient, query, resetDataPlaneClientsForTests, runWithDataPlane } = await import('./turso')

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
})
