import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { applyLocalMigrations } = require('@openpos/data')
const {
  CONNECTION_ERRORS,
  createLocalStore,
  joinLocalStore,
  parseStoreOwnerInput,
  seedBoundLocalStore,
} = await import('./connection-local.cjs')
const { getConnectionDbPath } = await import('./connection-store.cjs')

const bootstrapDbPath = join(dirname(require.resolve('@openpos/data/package.json')), 'assets', 'openpos-bootstrap.sqlite')
const tempDirs = []
const owner = {
  storeName: 'Corner Shop',
  adminName: 'Ada Admin',
  adminEmail: 'ada@example.com',
  adminPassword: 'NewPass1!',
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('parseStoreOwnerInput', () => {
  it('rejects a weak password', () => {
    expect(() => parseStoreOwnerInput({ ...owner, adminPassword: 'short' })).toThrow(/at least 8 characters/)
  })

  it('rejects an invalid email', () => {
    expect(() => parseStoreOwnerInput({ ...owner, adminEmail: 'not-an-email' })).toThrow(/valid admin email/)
  })
})

describe('createLocalStore and seedBoundLocalStore', () => {
  it('creates a local connection envelope and seeds the owner into sqlite', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'openpos-local-conn-'))
    tempDirs.push(userDataPath)

    const result = await createLocalStore({ userDataPath, owner })
    expect(result.key).toMatch(/^OPK_/)
    expect(result.seed).toMatch(/^OPS_/)
    expect(result.published).toBe(false)
    expect(result.dataPlane.url).toBe(`file:${getConnectionDbPath(userDataPath, result.key)}`)

    const dbPath = getConnectionDbPath(userDataPath, result.key)
    mkdirSync(dirname(dbPath), { recursive: true })
    copyFileSync(bootstrapDbPath, dbPath)
    const database = new DatabaseSync(dbPath)
    try {
      applyLocalMigrations(database)
      await seedBoundLocalStore(database, result)
      const users = database.prepare(`SELECT email, name, role FROM users WHERE deleted_at IS NULL`).all()
      expect(users).toEqual([
        {
          email: 'ada@example.com',
          name: 'Ada Admin',
          role: 'admin',
        },
      ])
      const meta = database.prepare(`SELECT connection_key, store_name FROM connection_meta WHERE id = 1`).get()
      expect(meta.connection_key).toBe(result.key)
      expect(meta.store_name).toBe('Corner Shop')
    } finally {
      database.close()
    }

    const joined = await joinLocalStore({
      userDataPath,
      key: result.key,
      seed: result.seed,
      openDatabase: (filePath) => new DatabaseSync(filePath, { readOnly: true }),
    })
    expect(joined.key).toBe(result.key)
    expect(joined.storeName).toBe('Corner Shop')
  })

  it('tells the user to import Turso when the store is not on this device', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'openpos-local-join-'))
    tempDirs.push(userDataPath)

    await expect(
      joinLocalStore({
        userDataPath,
        key: 'OPK_ABCD-EFGH-JKMN-PQRS',
        seed: 'OPS_AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
      }),
    ).rejects.toThrow(CONNECTION_ERRORS.joinNeedsImport)
  })
})
