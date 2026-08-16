const { beforeEach, describe, expect, it } = require('bun:test')
const { Database } = require('bun:sqlite')
const { createSyncManager, ensureLocalSyncSchema } = require('./src/index.cjs')

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

function createProductTables(database) {
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

    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER
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

function upsertSyncState(database, tableName, lastPulledAt) {
  database
    .prepare(
      `INSERT INTO sync_state (table_name, last_pulled_at, last_sync_at, updated_at)
       VALUES (?, ?, NULL, ?)
       ON CONFLICT(table_name) DO UPDATE SET
         last_pulled_at = excluded.last_pulled_at,
         updated_at = excluded.updated_at`,
    )
    .run(tableName, lastPulledAt, lastPulledAt)
}

function queueOutboxUpdate(database, payload, options = {}) {
  database
    .prepare(
      `INSERT INTO sync_outbox (
        table_name, record_id, operation, row_payload, local_updated_at, base_remote_updated_at,
        status, attempts, last_error, synced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)`,
    )
    .run(
      'products',
      String(payload.id),
      options.operation ?? 'UPDATE',
      JSON.stringify(payload),
      options.localUpdatedAt ?? payload.updated_at,
      options.baseRemoteUpdatedAt ?? '2026-01-01T00:00:00.000Z',
      options.status ?? 'pending',
      options.createdAt ?? payload.updated_at,
      options.updatedAt ?? payload.updated_at,
    )
}

describe('ensureLocalSyncSchema', () => {
  it('creates sync metadata tables and upgrades missing timestamp columns', () => {
    const database = new Database(':memory:')
    createProductTables(database)

    ensureLocalSyncSchema(database)

    const usersColumns = database.prepare('PRAGMA table_info("users")').all().map((column) => column.name)
    const orderItemColumns = database.prepare('PRAGMA table_info("order_items")').all().map((column) => column.name)
    const metadata = database.prepare('SELECT version FROM sync_metadata WHERE id = 1').get()
    const outboxTable = database.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_outbox'`).get()

    expect(outboxTable?.name).toBe('sync_outbox')
    expect(usersColumns).toContain('updated_at')
    expect(orderItemColumns).toContain('created_at')
    expect(orderItemColumns).toContain('updated_at')
    expect(metadata).toEqual({ version: 0 })
  })
})

describe('createSyncManager lean reconciliation', () => {
  let localDb
  let remoteDb
  let syncManager

  beforeEach(() => {
    localDb = new Database(':memory:')
    remoteDb = new Database(':memory:')
    createProductTables(localDb)
    createProductTables(remoteDb)
    ensureLocalSyncSchema(localDb)
    ensureLocalSyncSchema(remoteDb)
    remoteDb.prepare('UPDATE sync_metadata SET version = ? WHERE id = 1').run(1)

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

  it('keeps the local row during pull and pushes it when local updated_at is newer', async () => {
    const localRow = insertProduct(localDb, {
      name: 'Local Bananas',
      price: 2.49,
      updated_at: '2026-03-20T15:00:00.000Z',
    })
    insertProduct(remoteDb, {
      name: 'Remote Bananas',
      price: 1.99,
      updated_at: '2026-03-20T14:00:00.000Z',
    })

    queueOutboxUpdate(localDb, localRow)
    upsertSyncState(localDb, 'products', '2026-03-01T00:00:00.000Z')

    await syncManager.triggerSync({ foreground: true })

    const localAfter = localDb.prepare('SELECT name, price, updated_at FROM products WHERE id = 8').get()
    const remoteAfter = remoteDb.prepare('SELECT name, price, updated_at FROM products WHERE id = 8').get()
    const outboxAfter = localDb.prepare('SELECT status FROM sync_outbox WHERE table_name = ? AND record_id = ?').get('products', '8')

    expect(localAfter).toEqual({
      name: 'Local Bananas',
      price: 2.49,
      updated_at: '2026-03-20T15:00:00.000Z',
    })
    expect(remoteAfter).toEqual(localAfter)
    expect(outboxAfter).toEqual({ status: 'synced' })
  })

  it('accepts the remote row automatically when remote updated_at is newer', async () => {
    insertProduct(localDb, {
      name: 'Local Bananas',
      price: 2.49,
      updated_at: '2026-03-20T15:00:00.000Z',
    })
    insertProduct(remoteDb, {
      name: 'Remote Bananas',
      price: 3.19,
      updated_at: '2026-03-20T16:00:00.000Z',
    })

    queueOutboxUpdate(
      localDb,
      {
        id: 8,
        name: 'Local Bananas',
        description: 'Fresh',
        price: 2.49,
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
        updated_at: '2026-03-20T15:00:00.000Z',
      },
      {
        baseRemoteUpdatedAt: '2026-03-01T00:00:00.000Z',
      },
    )
    upsertSyncState(localDb, 'products', '2026-03-01T00:00:00.000Z')

    await syncManager.triggerSync({ foreground: true })

    const localAfter = localDb.prepare('SELECT name, price, updated_at FROM products WHERE id = 8').get()
    const outboxAfter = localDb.prepare('SELECT status FROM sync_outbox WHERE table_name = ? AND record_id = ?').get('products', '8')

    expect(localAfter).toEqual({
      name: 'Remote Bananas',
      price: 3.19,
      updated_at: '2026-03-20T16:00:00.000Z',
    })
    expect(outboxAfter).toEqual({ status: 'synced' })
  })

  it('prefers local values when timestamps are equal, including legacy conflict rows', async () => {
    const localRow = insertProduct(localDb, {
      name: 'Local Bananas',
      price: 2.89,
      updated_at: '2026-03-20T15:00:00.000Z',
    })
    insertProduct(remoteDb, {
      name: 'Remote Bananas',
      price: 1.99,
      updated_at: '2026-03-20T15:00:00.000Z',
    })

    queueOutboxUpdate(localDb, localRow, {
      status: 'conflict',
    })
    upsertSyncState(localDb, 'products', '2026-03-01T00:00:00.000Z')

    await syncManager.triggerSync({ foreground: true })

    const remoteAfter = remoteDb.prepare('SELECT name, price, updated_at FROM products WHERE id = 8').get()
    const localAfter = localDb.prepare('SELECT name, price, updated_at FROM products WHERE id = 8').get()
    const remainingConflicts = syncManager.getConflictSummary(localDb)

    expect(localAfter).toEqual({
      name: 'Local Bananas',
      price: 2.89,
      updated_at: '2026-03-20T15:00:00.000Z',
    })
    expect(remoteAfter).toEqual(localAfter)
    expect(remainingConflicts).toEqual([])
  })
})
