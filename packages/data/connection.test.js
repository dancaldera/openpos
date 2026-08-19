import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyLocalMigrations,
  generateConnectionKey,
  generateConnectionSeed,
  hashConnectionSeed,
  parseConnectionKey,
  parseConnectionSeed,
  seedFreshStore,
} from './src/index.js'

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

describe('seedFreshStore', () => {
  it('replaces demo users with the new admin and writes connection_meta', async () => {
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
