const { beforeEach, describe, expect, it } = require('bun:test')
const { Database } = require('bun:sqlite')
const { createSyncManager } = require('./sync-manager.cjs')

function createRemoteClient(database) {
  return {
    async execute(sql, params = []) {
      const statement = database.prepare(sql)

      if (/^\s*(select|pragma)\b/i.test(sql)) {
        return {
          columns: [],
          rows: statement.all(...params),
        }
      }

      const result = statement.run(...params)
      return {
        columns: [],
        rows: [],
        lastInsertRowid: Number(result.lastInsertRowid ?? 0),
        rowsAffected: result.changes ?? 0,
      }
    },
  }
}

function createLocalDatabase() {
  const db = new Database(':memory:')

  db.exec(`
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

    CREATE TABLE sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      row_payload TEXT,
      local_updated_at TEXT,
      base_remote_updated_at TEXT,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(table_name, record_id)
    );

    CREATE TABLE sync_state (
      table_name TEXT PRIMARY KEY,
      last_pulled_at TEXT,
      last_sync_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE order_sync_queue (
      order_id INTEGER PRIMARY KEY,
      operation TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  return db
}

function createRemoteDatabase() {
  const db = new Database(':memory:')

  db.exec(`
    CREATE TABLE sync_metadata (
      id INTEGER PRIMARY KEY,
      version INTEGER NOT NULL
    );

    INSERT INTO sync_metadata (id, version) VALUES (1, 1);

    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      updated_at TEXT
    );

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

    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      updated_at TEXT
    );

    CREATE TABLE company_settings (
      id INTEGER PRIMARY KEY,
      updated_at TEXT
    );

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      updated_at TEXT
    );

    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER,
      updated_at TEXT
    );

    CREATE TABLE product_attributes (
      id INTEGER PRIMARY KEY,
      updated_at TEXT
    );

    CREATE TABLE product_variants (
      id INTEGER PRIMARY KEY,
      parent_product_id INTEGER,
      image TEXT,
      updated_at TEXT
    );

    CREATE TABLE product_variant_settings (
      id INTEGER PRIMARY KEY,
      product_id INTEGER,
      updated_at TEXT
    );
  `)

  return db
}

function insertProduct(database, { image, updatedAt }) {
  database
    .prepare(
      `INSERT INTO products (
        id, name, description, price, cost, stock, category, barcode, barcode_normalized, image,
        is_active, variant_type, default_variant_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      8,
      'Bananas (per lb)',
      'Fresh organic bananas',
      1.29,
      0.65,
      150,
      'Fresh Produce',
      '4444555566667',
      '4444555566667',
      image,
      1,
      'simple',
      null,
      '2024-01-08T00:00:00.000Z',
      updatedAt,
    )
}

function setProductsWatermark(database, value = '2026-03-27T16:00:00.000Z') {
  database
    .prepare(
      `INSERT INTO sync_state (table_name, last_pulled_at, last_sync_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(table_name) DO UPDATE SET
         last_pulled_at = excluded.last_pulled_at,
         last_sync_at = excluded.last_sync_at,
         updated_at = excluded.updated_at`,
    )
    .run('products', value, null, value)
}

describe('createSyncManager product image repair', () => {
  let localDb
  let remoteDb
  let syncManager

  beforeEach(() => {
    localDb = createLocalDatabase()
    remoteDb = createRemoteDatabase()
    syncManager = createSyncManager({
      getDatabase: () => localDb,
      getRemoteConfig: () => ({
        configured: true,
        url: 'libsql://remote.test',
        authToken: 'test-token',
      }),
      getRemoteClient: async () => createRemoteClient(remoteDb),
    })
  })

  it('repairs a blank local product image from the remote row', async () => {
    insertProduct(localDb, { image: '', updatedAt: '2024-01-22T12:15:00.000Z' })
    insertProduct(remoteDb, {
      image: 'products/2026/03/347d6c9f-eb61-434c-ad82-f609fa390ad0.png',
      updatedAt: '2026-03-27T15:15:07.009Z',
    })

    setProductsWatermark(localDb)

    await syncManager.triggerSync({ foreground: true })

    const repaired = localDb.prepare(`SELECT image, updated_at FROM products WHERE id = 8`).get()
    expect(repaired).toEqual({
      image: 'products/2026/03/347d6c9f-eb61-434c-ad82-f609fa390ad0.png',
      updated_at: '2026-03-27T15:15:07.009Z',
    })
  })

  it('does not overwrite a blank local image when the product has an open outbox row', async () => {
    insertProduct(localDb, { image: '', updatedAt: '2024-01-22T12:15:00.000Z' })
    insertProduct(remoteDb, {
      image: 'products/2026/03/347d6c9f-eb61-434c-ad82-f609fa390ad0.png',
      updatedAt: '2026-03-27T15:15:07.009Z',
    })
    setProductsWatermark(localDb)

    localDb
      .prepare(
        `INSERT INTO sync_outbox (
          table_name, record_id, operation, row_payload, local_updated_at, base_remote_updated_at,
          status, attempts, last_error, synced_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'products',
        '8',
        'UPDATE',
        JSON.stringify({ id: 8, image: '' }),
        '2026-03-27T16:00:00.000Z',
        '2024-01-22T12:15:00.000Z',
        'pending',
        0,
        null,
        null,
        '2026-03-27T16:00:00.000Z',
        '2026-03-27T16:00:00.000Z',
      )

    await syncManager.triggerSync({ foreground: true })

    const product = localDb.prepare(`SELECT image, updated_at FROM products WHERE id = 8`).get()
    expect(product).toEqual({
      image: '',
      updated_at: '2024-01-22T12:15:00.000Z',
    })
  })

  it('does nothing when the local product image is already populated', async () => {
    insertProduct(localDb, {
      image: 'products/2026/03/already-local.png',
      updatedAt: '2024-01-22T12:15:00.000Z',
    })
    insertProduct(remoteDb, {
      image: 'products/2026/03/347d6c9f-eb61-434c-ad82-f609fa390ad0.png',
      updatedAt: '2026-03-27T15:15:07.009Z',
    })
    setProductsWatermark(localDb)

    await syncManager.triggerSync({ foreground: true })

    const product = localDb.prepare(`SELECT image, updated_at FROM products WHERE id = 8`).get()
    expect(product).toEqual({
      image: 'products/2026/03/already-local.png',
      updated_at: '2024-01-22T12:15:00.000Z',
    })
  })

  it('does nothing when the remote product image is blank', async () => {
    insertProduct(localDb, { image: '', updatedAt: '2024-01-22T12:15:00.000Z' })
    insertProduct(remoteDb, {
      image: '',
      updatedAt: '2026-03-27T15:15:07.009Z',
    })
    setProductsWatermark(localDb)

    await syncManager.triggerSync({ foreground: true })

    const product = localDb.prepare(`SELECT image, updated_at FROM products WHERE id = 8`).get()
    expect(product).toEqual({
      image: '',
      updated_at: '2024-01-22T12:15:00.000Z',
    })
  })
})
