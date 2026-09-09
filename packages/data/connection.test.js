import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
// Direct per-file imports: nested require() calls resolve natively and would
// bypass coverage instrumentation (see vitest.config.ts).
const { applyLocalMigrations } = await import('./src/migration-runner.cjs')
const {
  connectionFileStem,
  ensureStoreOwner,
  generateConnectionKey,
  generateConnectionSeed,
  hashConnectionSeed,
  hostedDatabaseName,
  normalizeConnectionSecret,
  parseConnectionKey,
  parseConnectionSeed,
  readConnectionMeta,
  seedFreshStore,
  writeConnectionMeta,
} = await import('./src/connection.cjs')

const tempDirs = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('connection secrets', () => {
  it('parses keys and seeds regardless of grouping or case', () => {
    const key = generateConnectionKey()
    const seed = generateConnectionSeed()

    expect(parseConnectionKey(key.toLowerCase().replaceAll('-', ''))).toBe(key)
    expect(parseConnectionSeed(seed.toLowerCase())).toBe(seed)
    expect(parseConnectionKey('not-a-key')).toBeNull()
    expect(parseConnectionSeed(key)).toBeNull()
  })

  it('hashes the normalized seed', () => {
    const seed = generateConnectionSeed()
    expect(hashConnectionSeed(seed.toLowerCase())).toBe(hashConnectionSeed(seed))
  })
})

describe('migrations', () => {
  it('does not insert demo users or company settings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openpos-connection-'))
    tempDirs.push(dir)
    const database = new DatabaseSync(join(dir, 'store.sqlite'))
    applyLocalMigrations(database)

    expect(database.prepare('SELECT COUNT(*) AS count FROM users').get().count).toBe(0)
    expect(database.prepare('SELECT COUNT(*) AS count FROM company_settings').get().count).toBe(0)
    expect(database.prepare('SELECT COUNT(*) AS count FROM product_attributes').get().count).toBe(0)

    const usersColumns = database.prepare('PRAGMA table_info("users")').all().map((column) => column.name)
    expect(usersColumns).toContain('pin_enabled')
    expect(usersColumns).toContain('pin_hash')

    database.close()
  })
})

describe('seedFreshStore', () => {
  it('inserts the owner, company settings, walk-in customer, and connection_meta', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openpos-connection-'))
    tempDirs.push(dir)
    const database = new DatabaseSync(join(dir, 'store.sqlite'))
    applyLocalMigrations(database)

    const key = generateConnectionKey()
    const seed = generateConnectionSeed()
    await seedFreshStore(
      (sql, params = []) => database.prepare(sql).run(...params),
      {
        storeName: 'Corner Shop',
        adminName: 'Ada Admin',
        adminEmail: 'ada@example.com',
        adminPasswordHash: 'hashed-password',
        connectionKey: key,
        seedVerifier: hashConnectionSeed(seed),
        now: '2026-08-19T00:00:00.000Z',
      },
    )

    const users = database.prepare('SELECT email, name, role FROM users ORDER BY email').all()
    expect(users).toEqual([
      {
        email: 'ada@example.com',
        name: 'Ada Admin',
        role: 'admin',
      },
    ])

    const company = database.prepare('SELECT name FROM company_settings WHERE id = 1').get()
    expect(company.name).toBe('Corner Shop')

    const walkIn = database.prepare('SELECT customer_number, first_name, last_name FROM customers LIMIT 1').get()
    expect(walkIn).toEqual({
      customer_number: 'CUST-00001',
      first_name: 'Walk-In',
      last_name: 'Customer',
    })

    const meta = database.prepare('SELECT connection_key, store_name FROM connection_meta WHERE id = 1').get()
    expect(meta).toEqual({
      connection_key: key,
      store_name: 'Corner Shop',
    })

    database.close()
  })
})

describe('connection secret edge cases', () => {
  it('normalizes blank inputs to empty strings', () => {
    expect(normalizeConnectionSecret(null)).toBe('')
    expect(normalizeConnectionSecret(undefined)).toBe('')
    expect(normalizeConnectionSecret('')).toBe('')
    expect(normalizeConnectionSecret('  opk-abc  ')).toBe('OPKABC')
  })

  it('rejects secrets with the right prefix but the wrong length', () => {
    expect(parseConnectionKey('OPK_SHORT')).toBeNull()
    expect(parseConnectionKey(`${generateConnectionKey()}EXTRA`)).toBeNull()
    expect(parseConnectionSeed('OPS_SHORT')).toBeNull()
  })

  it('rejects invalid seeds when hashing', () => {
    expect(() => hashConnectionSeed('not-a-seed')).toThrow('Invalid connection seed')
  })

  it('derives file stems and hosted names from keys', () => {
    const key = generateConnectionKey()
    const stem = connectionFileStem(key)

    expect(stem).toMatch(/^opk-[a-z0-9-]+$/)
    expect(hostedDatabaseName(key)).toBe(`openpos-${stem.replace(/^opk-/, '')}`)
    expect(() => connectionFileStem('junk')).toThrow('Invalid connection key')
    expect(() => hostedDatabaseName('junk')).toThrow('Invalid connection key')
  })
})

describe('ensureStoreOwner validation', () => {
  const validInput = {
    storeName: 'Corner Shop',
    adminName: 'Ada Admin',
    adminEmail: 'ada@example.com',
    adminPasswordHash: 'hashed-password',
  }

  it('requires every store field', async () => {
    const run = async () => {}
    await expect(ensureStoreOwner(run, { ...validInput, storeName: '  ' })).rejects.toThrow('Store name is required')
    await expect(ensureStoreOwner(run, { ...validInput, storeName: undefined })).rejects.toThrow('Store name is required')
    await expect(ensureStoreOwner(run, { ...validInput, adminName: '' })).rejects.toThrow('Admin name is required')
    await expect(ensureStoreOwner(run, { ...validInput, adminEmail: '' })).rejects.toThrow('Admin email is required')
    await expect(ensureStoreOwner(run, { ...validInput, adminPasswordHash: '' })).rejects.toThrow(
      'Admin password hash is required',
    )
  })

  it('stamps the current time when now is omitted', async () => {
    const seen = []
    await ensureStoreOwner(async (sql, params) => {
      seen.push(params)
    }, validInput)

    expect(seen.length).toBeGreaterThan(0)
    for (const params of seen) {
      for (const param of params) {
        if (typeof param === 'string' && param.includes('T')) {
          expect(Date.parse(param)).not.toBeNaN()
        }
      }
    }
  })
})

describe('seedFreshStore validation', () => {
  it('rejects invalid keys and missing verifiers', async () => {
    const run = async () => {}
    const input = {
      storeName: 'Corner Shop',
      adminName: 'Ada Admin',
      adminEmail: 'ada@example.com',
      adminPasswordHash: 'hashed-password',
      connectionKey: generateConnectionKey(),
      seedVerifier: 'verifier',
    }

    await expect(seedFreshStore(run, { ...input, connectionKey: 'junk' })).rejects.toThrow('Invalid connection key')
    await expect(seedFreshStore(run, { ...input, seedVerifier: '' })).rejects.toThrow('Seed verifier is required')
  })
})

describe('connection meta round trip', () => {
  function setupDb() {
    const dir = mkdtempSync(join(tmpdir(), 'openpos-connection-'))
    tempDirs.push(dir)
    const database = new DatabaseSync(join(dir, 'store.sqlite'))
    applyLocalMigrations(database)
    return database
  }

  it('reads null when no meta row exists', async () => {
    const database = setupDb()
    try {
      const row = await readConnectionMeta((sql) => database.prepare(sql).all())
      expect(row).toBeNull()
    } finally {
      database.close()
    }
  })

  it('writes and reads meta rows without an explicit timestamp', async () => {
    const database = setupDb()
    try {
      const key = generateConnectionKey()
      await writeConnectionMeta((sql, params = []) => database.prepare(sql).run(...params), {
        connectionKey: key,
        seedVerifier: 'verifier',
        storeName: 'Corner Shop',
      })

      const row = await readConnectionMeta((sql) => database.prepare(sql).all())
      expect(row).toMatchObject({ connection_key: key, seed_verifier: 'verifier', store_name: 'Corner Shop' })
      expect(Date.parse(row.created_at)).not.toBeNaN()
    } finally {
      database.close()
    }
  })

  it('rejects invalid keys when writing meta', async () => {
    const database = setupDb()
    try {
      await expect(
        writeConnectionMeta((sql, params = []) => database.prepare(sql).run(...params), {
          connectionKey: 'junk',
          seedVerifier: 'verifier',
          storeName: 'Corner Shop',
        }),
      ).rejects.toThrow('Invalid connection key')
    } finally {
      database.close()
    }
  })
})
