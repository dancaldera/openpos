import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Module, createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { applyLocalMigrations, generateConnectionSeed, hashConnectionSeed } = require('@openpos/data')

// The better-sqlite3 native binding cannot load in this environment, so stub
// it before importing the module under test (restored right after import).
const sqliteConstructed = []
class FakeBetterSqlite3 {
  static rows = []

  constructor(filePath, options) {
    this.filePath = filePath
    this.options = options
    sqliteConstructed.push([filePath, options])
  }

  prepare() {
    return {
      all: () => FakeBetterSqlite3.rows,
      get: () => FakeBetterSqlite3.rows[0],
      run: () => {},
    }
  }

  close() {}
}

const originalLoad = Module._load
Module._load = function patchedLoad(request, ...args) {
  if (request === 'better-sqlite3') {
    return FakeBetterSqlite3
  }
  return originalLoad.call(this, request, ...args)
}

const {
  CONNECTION_ERRORS,
  bootstrapLocalOwner,
  createLocalStore,
  joinLocalStore,
  parseStoreOwnerInput,
  seedBoundLocalStore,
} = await import('./connection-local.cjs')

Module._load = originalLoad
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

  it('rejects missing identity fields', () => {
    expect(() => parseStoreOwnerInput({})).toThrow('Store name is required')
    expect(() => parseStoreOwnerInput({ storeName: 'S' })).toThrow('Admin name is required')
    expect(() => parseStoreOwnerInput({ storeName: 'S', adminName: 'A' })).toThrow('A valid admin email is required')
  })

  it('rejects passwords missing a character class', () => {
    expect(() => parseStoreOwnerInput({ ...owner, adminPassword: 'newpass1!' })).toThrow(/uppercase/)
    expect(() => parseStoreOwnerInput({ ...owner, adminPassword: 'NEWPASS1!' })).toThrow(/lowercase/)
    expect(() => parseStoreOwnerInput({ ...owner, adminPassword: 'NewPass!!' })).toThrow(/number/)
    expect(() => parseStoreOwnerInput({ ...owner, adminPassword: 'NewPass12' })).toThrow(/special character/)
  })

  it('parses and normalizes valid input', () => {
    expect(
      parseStoreOwnerInput({ storeName: ' S ', adminName: ' A ', adminEmail: 'A@B.CO', adminPassword: 'NewPass1!' }),
    ).toEqual({ storeName: 'S', adminName: 'A', adminEmail: 'a@b.co', adminPassword: 'NewPass1!' })
  })

  it('defaults missing input to empty', () => {
    expect(() => parseStoreOwnerInput()).toThrow('Store name is required')
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

describe('joinLocalStore branches', () => {
  const KEY = 'OPK_ABCD-EFGH-JKMN-PQRS'
  const SEED = 'OPS_AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD'

  function freshDir() {
    const userDataPath = mkdtempSync(join(tmpdir(), 'openpos-local-join-'))
    tempDirs.push(userDataPath)
    return userDataPath
  }

  function placeDatabase(userDataPath, key, setup) {
    const dbPath = getConnectionDbPath(userDataPath, key)
    mkdirSync(dirname(dbPath), { recursive: true })
    copyFileSync(bootstrapDbPath, dbPath)
    const database = new DatabaseSync(dbPath)
    try {
      applyLocalMigrations(database)
      setup?.(database)
    } finally {
      database.close()
    }
    return dbPath
  }

  it('validates keys and seeds', async () => {
    const userDataPath = freshDir()

    await expect(joinLocalStore({ userDataPath, key: 'bad', seed: SEED })).rejects.toThrow(
      CONNECTION_ERRORS.invalidKey,
    )
    await expect(joinLocalStore({ userDataPath, key: KEY, seed: 'bad' })).rejects.toThrow(
      CONNECTION_ERRORS.invalidSeed,
    )
  })

  it('rejects wrong seeds and missing meta', async () => {
    const userDataPath = freshDir()
    placeDatabase(userDataPath, KEY, (database) => {
      database
        .prepare(
          'INSERT INTO connection_meta (id, connection_key, seed_verifier, store_name, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)',
        )
        .run(KEY, hashConnectionSeed(SEED), 'Corner Shop', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    })
    const openDatabase = (filePath) => new DatabaseSync(filePath, { readOnly: true })

    await expect(
      joinLocalStore({ userDataPath, key: KEY, seed: generateConnectionSeed(), openDatabase }),
    ).rejects.toThrow(CONNECTION_ERRORS.invalidSeed)

    const userDataPath2 = freshDir()
    placeDatabase(userDataPath2, KEY)
    await expect(joinLocalStore({ userDataPath: userDataPath2, key: KEY, seed: SEED, openDatabase })).rejects.toThrow(
      CONNECTION_ERRORS.invalidSeed,
    )
  })

  it('opens with better-sqlite3 by default', async () => {
    const userDataPath = freshDir()
    placeDatabase(userDataPath, KEY)
    FakeBetterSqlite3.rows = [{ seed_verifier: hashConnectionSeed(SEED), store_name: 'Corner Shop' }]
    sqliteConstructed.length = 0

    const joined = await joinLocalStore({ userDataPath, key: KEY, seed: SEED })
    expect(joined).toMatchObject({ key: KEY, storeName: 'Corner Shop', published: false })
    expect(sqliteConstructed).toEqual([[getConnectionDbPath(userDataPath, KEY), { readonly: true }]])
    FakeBetterSqlite3.rows = []
  })

  it('defaults blank store names', async () => {
    const userDataPath = freshDir()
    placeDatabase(userDataPath, KEY, (database) => {
      database
        .prepare(
          'INSERT INTO connection_meta (id, connection_key, seed_verifier, store_name, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)',
        )
        .run(KEY, hashConnectionSeed(SEED), '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    })

    const joined = await joinLocalStore({
      userDataPath,
      key: KEY,
      seed: SEED,
      openDatabase: (filePath) => new DatabaseSync(filePath, { readOnly: true }),
    })
    expect(joined.storeName).toBe('OpenPOS')
  })
})

describe('bootstrapLocalOwner', () => {
  function freshDir() {
    const userDataPath = mkdtempSync(join(tmpdir(), 'openpos-local-bootstrap-'))
    tempDirs.push(userDataPath)
    return userDataPath
  }

  function openSeededDatabase(userDataPath, withMeta) {
    const dbPath = join(userDataPath, 'store.sqlite')
    copyFileSync(bootstrapDbPath, dbPath)
    const database = new DatabaseSync(dbPath)
    applyLocalMigrations(database)
    if (withMeta) {
      database
        .prepare(
          'INSERT INTO connection_meta (id, connection_key, seed_verifier, store_name, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)',
        )
        .run(
          withMeta.key,
          withMeta.seedVerifier,
          withMeta.storeName,
          '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z',
        )
    }
    return { dbPath, database }
  }

  it('skips inserts when owners exist', async () => {
    const userDataPath = freshDir()
    const { database } = openSeededDatabase(userDataPath)
    try {
      const first = await bootstrapLocalOwner(database, owner)
      expect(first).toEqual({ storeName: 'Corner Shop' })

      const second = await bootstrapLocalOwner(database, owner)
      expect(second).toEqual({ storeName: 'Corner Shop' })
      expect(database.prepare('SELECT COUNT(*) AS count FROM users').get().count).toBe(1)
    } finally {
      database.close()
    }
  })

  it('counts missing rows as zero users', async () => {
    const fakeDatabase = { prepare: () => ({ get: () => undefined, all: () => [], run: () => {} }) }

    const result = await bootstrapLocalOwner(fakeDatabase, owner)
    expect(result).toEqual({ storeName: 'Corner Shop' })
  })

  it('keeps stored meta when inserting the owner', async () => {
    const userDataPath = freshDir()
    const { database } = openSeededDatabase(userDataPath, {
      key: 'OPK_ABCD-EFGH-JKMN-PQRS',
      seedVerifier: 'v1-verifier',
      storeName: 'Old Name',
    })
    try {
      const result = await bootstrapLocalOwner(database, owner)
      expect(result).toEqual({ storeName: 'Corner Shop' })

      const users = database.prepare('SELECT email FROM users WHERE deleted_at IS NULL').all()
      expect(users).toEqual([{ email: 'ada@example.com' }])
      const meta = database.prepare('SELECT connection_key, seed_verifier, store_name FROM connection_meta WHERE id = 1').get()
      expect(meta).toMatchObject({
        connection_key: 'OPK_ABCD-EFGH-JKMN-PQRS',
        seed_verifier: 'v1-verifier',
        store_name: 'Corner Shop',
      })
    } finally {
      database.close()
    }
  })
})
