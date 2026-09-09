import { Module } from 'node:module'
import { beforeEach, describe, expect, it } from 'vitest'

const require = Module.createRequire(import.meta.url)
const { generateConnectionKey } = require('@openpos/data')

const createdClients = []
const script = {
  meta: { rows: [] },
  count: { rows: [{ count: 0 }] },
  company: { rows: [] },
  failSelectOne: false,
  executed: [],
}

function resetScript() {
  script.meta = { rows: [] }
  script.count = { rows: [{ count: 0 }] }
  script.company = { rows: [] }
  script.failSelectOne = false
  script.executed = []
  createdClients.length = 0
}

async function fakeExecute(sql, params) {
  script.executed.push([sql, params])
  const text = typeof sql === 'string' ? sql : sql.sql
  if (text.includes('SELECT 1')) {
    if (script.failSelectOne) throw new Error('unreachable')
    return { rows: [] }
  }
  if (text.includes('connection_meta')) return script.meta
  if (text.includes('COUNT(*)')) return script.count
  if (text.includes('company_settings')) return script.company
  return { rows: [], columns: [] }
}

const originalLoad = Module._load
Module._load = function patchedLoad(request, ...args) {
  if (request === '@libsql/client') {
    return {
      createClient: (config) => {
        createdClients.push(config)
        return { execute: fakeExecute }
      },
    }
  }
  return originalLoad.call(this, request, ...args)
}

const { attachRemoteStore } = await import('./connection-local.cjs')

Module._load = originalLoad

const owner = {
  storeName: 'Shop',
  adminName: 'Ada',
  adminEmail: 'ada@example.com',
  adminPassword: 'Str0ng!pass',
}

function executedSql(part) {
  return script.executed.filter(([sql]) => String(typeof sql === 'string' ? sql : sql.sql).includes(part))
}

describe('attachRemoteStore', () => {
  beforeEach(resetScript)

  it('creates clients with and without tokens', async () => {
    script.count = { rows: [{ count: 1 }] }

    const file = await attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '' })
    expect(file.published).toBe(false)
    expect(createdClients[0]).toEqual({ url: 'file:/tmp/a.sqlite' })

    const hosted = await attachRemoteStore({ url: 'libsql://h.turso.io', authToken: 't' })
    expect(hosted.published).toBe(true)
    expect(createdClients[1]).toEqual({ url: 'libsql://h.turso.io', authToken: 't' })

    const https = await attachRemoteStore({ url: 'https://h.example.com/db', authToken: 't' })
    expect(https.dataPlane.url).toBe('https://h.example.com/db')
  })

  it('validates remote urls and tokens', async () => {
    await expect(attachRemoteStore({})).rejects.toThrow('Database URL is required')
    await expect(attachRemoteStore({ url: 'ftp://x' })).rejects.toThrow('Database URL must start with')
    await expect(attachRemoteStore({ url: 'libsql://h.turso.io', authToken: '  ' })).rejects.toThrow(
      'Database auth token is required',
    )
  })

  it('rejects unreachable databases', async () => {
    script.failSelectOne = true
    await expect(attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '' })).rejects.toThrow(
      'Unable to reach the database',
    )
  })

  it('requires an owner for empty databases', async () => {
    await expect(attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '' })).rejects.toThrow(
      'owner_required_for_empty_database',
    )
  })

  it('detects partial owner input', async () => {
    const base = { url: 'file:/tmp/a.sqlite', authToken: '' }
    await expect(attachRemoteStore({ ...base, storeName: 'S' })).rejects.toThrow('Admin name is required')
    await expect(attachRemoteStore({ ...base, adminName: 'A' })).rejects.toThrow('Store name is required')
    await expect(attachRemoteStore({ ...base, adminEmail: 'a@b.co' })).rejects.toThrow('Store name is required')
    await expect(attachRemoteStore({ ...base, adminPassword: 'Str0ng!pass' })).rejects.toThrow(
      'Store name is required',
    )
  })

  it('attaches an empty database that already has a key', async () => {
    const metaKey = generateConnectionKey()
    script.meta = { rows: [{ connection_key: metaKey, seed_verifier: 'v', store_name: 'Old' }] }

    const result = await attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '', ...owner })
    expect(result.key).toBe(metaKey)
    expect(result.seed).toBeUndefined()
    expect(result.storeName).toBe('Shop')
    expect(executedSql('INSERT INTO users')).toHaveLength(1)
    expect(executedSql('INSERT INTO connection_meta')).toHaveLength(1)
  })

  it('rejects invalid stored keys', async () => {
    script.meta = { rows: [{ connection_key: 'bogus', seed_verifier: 'v' }] }

    await expect(attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '', ...owner })).rejects.toThrow(
      'invalid_connection_key',
    )

    script.count = { rows: [{ count: 1 }] }
    await expect(attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '' })).rejects.toThrow(
      'invalid_connection_key',
    )
  })

  it('seeds a fresh store without stored meta', async () => {
    const result = await attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '', ...owner })
    expect(result.key).toMatch(/^OPK_/)
    expect(result.seed).toMatch(/^OPS_/)
    expect(result.storeName).toBe('Shop')
  })

  it('attaches databases with users and stored meta', async () => {
    const metaKey = generateConnectionKey()
    script.count = { rows: [{ count: 1 }] }
    script.meta = { rows: [{ connection_key: metaKey, seed_verifier: 'v', store_name: 'Meta Shop' }] }

    const result = await attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '' })
    expect(result).toMatchObject({ key: metaKey, storeName: 'Meta Shop', published: false })
    expect(result.seed).toBeUndefined()

    script.meta = { rows: [{ connection_key: metaKey, seed_verifier: 'v', store_name: '' }] }
    const blank = await attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '' })
    expect(blank.storeName).toBe('OpenPOS')
  })

  it('names fresh attachments from the company row', async () => {
    script.count = { rows: [{ count: 1 }] }
    script.company = { rows: [{ name: 'Acme' }] }

    const named = await attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '' })
    expect(named.storeName).toBe('Acme')
    expect(named.seed).toMatch(/^OPS_/)

    script.company = { rows: [] }
    const blank = await attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '' })
    expect(blank.storeName).toBe('OpenPOS')
  })

  it('maps array rows to objects', async () => {
    const metaKey = generateConnectionKey()
    script.count = { rows: [{ count: 1 }] }
    script.meta = {
      rows: [[metaKey, 'v', 'Meta']],
      columns: ['connection_key', 'seed_verifier', 'store_name'],
    }

    const result = await attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '' })
    expect(result).toMatchObject({ key: metaKey, storeName: 'Meta' })

    script.meta = { rows: [[metaKey, 'v', 'Meta']] }
    script.count = { rows: [[0]], columns: ['count'] }
    await expect(attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '' })).rejects.toThrow(
      'owner_required_for_empty_database',
    )
  })

  it('handles missing results and columns', async () => {
    script.count = { rows: [{ count: 1 }] }
    script.meta = null

    const result = await attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '' })
    expect(result.storeName).toBe('OpenPOS')

    script.meta = { rows: [] }
    script.count = { rows: [[3]] }
    await expect(attachRemoteStore({ url: 'file:/tmp/a.sqlite', authToken: '' })).rejects.toThrow(
      'owner_required_for_empty_database',
    )
  })
})
