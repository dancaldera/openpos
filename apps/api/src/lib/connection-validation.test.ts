import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { applyLocalMigrations, generateConnectionKey, generateConnectionSeed } from '@openpos/data'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

process.env.JWT_SECRET = 'connection-validation-secret-connection-validation'

const {
  connectionErrorStatus,
  createConnection,
  importRemoteConnection,
  joinConnection,
  parsePlatformConfig,
  readAssignedConnection,
  registerConnection,
  resolveDataPlane,
} = await import('./connection.js')

const tempDirs: string[] = []
let connectionsDir = ''

function freshConnectionsDir() {
  connectionsDir = mkdtempSync(join(tmpdir(), 'openpos-conn-validation-'))
  tempDirs.push(connectionsDir)
  process.env.OPENPOS_CONNECTIONS_DIR = connectionsDir
}

function makeDatabase(withMeta?: { key: string; storeName?: string | null }) {
  const dir = mkdtempSync(join(tmpdir(), 'openpos-conn-db-'))
  tempDirs.push(dir)
  const dbPath = join(dir, 'store.sqlite')
  const database = new DatabaseSync(dbPath)
  applyLocalMigrations(database)
  if (withMeta) {
    database
      .prepare(
        'INSERT INTO connection_meta (id, connection_key, seed_verifier, store_name, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)',
      )
      .run(withMeta.key, 'verifier', withMeta.storeName ?? null, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  }
  database.close()
  return dbPath
}

beforeEach(() => {
  freshConnectionsDir()
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
})

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
})

describe('parsePlatformConfig', () => {
  it('returns null for empty input', () => {
    expect(parsePlatformConfig({})).toBeNull()
    expect(parsePlatformConfig({ apiToken: '  ', org: '', group: undefined })).toBeNull()
  })

  it('throws for partial input', () => {
    for (const input of [
      { apiToken: 't', org: 'o' },
      { apiToken: 't', group: 'g' },
      { org: 'o', group: 'g' },
    ]) {
      expect(() => parsePlatformConfig(input)).toThrow('Turso API token, org, and group are all required')
    }
  })

  it('returns trimmed complete configs', () => {
    expect(parsePlatformConfig({ apiToken: ' t ', org: 'o', group: ' g' })).toEqual({
      apiToken: 't',
      org: 'o',
      group: 'g',
    })
  })
})

describe('connectionErrorStatus', () => {
  it('maps not-found to 404', () => {
    expect(connectionErrorStatus(new Error('connection_not_found'))).toBe(404)
    expect(connectionErrorStatus('connection_not_found')).toBe(404)
  })

  it('maps validation messages to 400', () => {
    for (const message of [
      'invalid_connection_key',
      'invalid_connection_secret',
      'owner_required_for_empty_database',
      'Store name is required',
      'Admin name is required',
      'A valid admin email is required',
      'Database URL is required',
      'Database auth token is required',
      'Turso API token, org, and group are all required',
      'Database URL must start with libsql://',
      'Password must be at least 8 characters',
    ]) {
      expect(connectionErrorStatus(new Error(message))).toBe(400)
    }
  })

  it('maps anything else to 500', () => {
    expect(connectionErrorStatus(new Error('weird'))).toBe(500)
    expect(connectionErrorStatus('boom')).toBe(500)
    expect(connectionErrorStatus(null)).toBe(500)
  })
})

describe('connection input validation', () => {
  it('validates createConnection input', async () => {
    const good = { storeName: 'S', adminName: 'A', adminEmail: 'a@b.co', adminPassword: 'Str0ng!pass' }
    await expect(createConnection({ ...good, storeName: '  ' })).rejects.toThrow('Store name is required')
    await expect(createConnection({ ...good, adminName: '' })).rejects.toThrow('Admin name is required')
    await expect(createConnection({ ...good, adminEmail: 'bad' })).rejects.toThrow('A valid admin email is required')
    await expect(createConnection({ ...good, adminPassword: 'weak' })).rejects.toThrow('Password must')
  })

  it('validates joinConnection input', async () => {
    await expect(joinConnection({ key: 'bad', seed: 'bad' })).rejects.toThrow('invalid_connection_key')
    await expect(joinConnection({ key: generateConnectionKey(), seed: 'bad' })).rejects.toThrow(
      'invalid_connection_secret',
    )
    await expect(
      joinConnection({ key: generateConnectionKey(), seed: generateConnectionSeed() }),
    ).rejects.toThrow('connection_not_found')
  })

  it('validates importRemoteConnection input', async () => {
    await expect(importRemoteConnection({ url: 'ftp://x', authToken: '' })).rejects.toThrow(
      'Database URL must start with',
    )
    await expect(importRemoteConnection({ url: 'libsql://x.turso.io', authToken: '  ' })).rejects.toThrow(
      'Database auth token is required',
    )
  })

  it('validates registerConnection owner input', async () => {
    const admin = { adminName: 'A', adminEmail: 'a@b.co', adminPassword: 'Str0ng!pass' }
    await expect(registerConnection({ key: generateConnectionKey() })).rejects.toThrow('Store name is required')
    await expect(registerConnection({ key: generateConnectionKey(), storeName: 'S' })).rejects.toThrow(
      'Admin name is required',
    )
    await expect(
      registerConnection({ key: generateConnectionKey(), storeName: 'S', adminName: 'A', adminEmail: 'bad' }),
    ).rejects.toThrow('A valid admin email is required')
    await expect(
      registerConnection({ key: generateConnectionKey(), storeName: 'S', ...admin, adminPassword: 'weak' }),
    ).rejects.toThrow('Password must')
    await expect(
      registerConnection({ key: generateConnectionKey(), storeName: 'S', adminName: 'A', adminEmail: 'a@b.co' }),
    ).rejects.toThrow('Password must')
  })
})

describe('resolveDataPlane', () => {
  it('returns null for garbage keys', async () => {
    await expect(resolveDataPlane('garbage')).resolves.toBeNull()
  })

  it('resolves a store file without a registry entry', async () => {
    const key = generateConnectionKey()
    const filePath = join(connectionsDir, `${key.replaceAll('_', '-').toLowerCase()}.sqlite`)
    writeFileSync(filePath, '')

    await expect(resolveDataPlane(key)).resolves.toEqual({ url: `file:${filePath}` })
  })

  it('falls back to the default connections dir', async () => {
    const original = process.env.OPENPOS_CONNECTIONS_DIR
    delete process.env.OPENPOS_CONNECTIONS_DIR
    try {
      await expect(resolveDataPlane(generateConnectionKey())).resolves.toBeNull()
    } finally {
      if (original !== undefined) process.env.OPENPOS_CONNECTIONS_DIR = original
    }
  })

  it('ignores a malformed registry file', async () => {
    writeFileSync(join(connectionsDir, 'registry.json'), '{"connections": {}}')

    await expect(resolveDataPlane(generateConnectionKey())).resolves.toBeNull()
    await expect(readAssignedConnection()).resolves.toBeNull()
  })
})

describe('readAssignedConnection', () => {
  it('matches API configuration against the registry', async () => {
    const created = await createConnection({
      storeName: 'Corner Shop',
      adminName: 'Ada',
      adminEmail: 'ada@example.com',
      adminPassword: 'Admin123!',
    })
    const registry = JSON.parse(readFileSync(join(connectionsDir, 'registry.json'), 'utf8')) as {
      connections: Array<{ url: string }>
    }
    process.env.TURSO_DATABASE_URL = registry.connections[0].url

    await expect(readAssignedConnection()).resolves.toEqual({
      key: created.key,
      storeName: 'Corner Shop',
      published: false,
    })
  })

  it('defaults blank registry store names', async () => {
    const key = generateConnectionKey()
    writeFileSync(
      join(connectionsDir, 'registry.json'),
      JSON.stringify({ connections: [{ key, adapter: 'file', url: 'file:/tmp/x.sqlite', storeName: '' }] }),
    )
    process.env.TURSO_DATABASE_URL = 'file:/tmp/x.sqlite'

    await expect(readAssignedConnection()).resolves.toEqual({ key, storeName: 'OpenPOS', published: false })
  })

  it('returns null when the configured database has no connection key', async () => {
    process.env.TURSO_DATABASE_URL = `file:${makeDatabase()}`

    await expect(readAssignedConnection()).resolves.toBeNull()
  })

  it('defaults blank recovered store names', async () => {
    const key = generateConnectionKey()
    process.env.TURSO_DATABASE_URL = `file:${makeDatabase({ key, storeName: '' })}`

    await expect(readAssignedConnection()).resolves.toEqual({ key, storeName: 'OpenPOS', published: false })
  })

  it('defaults the last registry entry store name without configuration', async () => {
    const key = generateConnectionKey()
    writeFileSync(
      join(connectionsDir, 'registry.json'),
      JSON.stringify({
        connections: [{ key, adapter: 'hosted', url: 'libsql://x.turso.io', authToken: 't', storeName: '' }],
      }),
    )

    await expect(readAssignedConnection()).resolves.toEqual({ key, storeName: 'OpenPOS', published: true })
  })

  it('rejects unusable API configuration', async () => {
    process.env.TURSO_AUTH_TOKEN = 'token-without-url'
    await expect(readAssignedConnection()).rejects.toThrow('Database URL is required')

    delete process.env.TURSO_AUTH_TOKEN
    process.env.TURSO_DATABASE_URL = 'libsql://x.turso.io'
    await expect(readAssignedConnection()).rejects.toThrow('Database auth token is required')
  })
})
