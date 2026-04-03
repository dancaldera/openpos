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

    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      customer_number TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      company_name TEXT,
      email TEXT,
      phone TEXT,
      phone_secondary TEXT,
      address_line1 TEXT,
      address_line2 TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT NOT NULL,
      customer_type TEXT NOT NULL,
      customer_segment TEXT,
      credit_limit REAL NOT NULL,
      current_balance REAL NOT NULL,
      tax_exempt INTEGER NOT NULL,
      tax_id TEXT,
      loyalty_points INTEGER NOT NULL,
      total_purchases REAL NOT NULL,
      total_orders INTEGER NOT NULL,
      first_purchase_date TEXT,
      last_purchase_date TEXT,
      is_active INTEGER NOT NULL,
      notes TEXT,
      tags TEXT,
      custom_fields TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by INTEGER,
      deleted_at TEXT
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
      customer_number TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      company_name TEXT,
      email TEXT,
      phone TEXT,
      phone_secondary TEXT,
      address_line1 TEXT,
      address_line2 TEXT,
      city TEXT,
      state TEXT,
      postal_code TEXT,
      country TEXT NOT NULL,
      customer_type TEXT NOT NULL,
      customer_segment TEXT,
      credit_limit REAL NOT NULL,
      current_balance REAL NOT NULL,
      tax_exempt INTEGER NOT NULL,
      tax_id TEXT,
      loyalty_points INTEGER NOT NULL,
      total_purchases REAL NOT NULL,
      total_orders INTEGER NOT NULL,
      first_purchase_date TEXT,
      last_purchase_date TEXT,
      is_active INTEGER NOT NULL,
      notes TEXT,
      tags TEXT,
      custom_fields TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by INTEGER,
      deleted_at TEXT
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

function createCustomerRecord(overrides = {}) {
  return {
    id: 11,
    customer_number: 'CUST-00011',
    first_name: 'Marina',
    last_name: 'Lopez',
    company_name: 'Lopez Market',
    email: 'marina@example.com',
    phone: '555-0101',
    phone_secondary: '555-0102',
    address_line1: '123 Main St',
    address_line2: 'Suite 4',
    city: 'Monterrey',
    state: 'NL',
    postal_code: '64000',
    country: 'MX',
    customer_type: 'business',
    customer_segment: 'Wholesale',
    credit_limit: 1500,
    current_balance: 200,
    tax_exempt: 0,
    tax_id: 'RFC123',
    loyalty_points: 40,
    total_purchases: 4250.5,
    total_orders: 18,
    first_purchase_date: '2025-12-01T00:00:00.000Z',
    last_purchase_date: '2026-03-20T00:00:00.000Z',
    is_active: 1,
    notes: 'Priority account',
    tags: JSON.stringify(['vip', 'invoice']),
    custom_fields: JSON.stringify({
      businessProfile: 'grocery',
      preferredContactMethod: 'whatsapp',
      referenceCode: 'HOUSE-77',
    }),
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-03-20T12:00:00.000Z',
    created_by: 3,
    deleted_at: null,
    ...overrides,
  }
}

function insertCustomer(database, overrides = {}) {
  const customer = createCustomerRecord(overrides)

  database
    .prepare(
      `INSERT INTO customers (
        id, customer_number, first_name, last_name, company_name, email, phone, phone_secondary,
        address_line1, address_line2, city, state, postal_code, country, customer_type,
        customer_segment, credit_limit, current_balance, tax_exempt, tax_id,
        loyalty_points, total_purchases, total_orders, first_purchase_date, last_purchase_date,
        is_active, notes, tags, custom_fields, created_at, updated_at, created_by, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      customer.id,
      customer.customer_number,
      customer.first_name,
      customer.last_name,
      customer.company_name,
      customer.email,
      customer.phone,
      customer.phone_secondary,
      customer.address_line1,
      customer.address_line2,
      customer.city,
      customer.state,
      customer.postal_code,
      customer.country,
      customer.customer_type,
      customer.customer_segment,
      customer.credit_limit,
      customer.current_balance,
      customer.tax_exempt,
      customer.tax_id,
      customer.loyalty_points,
      customer.total_purchases,
      customer.total_orders,
      customer.first_purchase_date,
      customer.last_purchase_date,
      customer.is_active,
      customer.notes,
      customer.tags,
      customer.custom_fields,
      customer.created_at,
      customer.updated_at,
      customer.created_by,
      customer.deleted_at,
    )

  return customer
}

function setCustomersWatermark(database, value = '2026-03-01T00:00:00.000Z') {
  database
    .prepare(
      `INSERT INTO sync_state (table_name, last_pulled_at, last_sync_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(table_name) DO UPDATE SET
         last_pulled_at = excluded.last_pulled_at,
         last_sync_at = excluded.last_sync_at,
         updated_at = excluded.updated_at`,
    )
    .run('customers', value, null, value)
}

function bumpRemoteVersion(database, version) {
  database.prepare('UPDATE sync_metadata SET version = ? WHERE id = 1').run(version)
}

function executeTrackedWrite(database, syncManager, sql, params = []) {
  const capturedWrite = syncManager.captureWrite(database, sql, params)
  const result = database.prepare(sql).run(...params)
  syncManager.trackWrite(database, capturedWrite, result)
  return result
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

describe('createSyncManager customer mirror sync', () => {
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

  it('syncs a local customer insert to remote storage', async () => {
    const customer = createCustomerRecord()

    executeTrackedWrite(
      localDb,
      syncManager,
      `INSERT INTO customers (
        id, customer_number, first_name, last_name, company_name, email, phone, phone_secondary,
        address_line1, address_line2, city, state, postal_code, country, customer_type,
        customer_segment, credit_limit, current_balance, tax_exempt, tax_id,
        loyalty_points, total_purchases, total_orders, first_purchase_date, last_purchase_date,
        is_active, notes, tags, custom_fields, created_at, updated_at, created_by, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer.id,
        customer.customer_number,
        customer.first_name,
        customer.last_name,
        customer.company_name,
        customer.email,
        customer.phone,
        customer.phone_secondary,
        customer.address_line1,
        customer.address_line2,
        customer.city,
        customer.state,
        customer.postal_code,
        customer.country,
        customer.customer_type,
        customer.customer_segment,
        customer.credit_limit,
        customer.current_balance,
        customer.tax_exempt,
        customer.tax_id,
        customer.loyalty_points,
        customer.total_purchases,
        customer.total_orders,
        customer.first_purchase_date,
        customer.last_purchase_date,
        customer.is_active,
        customer.notes,
        customer.tags,
        customer.custom_fields,
        customer.created_at,
        customer.updated_at,
        customer.created_by,
        customer.deleted_at,
      ],
    )

    await syncManager.triggerSync({ foreground: true })

    const remoteCustomer = remoteDb
      .prepare('SELECT customer_number, company_name, tags, custom_fields FROM customers WHERE id = ?')
      .get(customer.id)

    expect(remoteCustomer).toEqual({
      customer_number: 'CUST-00011',
      company_name: 'Lopez Market',
      tags: JSON.stringify(['vip', 'invoice']),
      custom_fields: JSON.stringify({
        businessProfile: 'grocery',
        preferredContactMethod: 'whatsapp',
        referenceCode: 'HOUSE-77',
      }),
    })
  })

  it('syncs a local customer update to remote storage', async () => {
    insertCustomer(localDb)
    insertCustomer(remoteDb)

    executeTrackedWrite(
      localDb,
      syncManager,
      'UPDATE customers SET phone = ?, customer_segment = ?, updated_at = ? WHERE id = ?',
      ['555-2222', 'Recurring', '2026-03-25T10:00:00.000Z', 11],
    )

    await syncManager.triggerSync({ foreground: true })

    const remoteCustomer = remoteDb
      .prepare('SELECT phone, customer_segment, updated_at FROM customers WHERE id = ?')
      .get(11)

    expect(remoteCustomer).toEqual({
      phone: '555-2222',
      customer_segment: 'Recurring',
      updated_at: '2026-03-25T10:00:00.000Z',
    })
  })

  it('syncs a local customer soft-delete to remote storage with updated_at', async () => {
    insertCustomer(localDb)
    insertCustomer(remoteDb)

    executeTrackedWrite(
      localDb,
      syncManager,
      'UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      ['2026-03-26T09:00:00.000Z', '2026-03-26T09:00:00.000Z', 11],
    )

    await syncManager.triggerSync({ foreground: true })

    const remoteCustomer = remoteDb
      .prepare('SELECT deleted_at, updated_at FROM customers WHERE id = ?')
      .get(11)

    expect(remoteCustomer).toEqual({
      deleted_at: '2026-03-26T09:00:00.000Z',
      updated_at: '2026-03-26T09:00:00.000Z',
    })
  })

  it('applies newer remote customer updates and deletes locally', async () => {
    insertCustomer(localDb, {
      phone: '555-0101',
      deleted_at: null,
      updated_at: '2026-03-20T12:00:00.000Z',
    })
    insertCustomer(remoteDb, {
      phone: '555-9999',
      deleted_at: null,
      updated_at: '2026-03-27T15:15:07.009Z',
    })
    setCustomersWatermark(localDb, '2026-03-01T00:00:00.000Z')
    bumpRemoteVersion(remoteDb, 2)

    await syncManager.triggerSync({ foreground: true })

    const updatedLocalCustomer = localDb.prepare('SELECT phone, deleted_at FROM customers WHERE id = ?').get(11)
    expect(updatedLocalCustomer).toEqual({
      phone: '555-9999',
      deleted_at: null,
    })

    remoteDb
      .prepare('UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run('2026-03-28T08:00:00.000Z', '2026-03-28T08:00:00.000Z', 11)
    bumpRemoteVersion(remoteDb, 3)

    await syncManager.triggerSync({ foreground: true })

    const deletedLocalCustomer = localDb.prepare('SELECT deleted_at, updated_at FROM customers WHERE id = ?').get(11)
    expect(deletedLocalCustomer).toEqual({
      deleted_at: '2026-03-28T08:00:00.000Z',
      updated_at: '2026-03-28T08:00:00.000Z',
    })
  })
})
