import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync as Database } from 'node:sqlite'
const { createSyncManager } = await import('./src/sync-manager.cjs')
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

function makeManager(localDb, client) {
  return createSyncManager({
    getDatabase: () => localDb,
    getRemoteConfig: () => ({ configured: true, url: 'libsql://remote.test', authToken: 'token' }),
    getRemoteClient: async () => client,
  })
}

function fullProduct(values = {}) {
  return {
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
}

function insertProduct(database, values = {}) {
  const row = fullProduct(values)
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

function queueOutbox(database, tableName, recordId, payload, options = {}) {
  database
    .prepare(
      `INSERT INTO sync_outbox (
        table_name, record_id, operation, row_payload, local_updated_at, base_remote_updated_at,
        status, attempts, last_error, synced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    )
    .run(
      tableName,
      String(recordId),
      options.operation ?? 'UPDATE',
      typeof payload === 'string' || payload === null ? payload : JSON.stringify(payload),
      options.localUpdatedAt ?? payload?.updated_at ?? null,
      options.baseRemoteUpdatedAt ?? null,
      options.status ?? 'pending',
      options.attempts ?? 0,
      options.createdAt ?? '2026-01-01T00:00:00.000Z',
      options.updatedAt ?? '2026-01-01T00:00:00.000Z',
    )
}

function outboxRow(database, tableName, recordId) {
  return database.prepare('SELECT * FROM sync_outbox WHERE table_name = ? AND record_id = ?').get(tableName, String(recordId))
}

const CUSTOMER_COLUMNS = [
  'id',
  'customer_number',
  'first_name',
  'last_name',
  'company_name',
  'email',
  'phone',
  'phone_secondary',
  'address_line1',
  'address_line2',
  'city',
  'state',
  'postal_code',
  'country',
  'customer_type',
  'customer_segment',
  'credit_limit',
  'current_balance',
  'tax_exempt',
  'tax_id',
  'loyalty_points',
  'total_purchases',
  'total_orders',
  'first_purchase_date',
  'last_purchase_date',
  'is_active',
  'notes',
  'tags',
  'custom_fields',
  'created_at',
  'updated_at',
  'created_by',
  'deleted_at',
]

function addCustomersColumns(database) {
  const existing = new Set(database.prepare('PRAGMA table_info("customers")').all().map((column) => column.name))
  for (const column of CUSTOMER_COLUMNS) {
    if (!existing.has(column)) {
      database.exec(`ALTER TABLE "customers" ADD COLUMN "${column}" TEXT`)
    }
  }
}

function productInsertStatement(values = {}) {
  const row = { ...fullProduct(), ...values }
  delete row.id
  const columns = Object.keys(row)
  return {
    sql: `INSERT INTO products (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    params: columns.map((column) => row[column]),
  }
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('outbox flush', () => {
  it('errors rows for unknown replicated tables', async () => {
    const { localDb, remoteDb } = setupDbs()
    queueOutbox(localDb, 'mystery', 1, { id: 1 })
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })
    const row = outboxRow(localDb, 'mystery', 1)

    expect(snapshot.status).toBe('online')
    expect(row.status).toBe('error')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toBe('Unknown replicated table: mystery')
  })

  it('resolves deletes that are already gone remotely', async () => {
    const { localDb, remoteDb } = setupDbs()
    const localRow = insertProduct(localDb, { id: 8 })
    queueOutbox(localDb, 'products', 8, localRow, { operation: 'DELETE' })
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(outboxRow(localDb, 'products', 8).status).toBe('synced')
    expect(localDb.prepare('SELECT id FROM products WHERE id = 8').get()).toEqual({ id: 8 })
  })

  it('pushes deletes that still exist remotely and stamps sync state', async () => {
    const { localDb, remoteDb } = setupDbs()
    const localRow = insertProduct(localDb, { id: 8, name: 'Gone Local' })
    insertProduct(remoteDb, { id: 8, name: 'Still Remote' })
    queueOutbox(localDb, 'products', 8, localRow, { operation: 'DELETE' })
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })
    const state = localDb.prepare('SELECT last_sync_at FROM sync_state WHERE table_name = ?').get('products')

    expect(snapshot.status).toBe('online')
    expect(outboxRow(localDb, 'products', 8).status).toBe('synced')
    expect(remoteDb.prepare('SELECT id FROM products WHERE id = 8').get()).toBeUndefined()
    expect(state.last_sync_at).toBeTruthy()
  })

  it('resolves rows that already match remotely', async () => {
    const { localDb, remoteDb } = setupDbs()
    const localRow = insertProduct(localDb, { id: 8, name: 'Same', updated_at: '2026-03-01T00:00:00.000Z' })
    insertProduct(remoteDb, { id: 8, name: 'Same', updated_at: '2026-03-01T00:00:00.000Z' })
    queueOutbox(localDb, 'products', 8, localRow)
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(outboxRow(localDb, 'products', 8).status).toBe('synced')
  })

  it('treats json text, objects, and arrays as equal after normalization', async () => {
    const { localDb, remoteDb } = setupDbs()
    const localRow = insertProduct(localDb, {
      id: 8,
      notes: undefined,
      description: '{"b":2,"a":1}',
      barcode: '[1,{"x":"y"}]',
      category: 'Fresh Produce',
    })
    insertProduct(remoteDb, {
      id: 8,
      description: '{"a":1,"b":2}',
      barcode: '[1,{"x":"y"}]',
    })
    const payload = { ...localRow, description: { b: 2, a: 1 }, barcode: [1, { x: 'y' }] }
    queueOutbox(localDb, 'products', 8, payload)
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(outboxRow(localDb, 'products', 8).status).toBe('synced')
  })

  it('accepts the remote row when the local write has no timestamp', async () => {
    const { localDb, remoteDb } = setupDbs()
    insertProduct(localDb, { id: 8, name: 'Local', updated_at: '2026-03-01T00:00:00.000Z' })
    insertProduct(remoteDb, { id: 8, name: 'Remote', updated_at: '2026-04-01T00:00:00.000Z' })
    const payload = fullProduct({ id: 8, name: 'Local', updated_at: null })
    queueOutbox(localDb, 'products', 8, payload, { localUpdatedAt: null })
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(outboxRow(localDb, 'products', 8).status).toBe('synced')
    expect(localDb.prepare('SELECT name FROM products WHERE id = 8').get()).toEqual({ name: 'Remote' })
  })

  it('errors rows with a missing payload', async () => {
    const { localDb, remoteDb } = setupDbs()
    queueOutbox(localDb, 'products', 8, null)
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })
    const row = outboxRow(localDb, 'products', 8)

    expect(snapshot.status).toBe('online')
    expect(row.status).toBe('error')
    expect(row.last_error).toBe('Missing row payload')
  })

  it('errors rows with an unparseable payload', async () => {
    const { localDb, remoteDb } = setupDbs()
    queueOutbox(localDb, 'products', 8, '{not-json')
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(outboxRow(localDb, 'products', 8).status).toBe('error')
  })

  it('errors rows with non-numeric record ids', async () => {
    const { localDb, remoteDb } = setupDbs()
    queueOutbox(localDb, 'products', 'abc', fullProduct({ id: 'abc' }))
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const snapshot = await manager.triggerSync({ foreground: true })

    expect(snapshot.status).toBe('online')
    expect(outboxRow(localDb, 'products', 'abc').status).toBe('error')
  })

  it('records plain-thrown push failures', async () => {
    const { localDb, remoteDb } = setupDbs()
    const localRow = insertProduct(localDb, { id: 8, name: 'Pushed', updated_at: '2026-05-02T00:00:00.000Z' })
    queueOutbox(localDb, 'products', 8, localRow)
    const delegate = createRemoteClient(remoteDb)
    const manager = makeManager(localDb, {
      async execute(sql, params = []) {
        if (/^\s*insert\s+into\s+"products"/i.test(sql)) {
          throw 'push boom'
        }
        return delegate.execute(sql, params)
      },
    })

    const snapshot = await manager.triggerSync({ foreground: true })
    const row = outboxRow(localDb, 'products', 8)

    expect(snapshot.status).toBe('online')
    expect(row.status).toBe('error')
    expect(row.last_error).toBe('push boom')
  })
})

describe('conflict summary', () => {
  it('maps conflict rows with default reasons', () => {
    const { localDb, remoteDb } = setupDbs()
    queueOutbox(localDb, 'products', 8, fullProduct({ id: 8 }), { status: 'conflict', updatedAt: '2026-01-02T00:00:00.000Z' })
    queueOutbox(localDb, 'products', 9, fullProduct({ id: 9 }), { status: 'conflict', updatedAt: '2026-01-03T00:00:00.000Z' })
    localDb.prepare(`UPDATE sync_outbox SET last_error = 'custom reason' WHERE record_id = '9'`).run()
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const summary = manager.getConflictSummary(localDb)

    expect(summary).toEqual([
      expect.objectContaining({ tableName: 'products', recordId: '9', reason: 'custom reason' }),
      expect.objectContaining({ tableName: 'products', recordId: '8', reason: 'Remote row won the conflict', remoteUpdatedAt: null }),
    ])
  })

  it('maps conflict rows with null timestamps', () => {
    const { localDb, remoteDb } = setupDbs()
    queueOutbox(localDb, 'products', 8, fullProduct({ id: 8 }), { status: 'conflict' })
    localDb.prepare('UPDATE sync_outbox SET local_updated_at = NULL WHERE record_id = ?').run('8')
    const manager = makeManager(localDb, createRemoteClient(remoteDb))

    const summary = manager.getConflictSummary(localDb)

    expect(summary).toEqual([
      expect.objectContaining({ tableName: 'products', recordId: '8', localUpdatedAt: null }),
    ])
  })
})

describe('write capture', () => {
  function captureSetup() {
    const { localDb, remoteDb } = setupDbs()
    const manager = createSyncManager({
      getDatabase: () => localDb,
      getRemoteConfig: () => ({ configured: false }),
    })
    return { localDb, manager }
  }

  it('tracks inserts with their new rows', () => {
    const { localDb, manager } = captureSetup()
    const { sql, params } = productInsertStatement({ name: 'Kiwi' })
    const captured = manager.captureWrite(localDb, sql, params)
    const before = localDb.prepare('SELECT COUNT(*) AS c FROM sync_outbox').get()

    const result = localDb.prepare(sql).run(...params)
    manager.trackWrite(localDb, captured, { lastInsertRowid: Number(result.lastInsertRowid) })

    const row = outboxRow(localDb, 'products', result.lastInsertRowid)
    expect(before).toEqual({ c: 0 })
    expect(row.operation).toBe('INSERT')
    expect(row.status).toBe('pending')
    expect(row.base_remote_updated_at).toBeNull()
  })

  it('tracks or-replace inserts', () => {
    const { localDb, manager } = captureSetup()
    insertProduct(localDb, { id: 8 })
    const row = fullProduct({ id: 8, name: 'Mango' })
    const columns = Object.keys(row)
    const sql = `INSERT OR REPLACE INTO products (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
    const params = columns.map((column) => row[column])
    const captured = manager.captureWrite(localDb, sql, params)
    expect(captured?.parsed.operation).toBe('INSERT')

    localDb.prepare(sql).run(...params)
    manager.trackWrite(localDb, captured, { lastInsertRowid: 8 })

    expect(outboxRow(localDb, 'products', 8).operation).toBe('INSERT')
  })

  it('ignores inserts without an insert result', () => {
    const { localDb, manager } = captureSetup()
    const first = manager.captureWrite(localDb, 'INSERT INTO products (name) VALUES (?)', ['A'])
    manager.trackWrite(localDb, first, null)
    const second = manager.captureWrite(localDb, 'INSERT INTO products (name) VALUES (?)', ['B'])
    manager.trackWrite(localDb, second, {})

    expect(localDb.prepare('SELECT COUNT(*) AS c FROM sync_outbox').get()).toEqual({ c: 0 })
  })

  it('ignores inserts whose row vanished before tracking', () => {
    const { localDb, manager } = captureSetup()
    const { sql, params } = productInsertStatement({ name: 'Ghost' })
    const captured = manager.captureWrite(localDb, sql, params)
    const result = localDb.prepare(sql).run(...params)
    localDb.prepare('DELETE FROM products WHERE id = ?').run(Number(result.lastInsertRowid))

    manager.trackWrite(localDb, captured, { lastInsertRowid: Number(result.lastInsertRowid) })

    expect(localDb.prepare('SELECT COUNT(*) AS c FROM sync_outbox').get()).toEqual({ c: 0 })
  })

  it('tracks updates with before and after rows', () => {
    const { localDb, manager } = captureSetup()
    insertProduct(localDb, { id: 8, name: 'Before', updated_at: '2026-01-01T00:00:00.000Z' })
    const captured = manager.captureWrite(localDb, 'UPDATE products SET name = ? WHERE id = ?', ['After', 8])

    localDb.prepare(`UPDATE products SET name = ?, updated_at = ? WHERE id = ?`).run('After', '2026-02-01T00:00:00.000Z', 8)
    manager.trackWrite(localDb, captured, {})

    const row = outboxRow(localDb, 'products', 8)
    expect(row.operation).toBe('UPDATE')
    expect(JSON.parse(row.row_payload).name).toBe('After')
    expect(row.local_updated_at).toBe('2026-02-01T00:00:00.000Z')
    expect(row.base_remote_updated_at).toBe('2026-01-01T00:00:00.000Z')
  })

  it('falls back to fresh timestamps when updated rows lack them', () => {
    const { localDb, manager } = captureSetup()
    addCustomersColumns(localDb)
    localDb.prepare('INSERT INTO customers (id, updated_at) VALUES (3, NULL)').run()
    const captured = manager.captureWrite(localDb, 'UPDATE customers SET id = ? WHERE id = ?', [3, 3])

    localDb.prepare('UPDATE customers SET id = ? WHERE id = ?').run(3, 3)
    manager.trackWrite(localDb, captured, {})

    const row = outboxRow(localDb, 'customers', 3)
    expect(row.operation).toBe('UPDATE')
    expect(row.local_updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(row.base_remote_updated_at).toBeNull()
  })

  it('uses created_at when inserted rows lack updated_at', () => {
    const { localDb, manager } = captureSetup()
    const captured = manager.captureWrite(localDb, 'INSERT INTO users (created_at) VALUES (?)', ['2026-01-05T00:00:00.000Z'])

    const result = localDb.prepare('INSERT INTO users (created_at) VALUES (?)').run('2026-01-05T00:00:00.000Z')
    manager.trackWrite(localDb, captured, { lastInsertRowid: Number(result.lastInsertRowid) })

    const row = outboxRow(localDb, 'users', result.lastInsertRowid)
    expect(row.local_updated_at).toBe('2026-01-05T00:00:00.000Z')
  })

  it('stores null timestamps when inserted rows lack both', () => {
    const { localDb, manager } = captureSetup()
    addCustomersColumns(localDb)
    const captured = manager.captureWrite(localDb, 'INSERT INTO customers (id) VALUES (?)', [4])

    localDb.prepare('INSERT INTO customers (id) VALUES (?)').run(4)
    manager.trackWrite(localDb, captured, { lastInsertRowid: 4 })

    expect(outboxRow(localDb, 'customers', 4).local_updated_at).toBeNull()
  })

  it('ignores updates that match no rows', () => {
    const { localDb, manager } = captureSetup()
    const captured = manager.captureWrite(localDb, 'UPDATE products SET name = ? WHERE id = ?', ['Nobody', 999])

    localDb.prepare(`UPDATE products SET name = ? WHERE id = ?`).run('Nobody', 999)
    manager.trackWrite(localDb, captured, {})

    expect(localDb.prepare('SELECT COUNT(*) AS c FROM sync_outbox').get()).toEqual({ c: 0 })
  })

  it('ignores updates and deletes without a where clause', () => {
    const { localDb, manager } = captureSetup()
    insertProduct(localDb, { id: 8 })
    const updateCapture = manager.captureWrite(localDb, 'UPDATE products SET name = ?', ['X'])
    manager.trackWrite(localDb, updateCapture, {})
    const deleteCapture = manager.captureWrite(localDb, 'DELETE FROM products', [])
    manager.trackWrite(localDb, deleteCapture, {})

    expect(localDb.prepare('SELECT COUNT(*) AS c FROM sync_outbox').get()).toEqual({ c: 0 })
  })

  it('skips updates whose row vanished before tracking', () => {
    const { localDb, manager } = captureSetup()
    insertProduct(localDb, { id: 8 })
    const captured = manager.captureWrite(localDb, 'UPDATE products SET name = ? WHERE id = ?', ['Gone', 8])
    localDb.prepare('DELETE FROM products WHERE id = 8').run()

    manager.trackWrite(localDb, captured, {})

    expect(localDb.prepare('SELECT COUNT(*) AS c FROM sync_outbox').get()).toEqual({ c: 0 })
  })

  it('tracks deletes with their removed rows', () => {
    const { localDb, manager } = captureSetup()
    insertProduct(localDb, { id: 8, updated_at: '2026-01-01T00:00:00.000Z' })
    const captured = manager.captureWrite(localDb, 'DELETE FROM products WHERE id = ?', [8])

    localDb.prepare('DELETE FROM products WHERE id = 8').run()
    manager.trackWrite(localDb, captured, {})

    const row = outboxRow(localDb, 'products', 8)
    expect(row.operation).toBe('DELETE')
    expect(row.base_remote_updated_at).toBe('2026-01-01T00:00:00.000Z')
  })

  it('tracks deletes of rows without timestamps', () => {
    const { localDb, manager } = captureSetup()
    addCustomersColumns(localDb)
    localDb.prepare('INSERT INTO customers (id, updated_at) VALUES (6, NULL)').run()
    const captured = manager.captureWrite(localDb, 'DELETE FROM customers WHERE id = ?', [6])

    localDb.prepare('DELETE FROM customers WHERE id = 6').run()
    manager.trackWrite(localDb, captured, {})

    expect(outboxRow(localDb, 'customers', 6).base_remote_updated_at).toBeNull()
  })

  it('ignores statements it cannot parse', () => {
    const { localDb, manager } = captureSetup()

    expect(manager.captureWrite(localDb, 'SELECT * FROM products', [])).toBeNull()
    expect(manager.captureWrite(localDb, 'INSERT INTO mystery (id) VALUES (?)', [1])).toBeNull()
    manager.trackWrite(localDb, null, {})

    expect(localDb.prepare('SELECT COUNT(*) AS c FROM sync_outbox').get()).toEqual({ c: 0 })
  })

  it('ignores aggregate-owned tables', () => {
    const { localDb, manager } = captureSetup()

    expect(manager.captureWrite(localDb, 'INSERT INTO orders (id) VALUES (?)', [5])).toBeNull()
    expect(manager.captureWrite(localDb, 'UPDATE order_items SET id = ? WHERE id = ?', [1, 1])).toBeNull()
    expect(localDb.prepare('SELECT COUNT(*) AS c FROM sync_outbox').get()).toEqual({ c: 0 })
  })

  it('keeps inserts over later updates and preserves created_at', () => {
    const { localDb, manager } = captureSetup()
    const { sql, params } = productInsertStatement({ name: 'Pear' })
    const insertCapture = manager.captureWrite(localDb, sql, params)
    const result = localDb.prepare(sql).run(...params)
    const recordId = Number(result.lastInsertRowid)
    manager.trackWrite(localDb, insertCapture, { lastInsertRowid: recordId })
    const createdAt = outboxRow(localDb, 'products', recordId).created_at

    const updateCapture = manager.captureWrite(localDb, 'UPDATE products SET name = ? WHERE id = ?', ['Pear!', recordId])
    localDb.prepare('UPDATE products SET name = ? WHERE id = ?').run('Pear!', recordId)
    manager.trackWrite(localDb, updateCapture, {})

    const row = outboxRow(localDb, 'products', recordId)
    expect(row.operation).toBe('INSERT')
    expect(row.created_at).toBe(createdAt)
    expect(JSON.parse(row.row_payload).name).toBe('Pear!')
  })

  it('drops inserts cancelled by a delete before any push', () => {
    const { localDb, manager } = captureSetup()
    const { sql, params } = productInsertStatement({ name: 'Temp' })
    const insertCapture = manager.captureWrite(localDb, sql, params)
    const result = localDb.prepare(sql).run(...params)
    const recordId = Number(result.lastInsertRowid)
    manager.trackWrite(localDb, insertCapture, { lastInsertRowid: recordId })

    const deleteCapture = manager.captureWrite(localDb, 'DELETE FROM products WHERE id = ?', [recordId])
    localDb.prepare('DELETE FROM products WHERE id = ?').run(recordId)
    manager.trackWrite(localDb, deleteCapture, {})

    expect(localDb.prepare('SELECT COUNT(*) AS c FROM sync_outbox').get()).toEqual({ c: 0 })
  })

  it('keeps deletes that follow a previously synced insert', () => {
    const { localDb, manager } = captureSetup()
    const { sql, params } = productInsertStatement({ name: 'Keep' })
    const insertCapture = manager.captureWrite(localDb, sql, params)
    const result = localDb.prepare(sql).run(...params)
    const recordId = Number(result.lastInsertRowid)
    manager.trackWrite(localDb, insertCapture, { lastInsertRowid: recordId })
    localDb.prepare('UPDATE sync_outbox SET base_remote_updated_at = ? WHERE record_id = ?').run('2026-01-01T00:00:00.000Z', String(recordId))

    const deleteCapture = manager.captureWrite(localDb, 'DELETE FROM products WHERE id = ?', [recordId])
    localDb.prepare('DELETE FROM products WHERE id = ?').run(recordId)
    manager.trackWrite(localDb, deleteCapture, {})

    expect(outboxRow(localDb, 'products', recordId).operation).toBe('DELETE')
  })

  it('keeps the first remote base across later writes', () => {
    const { localDb, manager } = captureSetup()
    insertProduct(localDb, { id: 8 })
    localDb.prepare('UPDATE products SET updated_at = ? WHERE id = 8').run('2026-01-01T00:00:00.000Z')
    const first = manager.captureWrite(localDb, 'UPDATE products SET name = ? WHERE id = ?', ['One', 8])
    localDb.prepare('UPDATE products SET name = ? WHERE id = 8').run('One')
    manager.trackWrite(localDb, first, {})
    localDb.prepare(`UPDATE sync_outbox SET base_remote_updated_at = ? WHERE record_id = '8'`).run('2026-01-01T00:00:00.000Z')
    localDb.prepare('UPDATE products SET updated_at = ? WHERE id = 8').run('2026-02-01T00:00:00.000Z')

    const second = manager.captureWrite(localDb, 'UPDATE products SET name = ? WHERE id = ?', ['Two', 8])
    localDb.prepare('UPDATE products SET name = ? WHERE id = 8').run('Two')
    manager.trackWrite(localDb, second, {})

    expect(outboxRow(localDb, 'products', 8).base_remote_updated_at).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('literal where clauses', () => {
  it('tracks updates with placeholder-free predicates', () => {
    const { localDb } = setupDbs()
    const manager = createSyncManager({
      getDatabase: () => localDb,
      getRemoteConfig: () => ({ configured: false }),
    })
    insertProduct(localDb, { id: 8, name: 'Before', updated_at: '2026-01-01T00:00:00.000Z' })
    const captured = manager.captureWrite(localDb, 'UPDATE products SET name = \'After\' WHERE id = 8', [])

    localDb.prepare(`UPDATE products SET name = ?, updated_at = ? WHERE id = ?`).run('After', '2026-02-01T00:00:00.000Z', 8)
    manager.trackWrite(localDb, captured, {})

    const row = outboxRow(localDb, 'products', 8)
    expect(row.operation).toBe('UPDATE')
    expect(JSON.parse(row.row_payload).name).toBe('After')
  })

  it('tracks deletes with placeholder-free predicates', () => {
    const { localDb } = setupDbs()
    const manager = createSyncManager({
      getDatabase: () => localDb,
      getRemoteConfig: () => ({ configured: false }),
    })
    insertProduct(localDb, { id: 8, updated_at: '2026-01-01T00:00:00.000Z' })
    const captured = manager.captureWrite(localDb, 'DELETE FROM products WHERE id = 8', [])

    localDb.prepare('DELETE FROM products WHERE id = 8').run()
    manager.trackWrite(localDb, captured, {})

    const row = outboxRow(localDb, 'products', 8)
    expect(row.operation).toBe('DELETE')
  })
})
