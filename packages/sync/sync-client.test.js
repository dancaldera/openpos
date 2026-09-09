import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync as Database } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { createSyncManager } = await import('./src/sync-manager.cjs')
const { ensureLocalSyncSchema } = await import('./src/schema.cjs')

const PRODUCT_COLUMNS = [
  'id',
  'name',
  'description',
  'price',
  'cost',
  'stock',
  'category',
  'barcode',
  'barcode_normalized',
  'image',
  'is_active',
  'variant_type',
  'default_variant_id',
  'created_at',
  'updated_at',
]

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

function insertProduct(database, values = {}) {
  const row = {
    id: 8,
    name: 'Bananas',
    description: 'Fresh',
    price: 1.29,
    cost: 0.65,
    stock: 150,
    category: 'Fresh Produce',
    barcode: '4444555566667',
    barcode_normalized: '4444555566667',
    image: '',
    is_active: 1,
    variant_type: 'simple',
    default_variant_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...values,
  }
  database
    .prepare(
      `INSERT INTO products (
        id, name, description, price, cost, stock, category, barcode, barcode_normalized, image,
        is_active, variant_type, default_variant_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.name,
      row.description,
      row.price,
      row.cost,
      row.stock,
      row.category,
      row.barcode,
      row.barcode_normalized,
      row.image,
      row.is_active,
      row.variant_type,
      row.default_variant_id,
      row.created_at,
      row.updated_at,
    )
  return row
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

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('remote client resolution', () => {
  it('stays offline when remote config is not enabled', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = createSyncManager({
      getDatabase: () => localDb,
      getRemoteConfig: () => ({ configured: false, url: 'libsql://remote.test', authToken: 'token' }),
      getRemoteClient: async () => createRemoteClient(remoteDb),
    })

    const snapshot = await manager.triggerSync()

    expect(snapshot.status).toBe('offline')
    expect(snapshot.remoteConfigured).toBe(false)
    expect(snapshot.isSyncing).toBe(false)
  })

  it('stays offline when the remote url is missing', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = createSyncManager({
      getDatabase: () => localDb,
      getRemoteConfig: () => ({ configured: true, url: null, authToken: 'token' }),
      getRemoteClient: async () => createRemoteClient(remoteDb),
    })

    const snapshot = await manager.triggerSync()

    expect(snapshot.status).toBe('offline')
    expect(snapshot.remoteConfigured).toBe(true)
  })

  it('stays offline when the remote auth token is missing', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = createSyncManager({
      getDatabase: () => localDb,
      getRemoteConfig: () => ({ configured: true, url: 'libsql://remote.test', authToken: '' }),
      getRemoteClient: async () => createRemoteClient(remoteDb),
    })

    const snapshot = await manager.triggerSync()

    expect(snapshot.status).toBe('offline')
  })

  it('caches the override client per config key', async () => {
    const { localDb, remoteDb } = setupDbs()
    let authToken = 'token-one'
    let overrideCalls = 0
    const manager = createSyncManager({
      getDatabase: () => localDb,
      getRemoteConfig: () => ({ configured: true, url: 'libsql://remote.test', authToken }),
      getRemoteClient: async () => {
        overrideCalls++
        return createRemoteClient(remoteDb)
      },
    })

    await manager.triggerSync()
    await manager.triggerSync()
    expect(overrideCalls).toBe(1)

    authToken = 'token-two'
    await manager.triggerSync()
    expect(overrideCalls).toBe(2)
  })

  it('creates a real libsql client when no override is provided', async () => {
    const { localDb } = setupDbs()
    const directory = mkdtempSync(join(tmpdir(), 'openpos-sync-'))
    try {
      const manager = createSyncManager({
        getDatabase: () => localDb,
        getRemoteConfig: () => ({ configured: true, url: `file:${join(directory, 'remote.db')}`, authToken: 'token' }),
      })

      const first = await manager.triggerSync()
      expect(first.status).toBe('online')
      expect(first.remoteConfigured).toBe(true)
      expect(first.lastError).toBeNull()

      const second = await manager.triggerSync()
      expect(second.status).toBe('online')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('reports migration failures with error messages', async () => {
    const { localDb } = setupDbs()
    const manager = createSyncManager({
      getDatabase: () => localDb,
      getRemoteConfig: () => ({ configured: true, url: 'libsql://remote.test', authToken: 'token' }),
      getRemoteClient: async () => ({
        async execute() {
          throw new Error('migration boom')
        },
      }),
    })

    const snapshot = await manager.triggerSync()

    expect(snapshot.status).toBe('offline')
    expect(snapshot.lastError).toBe('migration boom')
  })

  it('reports migration failures with non-error reasons', async () => {
    const { localDb } = setupDbs()
    const manager = createSyncManager({
      getDatabase: () => localDb,
      getRemoteConfig: () => ({ configured: true, url: 'libsql://remote.test', authToken: 'token' }),
      getRemoteClient: async () => ({
        async execute() {
          throw 'remote exploded'
        },
      }),
    })

    const snapshot = await manager.triggerSync()

    expect(snapshot.status).toBe('offline')
    expect(snapshot.lastError).toBe('remote exploded')
  })

  it.each([['error instance', new Error('index boom')], ['plain reason', 'index boom']])(
    'continues the sync when remote infrastructure setup fails with %s',
    async (_label, failure) => {
      const { localDb, remoteDb } = setupDbs()
      const delegate = createRemoteClient(remoteDb)
      const manager = createSyncManager({
        getDatabase: () => localDb,
        getRemoteConfig: () => ({ configured: true, url: 'libsql://remote.test', authToken: 'token' }),
        getRemoteClient: async () => ({
          async execute(sql, params = []) {
            if (sql.trimStart().startsWith('CREATE INDEX')) {
              throw failure
            }
            return delegate.execute(sql, params)
          },
        }),
      })

      const snapshot = await manager.triggerSync({ foreground: true })

      expect(snapshot.status).toBe('online')
      expect(snapshot.lastError).toBeNull()
    },
  )
})

describe('array-shaped remote rows', () => {
  it('maps positional remote rows onto columns during pull', async () => {
    const { localDb, remoteDb } = setupDbs()
    insertProduct(remoteDb, { id: 8, name: 'Array Bananas', updated_at: '2026-04-01T00:00:00.000Z' })
    localDb
      .prepare('INSERT INTO sync_state (table_name, last_pulled_at, last_sync_at, updated_at) VALUES (?, ?, NULL, ?)')
      .run('products', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z')

    const delegate = createRemoteClient(remoteDb)
    const manager = createSyncManager({
      getDatabase: () => localDb,
      getRemoteConfig: () => ({ configured: true, url: 'libsql://remote.test', authToken: 'token' }),
      getRemoteClient: async () => ({
        async execute(sql, params = []) {
          if (sql.includes('FROM "products"') && sql.includes('ORDER BY')) {
            return {
              columns: PRODUCT_COLUMNS,
              rows: [
                [
                  8,
                  'Array Bananas',
                  'Fresh',
                  1.29,
                  0.65,
                  150,
                  'Fresh Produce',
                  '4444555566667',
                  '4444555566667',
                  '',
                  1,
                  'simple',
                  null,
                  '2026-01-01T00:00:00.000Z',
                  '2026-04-01T00:00:00.000Z',
                ],
              ],
            }
          }
          return delegate.execute(sql, params)
        },
      }),
    })

    const snapshot = await manager.triggerSync({ foreground: true })
    const local = localDb.prepare('SELECT name, updated_at FROM products WHERE id = 8').get()

    expect(snapshot.status).toBe('online')
    expect(local).toEqual({ name: 'Array Bananas', updated_at: '2026-04-01T00:00:00.000Z' })
  })

  it('treats missing positional values as null during flush lookup', async () => {
    const { localDb, remoteDb } = setupDbs()
    const localRow = insertProduct(localDb, { id: 8, name: 'Local Wins', updated_at: '2026-05-02T00:00:00.000Z' })
    localDb
      .prepare(
        `INSERT INTO sync_outbox (
          table_name, record_id, operation, row_payload, local_updated_at, base_remote_updated_at,
          status, attempts, last_error, synced_at, created_at, updated_at
        ) VALUES ('products', '8', 'UPDATE', ?, ?, '2026-05-01T00:00:00.000Z', 'pending', 0, NULL, NULL, ?, ?)`,
      )
      .run(JSON.stringify(localRow), localRow.updated_at, localRow.updated_at, localRow.updated_at)

    const delegate = createRemoteClient(remoteDb)
    const manager = createSyncManager({
      getDatabase: () => localDb,
      getRemoteConfig: () => ({ configured: true, url: 'libsql://remote.test', authToken: 'token' }),
      getRemoteClient: async () => ({
        async execute(sql, params = []) {
          if (sql.includes('FROM "products"') && sql.includes('LIMIT 1')) {
            return { columns: ['id', 'name'], rows: [[8]] }
          }
          return delegate.execute(sql, params)
        },
      }),
    })

    const snapshot = await manager.triggerSync({ foreground: true })
    const remote = remoteDb.prepare('SELECT name FROM products WHERE id = 8').get()
    const outbox = localDb.prepare(`SELECT status FROM sync_outbox WHERE table_name = 'products' AND record_id = '8'`).get()

    expect(snapshot.status).toBe('online')
    expect(remote).toEqual({ name: 'Local Wins' })
    expect(outbox).toEqual({ status: 'synced' })
  })
})

describe('cached client module', () => {
  it('reuses the imported client factory when the remote config changes', async () => {
    const { localDb } = setupDbs()
    const directory = mkdtempSync(join(tmpdir(), 'openpos-sync-'))
    try {
      // file: URLs ignore the token, so rotating it forces a new client on the
      // same database file (which already has its schema from the first sync).
      let authToken = 'token-one'
      const remoteFile = join(directory, 'remote.db')
      const manager = createSyncManager({
        getDatabase: () => localDb,
        getRemoteConfig: () => ({ configured: true, url: `file:${remoteFile}`, authToken }),
      })

      const first = await manager.triggerSync()
      expect(first.status).toBe('online')

      authToken = 'token-two'
      const second = await manager.triggerSync()
      expect(second.status).toBe('online')
      expect(second.remoteConfigured).toBe(true)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
