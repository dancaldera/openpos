import { afterEach, describe, expect, it, mock } from 'bun:test'

const execute = mock(async () => ({
  columns: ['safe_id', 'unsafe_id', 'name'],
  rows: [[42n, 9007199254740993n, 'barcode product']],
  rowsAffected: 0,
  lastInsertRowid: undefined,
}))

const createClient = mock(() => ({ execute }))

mock.module('@libsql/client', () => ({ createClient }))

const originalTursoDatabaseUrl = process.env.TURSO_DATABASE_URL
const originalTursoAuthToken = process.env.TURSO_AUTH_TOKEN

process.env.TURSO_DATABASE_URL = 'libsql://example.turso.io'
process.env.TURSO_AUTH_TOKEN = 'token'

const { query } = await import('./turso')

afterEach(() => {
  if (originalTursoDatabaseUrl === undefined) {
    delete process.env.TURSO_DATABASE_URL
  } else {
    process.env.TURSO_DATABASE_URL = originalTursoDatabaseUrl
  }

  if (originalTursoAuthToken === undefined) {
    delete process.env.TURSO_AUTH_TOKEN
  } else {
    process.env.TURSO_AUTH_TOKEN = originalTursoAuthToken
  }
})

describe('Turso client', () => {
  it('requests bigint integers and serializes unsafe integers as strings', async () => {
    const rows = await query('SELECT safe_id, unsafe_id, name FROM products')

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
})
