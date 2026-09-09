import { describe, expect, it } from 'vitest'
import { DatabaseSync as Database } from 'node:sqlite'
const { ensureLocalSyncSchema } = await import('./src/schema.cjs')
const packageIndex = await import('./src/index.cjs')

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

describe('package index', () => {
  it('re-exports the public sync surface', () => {
    expect(typeof packageIndex.createSyncManager).toBe('function')
    expect(typeof packageIndex.resetLocalDatabase).toBe('function')
    expect(typeof packageIndex.ensureLocalSyncSchema).toBe('function')
    expect(Array.isArray(packageIndex.replicatedTables)).toBe(true)
    expect(typeof packageIndex.replicatedTablesByName).toBe('object')
  })
})

describe('ensureLocalSyncSchema edge cases', () => {
  it('is idempotent when timestamp columns already exist', () => {
    const database = new Database(':memory:')
    createTables(database)

    ensureLocalSyncSchema(database)
    ensureLocalSyncSchema(database)

    const usersColumns = database.prepare('PRAGMA table_info("users")').all().map((column) => column.name)
    const orderItemColumns = database.prepare('PRAGMA table_info("order_items")').all().map((column) => column.name)
    const metadata = database.prepare('SELECT version FROM sync_metadata WHERE id = 1').get()

    expect(usersColumns).toContain('updated_at')
    expect(orderItemColumns).toContain('created_at')
    expect(orderItemColumns).toContain('updated_at')
    expect(metadata).toEqual({ version: 0 })
  })

  it('skips index creation for tables missing the watermark column', () => {
    const database = new Database(':memory:')
    createTables(database)
    database.exec('ALTER TABLE customers RENAME TO customers_legacy')
    database.exec('CREATE TABLE customers (id INTEGER PRIMARY KEY)')

    ensureLocalSyncSchema(database)

    const index = database
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_customers_updated_at'`)
      .get()
    const productsIndex = database
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_products_updated_at'`)
      .get()

    expect(index).toBeUndefined()
    expect(productsIndex?.name).toBe('idx_products_updated_at')
  })
})
