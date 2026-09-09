import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync as Database } from 'node:sqlite'
const { createSyncManager, resetLocalDatabase } = await import('./src/sync-manager.cjs')
const { ensureLocalSyncSchema } = await import('./src/schema.cjs')

function createTables(database) {
  database.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      email TEXT,
      password TEXT,
      name TEXT,
      role TEXT,
      permissions TEXT,
      created_at TEXT,
      last_login TEXT,
      password_hashed INTEGER,
      deleted_at TEXT
    );
    CREATE TABLE customers (id INTEGER PRIMARY KEY, updated_at TEXT);
    CREATE TABLE company_settings (id INTEGER PRIMARY KEY, updated_at TEXT);
    CREATE TABLE orders (id INTEGER PRIMARY KEY, updated_at TEXT);
    CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      cost REAL NOT NULL,
      stock REAL NOT NULL,
      category TEXT NOT NULL,
      barcode TEXT,
      barcode_normalized TEXT,
      image TEXT,
      is_active INTEGER NOT NULL,
      variant_type TEXT,
      default_variant_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER);
    CREATE TABLE product_attributes (id INTEGER PRIMARY KEY, updated_at TEXT);
    CREATE TABLE product_variants (id INTEGER PRIMARY KEY, parent_product_id INTEGER, image TEXT, updated_at TEXT);
    CREATE TABLE product_variant_settings (id INTEGER PRIMARY KEY, product_id INTEGER, updated_at TEXT);
  `)
}

function createRemoteClient(database) {
  return {
    async execute(sql, params = []) {
      const statement = database.prepare(sql)
      if (/^\s*(select|pragma)\b/i.test(sql)) {
        return { columns: [], rows: statement.all(...params) }
      }
      const result = statement.run(...params)
      return { columns: [], rows: [], lastInsertRowid: Number(result.lastInsertRowid ?? 0), rowsAffected: result.changes ?? 0 }
    },
  }
}

function setupDbs() {
  const localDb = new Database(':memory:')
  const remoteDb = new Database(':memory:')
  createTables(localDb)
  createTables(remoteDb)
  ensureLocalSyncSchema(localDb)
  ensureLocalSyncSchema(remoteDb)
  return { localDb, remoteDb }
}

function makeManager(localDb, remoteDb, options = {}) {
  return createSyncManager({
    getDatabase: () => localDb,
    getRemoteConfig: () => ({ configured: true, url: 'libsql://remote.test', authToken: 'token' }),
    getRemoteClient: async () => createRemoteClient(remoteDb),
    ...options,
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sync triggering', () => {
  it('reuses the in-flight sync promise', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, remoteDb)

    const [first, second] = await Promise.all([manager.triggerSync({ foreground: true }), manager.triggerSync({ foreground: true })])

    expect(first).toBe(second)
    expect(first.status).toBe('online')
  })

  it('reports database failures as offline with the error message', async () => {
    const { localDb, remoteDb } = setupDbs()
    let calls = 0
    const manager = createSyncManager({
      getDatabase: () => {
        calls++
        if (calls === 1) {
          throw new Error('db gone')
        }
        return localDb
      },
      getRemoteConfig: () => ({ configured: true, url: 'libsql://remote.test', authToken: 'token' }),
      getRemoteClient: async () => createRemoteClient(remoteDb),
    })

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('offline')
    expect(snapshot.lastError).toBe('db gone')
    expect(snapshot.isSyncing).toBe(false)
  })

  it('reports plain-thrown database failures', async () => {
    const { localDb, remoteDb } = setupDbs()
    let calls = 0
    const manager = createSyncManager({
      getDatabase: () => {
        calls++
        if (calls === 1) {
          throw 'boom'
        }
        return localDb
      },
      getRemoteConfig: () => ({ configured: true, url: 'libsql://remote.test', authToken: 'token' }),
      getRemoteClient: async () => createRemoteClient(remoteDb),
    })

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('offline')
    expect(snapshot.lastError).toBe('boom')
  })

  it('runs background syncs without the syncing status', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, remoteDb)

    const snapshot = await manager.triggerSync()

    expect(snapshot.status).toBe('online')
    expect(snapshot.isSyncing).toBe(false)
  })

  it('reads snapshots from an explicit database', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, remoteDb)
    await manager.triggerSync({ foreground: true })

    const snapshot = manager.getStatusSnapshot(localDb)

    expect(snapshot.status).toBe('online')
    expect(snapshot.pendingWrites).toBe(0)
  })
})

describe('order queue flush hook', () => {
  it('runs the hook after the outbox flush', async () => {
    const { localDb, remoteDb } = setupDbs()
    let calls = 0
    const manager = makeManager(localDb, remoteDb, {
      onFlushOrderQueue: async () => {
        calls++
      },
    })

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(calls).toBe(1)
  })

  it.each([['error instance', new Error('queue boom')], ['plain reason', 'queue boom']])(
    'stays online when the hook fails with %s',
    async (_label, failure) => {
      const { localDb, remoteDb } = setupDbs()
      const manager = makeManager(localDb, remoteDb, {
        onFlushOrderQueue: async () => {
          throw failure
        },
      })

      const snapshot = await manager.triggerSync({ foreground: true })

      expect(snapshot.status).toBe('online')
      expect(snapshot.lastError).toBeNull()
    },
  )
})

describe('polling lifecycle', () => {
  it('starts heartbeats once and stops them', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, remoteDb)

    manager.start(50)
    manager.start(50)
    await sleep(150)
    manager.stop()

    expect(manager.getStatusSnapshot(localDb).status).toBe('online')
  })

  it('stops cleanly without ever starting', () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, remoteDb)

    expect(() => manager.stop()).not.toThrow()
  })

  it('runs heartbeats without rescheduling when no timer exists', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, remoteDb)
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    const snapshot = await manager.heartbeat(1000)

    expect(snapshot.status).toBe('online')
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it('backs off the poll interval while idle', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, remoteDb)
    for (let cycle = 0; cycle < 7; cycle++) {
      await manager.triggerSync({ foreground: true })
    }
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    manager.start(10000)
    await sleep(150)
    manager.stop()

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 40000)
  })

  it('doubles the poll interval after a few idle cycles', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, remoteDb)
    for (let cycle = 0; cycle < 4; cycle++) {
      await manager.triggerSync({ foreground: true })
    }
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    manager.start(10000)
    await sleep(150)
    manager.stop()

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 20000)
  })

  it('caps the idle poll interval at sixty seconds', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, remoteDb)
    for (let cycle = 0; cycle < 7; cycle++) {
      await manager.triggerSync({ foreground: true })
    }
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    manager.start(30000)
    await sleep(150)
    manager.stop()

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000)
  })
})

describe('resetLocalDatabase', () => {
  function shimBetterSqlite(database) {
    database.pragma = (statement) => database.exec(`PRAGMA ${statement}`)
    database.transaction = (fn) => () => {
      database.exec('BEGIN')
      try {
        fn()
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    }
    return database
  }

  it('clears replicated tables and sync bookkeeping', () => {
    const { localDb } = setupDbs()
    shimBetterSqlite(localDb)
    localDb
      .prepare(
        `INSERT INTO products (
          id, name, description, price, cost, stock, category, barcode, barcode_normalized, image,
          is_active, variant_type, default_variant_id, created_at, updated_at
        ) VALUES (8, 'Gone', 'Fresh', 1, 1, 1, 'c', NULL, NULL, NULL, 1, NULL, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      .run()
    localDb
      .prepare(
        `INSERT INTO sync_outbox (table_name, record_id, operation, status, attempts, created_at, updated_at)
         VALUES ('products', '8', 'UPDATE', 'pending', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      .run()
    localDb
      .prepare('INSERT INTO order_sync_queue (order_id, operation, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('5', 'UPSERT', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    localDb
      .prepare('INSERT INTO sync_state (table_name, last_pulled_at, last_sync_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('products', '2026-01-01T00:00:00.000Z', null, '2026-01-01T00:00:00.000Z')

    resetLocalDatabase(localDb)

    expect(localDb.prepare('SELECT COUNT(*) AS c FROM products').get()).toEqual({ c: 0 })
    expect(localDb.prepare('SELECT COUNT(*) AS c FROM sync_outbox').get()).toEqual({ c: 0 })
    expect(localDb.prepare('SELECT COUNT(*) AS c FROM order_sync_queue').get()).toEqual({ c: 0 })
    expect(localDb.prepare('SELECT COUNT(*) AS c FROM sync_state').get()).toEqual({ c: 0 })
    expect(localDb.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
  })

  it('restores foreign keys when the reset fails midway', () => {
    const { localDb } = setupDbs()
    shimBetterSqlite(localDb)
    localDb.exec('DROP TABLE order_sync_queue')

    expect(() => resetLocalDatabase(localDb)).toThrow()
    expect(localDb.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
  })
})

describe('manager defaults', () => {
  it('reads snapshots from the managed database without arguments', () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, remoteDb)

    expect(manager.getStatusSnapshot()).toMatchObject({ pendingWrites: 0 })
    expect(manager.getConflictSummary()).toEqual([])
  })

  it('starts polling with the default interval', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, remoteDb)
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    manager.start()
    await sleep(150)
    manager.stop()

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 15_000)
  })
})
