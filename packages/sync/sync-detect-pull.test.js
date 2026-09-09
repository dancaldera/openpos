import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync as Database } from 'node:sqlite'
const { createSyncManager } = await import('./src/sync-manager.cjs')
const { ensureLocalSyncSchema } = await import('./src/schema.cjs')

const ORDER_COLUMNS = [
  'id',
  'subtotal',
  'tax',
  'total',
  'status',
  'payment_method',
  'notes',
  'completed_at',
  'user_id',
  'customer_id',
  'created_at',
  'updated_at',
]

const ORDER_ITEM_COLUMNS = [
  'id',
  'order_id',
  'product_id',
  'product_name',
  'quantity',
  'unit_price',
  'total_price',
  'variant_id',
  'variant_attributes',
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

function addMissingColumns(database, tableName, fullColumns) {
  const existing = new Set(database.prepare(`PRAGMA table_info("${tableName}")`).all().map((column) => column.name))
  for (const column of fullColumns) {
    if (!existing.has(column)) {
      database.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${column}" TEXT`)
    }
  }
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

function createFilteredClient(database, hiddenColumnsByTable = {}) {
  const delegate = createRemoteClient(database)
  return {
    async execute(sql, params = []) {
      const pragmaMatch = /PRAGMA table_info\("?([^")]+)"?/i.exec(sql)
      if (pragmaMatch && hiddenColumnsByTable[pragmaMatch[1]]) {
        const hidden = new Set(hiddenColumnsByTable[pragmaMatch[1]])
        const rows = database.prepare(sql).all(...params)
        return { columns: [], rows: rows.filter((row) => !hidden.has(row.name)) }
      }
      return delegate.execute(sql, params)
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

function makeManager(localDb, client, options = {}) {
  return createSyncManager({
    getDatabase: () => localDb,
    getRemoteConfig: () => ({ configured: true, url: 'libsql://remote.test', authToken: 'token' }),
    getRemoteClient: async () => client,
    ...options,
  })
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
    image: 'img.png',
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

function insertOrder(database, values = {}) {
  const row = {
    id: 5,
    subtotal: 10,
    tax: 1,
    total: 11,
    status: 'open',
    payment_method: 'cash',
    notes: '',
    completed_at: null,
    user_id: 1,
    customer_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...values,
  }
  const columns = Object.keys(row)
  database
    .prepare(`INSERT INTO orders (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .run(...columns.map((c) => row[c]))
  return row
}

function insertOrderItem(database, values = {}) {
  const row = {
    id: 50,
    order_id: 5,
    product_id: 8,
    product_name: 'Bananas',
    quantity: 2,
    unit_price: 1.29,
    total_price: 2.58,
    variant_id: null,
    variant_attributes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...values,
  }
  const columns = Object.keys(row)
  database
    .prepare(`INSERT INTO order_items (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .run(...columns.map((c) => row[c]))
  return row
}

function queueOutbox(database, tableName, recordId, payload, options = {}) {
  database
    .prepare(
      `INSERT INTO sync_outbox (
        table_name, record_id, operation, row_payload, local_updated_at, base_remote_updated_at,
        status, attempts, last_error, synced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)`,
    )
    .run(
      tableName,
      String(recordId),
      options.operation ?? 'UPDATE',
      payload === null ? null : JSON.stringify(payload),
      options.localUpdatedAt ?? payload?.updated_at ?? null,
      options.baseRemoteUpdatedAt ?? null,
      options.status ?? 'pending',
      options.createdAt ?? '2026-01-01T00:00:00.000Z',
      options.updatedAt ?? '2026-01-01T00:00:00.000Z',
    )
}

function upsertSyncState(database, tableName, lastPulledAt) {
  database
    .prepare(
      `INSERT INTO sync_state (table_name, last_pulled_at, last_sync_at, updated_at)
       VALUES (?, ?, NULL, ?)
       ON CONFLICT(table_name) DO UPDATE SET last_pulled_at = excluded.last_pulled_at, updated_at = excluded.updated_at`,
    )
    .run(tableName, lastPulledAt, lastPulledAt)
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('change detection', () => {
  it('skips detection when the remote sentinel version is unchanged', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const first = await manager.triggerSync({ foreground: true })
    const second = await manager.triggerSync({ foreground: true })

    expect(first.status).toBe('online')
    expect(second.status).toBe('online')
    expect(second.lastSyncedAt).toBeTruthy()
  })

  it('runs full detection when the sentinel row is missing', async () => {
    const { localDb, remoteDb } = setupDbs()
    remoteDb.prepare('DELETE FROM sync_metadata WHERE id = 1').run()
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
  })

  it('runs full detection when the sentinel query fails', async () => {
    const { localDb, remoteDb } = setupDbs()
    const delegate = createRemoteClient(remoteDb)
    const manager = makeManager(localDb, {
      async execute(sql, params = []) {
        if (sql.includes('FROM sync_metadata')) {
          throw new Error('sentinel unavailable')
        }
        return delegate.execute(sql, params)
      },
    })

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
  })

  it('runs full detection when the remote version advances', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    await manager.triggerSync({ foreground: true })
    remoteDb.prepare('UPDATE sync_metadata SET version = version + 1 WHERE id = 1').run()
    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
  })

  it('includes hard-delete counts on forced syncs without reconciling', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true, force: true })

    expect(snapshot.status).toBe('online')
  })
})

describe('hard-delete reconciliation', () => {
  it('deletes local rows missing remotely while protecting open outbox rows', async () => {
    const { localDb, remoteDb } = setupDbs()
    const doomed = insertProduct(localDb, { id: 9, updated_at: '2026-02-01T00:00:00.000Z' })
    const shielded = insertProduct(localDb, { id: 10, updated_at: '2026-02-01T00:00:00.000Z' })
    queueOutbox(localDb, 'products', 10, shielded)
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    let snapshot = null
    for (let cycle = 0; cycle < 8; cycle++) {
      snapshot = await manager.triggerSync({ foreground: true })
    }

    expect(snapshot.status).toBe('online')
    expect(localDb.prepare('SELECT id FROM products WHERE id = 9').get()).toBeUndefined()
    expect(localDb.prepare('SELECT id FROM products WHERE id = 10').get()).toEqual({ id: 10 })
    expect(doomed.id).toBe(9)
  })
})

describe('order aggregate pull', () => {
  it('pulls changed orders and refreshes their item snapshots', async () => {
    const { localDb, remoteDb } = setupDbs()
    for (const database of [localDb, remoteDb]) {
      addMissingColumns(database, 'orders', ORDER_COLUMNS)
      addMissingColumns(database, 'order_items', ORDER_ITEM_COLUMNS)
    }
    insertOrder(localDb, { id: 5, status: 'open', updated_at: '2026-01-01T00:00:00.000Z' })
    insertOrderItem(localDb, { id: 50, order_id: 5, product_name: 'Stale' })
    insertOrder(remoteDb, { id: 5, status: 'paid', updated_at: '2026-06-01T00:00:00.000Z' })
    insertOrderItem(remoteDb, { id: 51, order_id: 5, product_name: 'Bananas', updated_at: '2026-06-01T00:00:00.000Z' })
    insertOrderItem(remoteDb, { id: 52, order_id: 5, product_name: 'Apples', updated_at: '2026-06-01T00:00:00.000Z' })
    upsertSyncState(localDb, 'orders', '2026-01-01T00:00:00.000Z')
    upsertSyncState(localDb, 'order_items', '2026-01-01T00:00:00.000Z')
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(localDb.prepare('SELECT status FROM orders WHERE id = 5').get()).toEqual({ status: 'paid' })
    expect(
      localDb.prepare('SELECT product_name FROM order_items WHERE order_id = 5 ORDER BY id').all(),
    ).toEqual([{ product_name: 'Bananas' }, { product_name: 'Apples' }])
    expect(localDb.prepare('SELECT last_pulled_at FROM sync_state WHERE table_name = ?').get('orders')).toEqual({
      last_pulled_at: '2026-06-01T00:00:00.000Z',
    })
  })

  it('skips orders and items with a pending local aggregate push', async () => {
    const { localDb, remoteDb } = setupDbs()
    for (const database of [localDb, remoteDb]) {
      addMissingColumns(database, 'orders', ORDER_COLUMNS)
      addMissingColumns(database, 'order_items', ORDER_ITEM_COLUMNS)
    }
    insertOrder(localDb, { id: 5, status: 'open', updated_at: '2026-01-01T00:00:00.000Z' })
    insertOrder(remoteDb, { id: 5, status: 'paid', updated_at: '2026-06-01T00:00:00.000Z' })
    insertOrderItem(remoteDb, { id: 51, order_id: 5, product_name: 'Bananas' })
    upsertSyncState(localDb, 'orders', '2026-01-01T00:00:00.000Z')
    upsertSyncState(localDb, 'order_items', '2026-01-01T00:00:00.000Z')
    localDb
      .prepare('INSERT INTO order_sync_queue (order_id, operation, attempts, last_error, created_at, updated_at) VALUES (?, ?, 0, NULL, ?, ?)')
      .run('5', 'UPSERT', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(localDb.prepare('SELECT status FROM orders WHERE id = 5').get()).toEqual({ status: 'open' })
    expect(localDb.prepare('SELECT COUNT(*) AS c FROM order_items').get()).toEqual({ c: 0 })
  })
})

describe('legacy remote schema compatibility', () => {
  it('falls back to created_at when the remote table lacks updated_at', async () => {
    const { localDb, remoteDb } = setupDbs()
    const localRow = insertProduct(localDb, { id: 8, name: 'Local New', updated_at: '2026-07-02T00:00:00.000Z' })
    insertProduct(remoteDb, { id: 8, name: 'Remote Old', created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z' })
    queueOutbox(localDb, 'products', 8, localRow)
    upsertSyncState(localDb, 'products', '2026-08-01T00:00:00.000Z')
    const manager = makeManager(localDb, createFilteredClient(remoteDb, { products: ['updated_at'] }))

    const snapshot = await manager.triggerSync({ foreground: true })
    const remote = remoteDb.prepare('SELECT name FROM products WHERE id = 8').get()
    const outbox = localDb.prepare(`SELECT status, last_error FROM sync_outbox WHERE table_name = 'products' AND record_id = '8'`).get()

    expect(snapshot.status).toBe('online')
    expect(remote).toEqual({ name: 'Remote Old' })
    expect(outbox.status).toBe('error')
    expect(outbox.last_error).toContain('NOT NULL constraint failed')
  })

  it('records an error when the remote table has no compatible watermark', async () => {
    const { localDb, remoteDb } = setupDbs()
    const localRow = insertProduct(localDb, { id: 8, name: 'Local New', updated_at: '2026-07-02T00:00:00.000Z' })
    insertProduct(remoteDb, { id: 8, name: 'Remote Old', updated_at: '2026-07-01T00:00:00.000Z' })
    queueOutbox(localDb, 'products', 8, localRow)
    upsertSyncState(localDb, 'products', '2026-08-01T00:00:00.000Z')
    const manager = makeManager(localDb, createFilteredClient(remoteDb, { products: ['updated_at', 'created_at'] }))

    const snapshot = await manager.triggerSync({ foreground: true })
    const remote = remoteDb.prepare('SELECT name FROM products WHERE id = 8').get()
    const outbox = localDb.prepare(`SELECT status FROM sync_outbox WHERE table_name = 'products' AND record_id = '8'`).get()

    expect(snapshot.status).toBe('online')
    expect(remote).toEqual({ name: 'Remote Old' })
    expect(outbox).toEqual({ status: 'error' })
  })

  it('attempts do-nothing writes for id-only remote rows', async () => {
    const { localDb, remoteDb } = setupDbs()
    const localRow = insertProduct(localDb, { id: 8, name: 'Local New', updated_at: '2026-07-02T00:00:00.000Z' })
    insertProduct(remoteDb, { id: 8, name: 'Remote Old', updated_at: '2026-07-01T00:00:00.000Z' })
    queueOutbox(localDb, 'products', 8, localRow)
    upsertSyncState(localDb, 'products', '2026-08-01T00:00:00.000Z')
    const hidden = [
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
    const manager = makeManager(localDb, createFilteredClient(remoteDb, { products: hidden }))

    const snapshot = await manager.triggerSync({ foreground: true })
    const outbox = localDb.prepare(`SELECT status FROM sync_outbox WHERE table_name = 'products' AND record_id = '8'`).get()

    expect(snapshot.status).toBe('online')
    expect(outbox).toEqual({ status: 'error' })
  })

  it('reports remote tables with no writable columns as outbox errors', async () => {
    const { localDb, remoteDb } = setupDbs()
    const localRow = insertProduct(localDb, { id: 8, name: 'Local New', updated_at: '2026-07-02T00:00:00.000Z' })
    insertProduct(remoteDb, { id: 8, name: 'Remote Old', updated_at: '2026-07-01T00:00:00.000Z' })
    queueOutbox(localDb, 'products', 8, localRow)
    upsertSyncState(localDb, 'products', '2026-08-01T00:00:00.000Z')
    const hidden = [
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
    const manager = makeManager(localDb, createFilteredClient(remoteDb, { products: hidden }))

    const snapshot = await manager.triggerSync({ foreground: true })
    const outbox = localDb.prepare(`SELECT status, last_error FROM sync_outbox WHERE table_name = 'products' AND record_id = '8'`).get()

    expect(snapshot.status).toBe('online')
    expect(outbox.status).toBe('error')
    expect(outbox.last_error).toContain('no compatible writable columns')
  })

  it('goes offline when a changed remote table has no queryable watermark', async () => {
    const { localDb, remoteDb } = setupDbs()
    insertProduct(remoteDb, { id: 8, name: 'Remote', updated_at: '2026-07-01T00:00:00.000Z' })
    upsertSyncState(localDb, 'products', '2026-01-01T00:00:00.000Z')
    const manager = makeManager(localDb, createFilteredClient(remoteDb, { products: ['updated_at', 'created_at'] }))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('offline')
    expect(snapshot.lastError).toBeTruthy()
  })
})

describe('product image repair', () => {
  it('backfills blank local images from remote rows', async () => {
    const { localDb, remoteDb } = setupDbs()
    insertProduct(localDb, { id: 8, image: '', updated_at: '2026-01-01T00:00:00.000Z' })
    insertProduct(remoteDb, { id: 8, image: 'remote.png', updated_at: '2026-01-01T00:00:00.000Z' })
    upsertSyncState(localDb, 'products', '2026-02-01T00:00:00.000Z')
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(localDb.prepare('SELECT image FROM products WHERE id = 8').get()).toEqual({ image: 'remote.png' })
  })

  it('repairs nothing when remote images are also blank', async () => {
    const { localDb, remoteDb } = setupDbs()
    insertProduct(localDb, { id: 8, image: '', updated_at: '2026-01-01T00:00:00.000Z' })
    insertProduct(remoteDb, { id: 8, image: '', updated_at: '2026-01-01T00:00:00.000Z' })
    upsertSyncState(localDb, 'products', '2026-02-01T00:00:00.000Z')
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(localDb.prepare('SELECT image FROM products WHERE id = 8').get()).toEqual({ image: '' })
  })
})

describe('tables without a watermark column', () => {
  const ghostConfig = { tableName: 'ghost', primaryKey: 'id', columns: ['id', 'name'], pullOrder: 999 }

  async function withGhostTable(run) {
    const { replicatedTables } = await import('@openpos/data')
    replicatedTables.push(ghostConfig)
    try {
      await run()
    } finally {
      replicatedTables.splice(replicatedTables.indexOf(ghostConfig), 1)
    }
  }

  it('always pulls watermarkless tables and skips the watermark update', async () => {
    await withGhostTable(async () => {
      const { localDb, remoteDb } = setupDbs()
      localDb.exec('CREATE TABLE ghost (id INTEGER PRIMARY KEY, name TEXT)')
      remoteDb.exec('CREATE TABLE ghost (id INTEGER PRIMARY KEY, name TEXT)')
      remoteDb.prepare('INSERT INTO ghost (id, name) VALUES (1, ?)').run('Spook')
      const manager = makeManager(localDb, createRemoteClient(remoteDb))

      const snapshot = await manager.triggerSync({ foreground: true })

      expect(snapshot.status).toBe('online')
      expect(localDb.prepare('SELECT name FROM ghost WHERE id = 1').get()).toEqual({ name: 'Spook' })
      expect(
        localDb.prepare('SELECT * FROM sync_state WHERE table_name = ?').get('ghost'),
      ).toBeUndefined()
    })
  })

  it('handles watermarkless tables with no remote rows', async () => {
    await withGhostTable(async () => {
      const { localDb, remoteDb } = setupDbs()
      remoteDb.exec('CREATE TABLE ghost (id INTEGER PRIMARY KEY, name TEXT)')
      const manager = makeManager(localDb, createRemoteClient(remoteDb))

      const snapshot = await manager.triggerSync({ foreground: true })

      expect(snapshot.status).toBe('online')
    })
  })
})

describe('image repair races', () => {
  it('backfills null local images from remote rows', async () => {
    const { localDb, remoteDb } = setupDbs()
    insertProduct(localDb, { id: 8, image: null, updated_at: '2026-01-01T00:00:00.000Z' })
    insertProduct(remoteDb, { id: 8, image: 'remote.png', updated_at: '2026-01-01T00:00:00.000Z' })
    upsertSyncState(localDb, 'products', '2026-02-01T00:00:00.000Z')
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(localDb.prepare('SELECT image FROM products WHERE id = 8').get()).toEqual({ image: 'remote.png' })
  })

  it('skips repair candidates deleted mid-sync', async () => {
    const { localDb, remoteDb } = setupDbs()
    insertProduct(localDb, { id: 8, image: '', updated_at: '2026-01-01T00:00:00.000Z' })
    insertProduct(remoteDb, { id: 8, image: 'remote.png', updated_at: '2026-01-01T00:00:00.000Z' })
    upsertSyncState(localDb, 'products', '2026-02-01T00:00:00.000Z')
    const delegate = createRemoteClient(remoteDb)
    const manager = makeManager(localDb, {
      async execute(sql, params = []) {
        if (sql.includes('COALESCE(image')) {
          localDb.prepare('DELETE FROM products WHERE id = 8').run()
        }
        return delegate.execute(sql, params)
      },
    })

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(localDb.prepare('SELECT id FROM products WHERE id = 8').get()).toBeUndefined()
  })

  it('keeps local images set mid-sync', async () => {
    const { localDb, remoteDb } = setupDbs()
    insertProduct(localDb, { id: 8, image: '', updated_at: '2026-01-01T00:00:00.000Z' })
    insertProduct(remoteDb, { id: 8, image: 'remote.png', updated_at: '2026-01-01T00:00:00.000Z' })
    upsertSyncState(localDb, 'products', '2026-02-01T00:00:00.000Z')
    const delegate = createRemoteClient(remoteDb)
    const manager = makeManager(localDb, {
      async execute(sql, params = []) {
        if (sql.includes('COALESCE(image')) {
          localDb.prepare('UPDATE products SET image = ? WHERE id = 8').run('local.png')
        }
        return delegate.execute(sql, params)
      },
    })

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(localDb.prepare('SELECT image FROM products WHERE id = 8').get()).toEqual({ image: 'local.png' })
  })

  it('skips repair when products are not replicated', async () => {
    const { replicatedTablesByName } = await import('@openpos/data')
    const saved = replicatedTablesByName.products
    delete replicatedTablesByName.products
    try {
      const { localDb, remoteDb } = setupDbs()
      insertProduct(localDb, { id: 8, image: '', updated_at: '2026-01-01T00:00:00.000Z' })
      insertProduct(remoteDb, { id: 8, image: 'remote.png', updated_at: '2026-01-01T00:00:00.000Z' })
      upsertSyncState(localDb, 'products', '2026-02-01T00:00:00.000Z')
      const manager = makeManager(localDb, createRemoteClient(remoteDb))

      const snapshot = await manager.triggerSync({ foreground: true })

      expect(snapshot.status).toBe('online')
      expect(localDb.prepare('SELECT image FROM products WHERE id = 8').get()).toEqual({ image: '' })
    } finally {
      replicatedTablesByName.products = saved
    }
  })
})

describe('queued order snapshots', () => {
  function queueUpsert(localDb, orderId) {
    localDb
      .prepare('INSERT INTO order_sync_queue (order_id, operation, attempts, last_error, created_at, updated_at) VALUES (?, ?, 0, NULL, ?, ?)')
      .run(String(orderId), 'UPSERT', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')
  }

  it('pulls items only for orders without a pending aggregate push', async () => {
    const { localDb, remoteDb } = setupDbs()
    for (const database of [localDb, remoteDb]) {
      addMissingColumns(database, 'orders', ORDER_COLUMNS)
      addMissingColumns(database, 'order_items', ORDER_ITEM_COLUMNS)
    }
    insertOrder(localDb, { id: 5, status: 'open', updated_at: '2026-01-01T00:00:00.000Z' })
    insertOrder(localDb, { id: 6, status: 'open', updated_at: '2026-01-01T00:00:00.000Z' })
    insertOrder(remoteDb, { id: 5, status: 'paid', updated_at: '2026-06-01T00:00:00.000Z' })
    insertOrder(remoteDb, { id: 6, status: 'paid', updated_at: '2026-06-01T00:00:00.000Z' })
    insertOrderItem(remoteDb, { id: 51, order_id: 5, product_name: 'Bananas', updated_at: '2026-06-01T00:00:00.000Z' })
    insertOrderItem(remoteDb, { id: 61, order_id: 6, product_name: 'Apples', updated_at: '2026-06-01T00:00:00.000Z' })
    upsertSyncState(localDb, 'orders', '2026-01-01T00:00:00.000Z')
    upsertSyncState(localDb, 'order_items', '2026-01-01T00:00:00.000Z')
    queueUpsert(localDb, 5)
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(localDb.prepare('SELECT status FROM orders WHERE id = 5').get()).toEqual({ status: 'open' })
    expect(localDb.prepare('SELECT status FROM orders WHERE id = 6').get()).toEqual({ status: 'paid' })
    expect(localDb.prepare('SELECT order_id FROM order_items ORDER BY id').all()).toEqual([{ order_id: 6 }])
  })

  it('skips the item snapshot when every changed order is queued', async () => {
    const { localDb, remoteDb } = setupDbs()
    for (const database of [localDb, remoteDb]) {
      addMissingColumns(database, 'orders', ORDER_COLUMNS)
      addMissingColumns(database, 'order_items', ORDER_ITEM_COLUMNS)
    }
    insertOrder(localDb, { id: 5, status: 'open', updated_at: '2026-01-01T00:00:00.000Z' })
    insertOrder(remoteDb, { id: 5, status: 'paid', updated_at: '2026-06-01T00:00:00.000Z' })
    insertOrderItem(remoteDb, { id: 51, order_id: 5, product_name: 'Bananas', updated_at: '2026-06-01T00:00:00.000Z' })
    upsertSyncState(localDb, 'orders', '2026-01-01T00:00:00.000Z')
    upsertSyncState(localDb, 'order_items', '2026-01-01T00:00:00.000Z')
    queueUpsert(localDb, 5)
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(localDb.prepare('SELECT status FROM orders WHERE id = 5').get()).toEqual({ status: 'open' })
    expect(localDb.prepare('SELECT COUNT(*) AS c FROM order_items').get()).toEqual({ c: 0 })
  })

  it('clears pulled orders that have no items remotely', async () => {
    const { localDb, remoteDb } = setupDbs()
    for (const database of [localDb, remoteDb]) {
      addMissingColumns(database, 'orders', ORDER_COLUMNS)
      addMissingColumns(database, 'order_items', ORDER_ITEM_COLUMNS)
    }
    insertOrder(localDb, { id: 5, status: 'open', updated_at: '2026-01-01T00:00:00.000Z' })
    insertOrder(remoteDb, { id: 5, status: 'paid', updated_at: '2026-06-01T00:00:00.000Z' })
    insertOrderItem(localDb, { id: 50, order_id: 5, product_name: 'Stale', updated_at: '2026-01-01T00:00:00.000Z' })
    insertOrderItem(remoteDb, { id: 71, order_id: 7, product_name: 'Other', updated_at: '2026-06-01T00:00:00.000Z' })
    upsertSyncState(localDb, 'orders', '2026-01-01T00:00:00.000Z')
    upsertSyncState(localDb, 'order_items', '2026-01-01T00:00:00.000Z')
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(localDb.prepare('SELECT status FROM orders WHERE id = 5').get()).toEqual({ status: 'paid' })
    expect(localDb.prepare('SELECT COUNT(*) AS c FROM order_items').get()).toEqual({ c: 0 })
  })
})

describe('sentinel edge cases', () => {
  it('proceeds when the remote sentinel row is missing', async () => {
    const { localDb, remoteDb } = setupDbs()
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const first = await manager.triggerSync({ foreground: true })
    expect(first.status).toBe('online')

    remoteDb.prepare('DELETE FROM sync_metadata').run()
    const second = await manager.triggerSync({ foreground: true })

    expect(second.status).toBe('online')
  })
})
