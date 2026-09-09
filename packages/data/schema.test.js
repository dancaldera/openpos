import { describe, expect, it } from 'vitest'
// Direct per-file imports: nested require() calls resolve natively and would
// bypass coverage instrumentation (see vitest.config.ts).
const { generateConnectionKey } = await import('./src/connection.cjs')
const { replicatedTables, replicatedTablesByName } = await import('./src/replicated-tables.js')
const { schema } = await import('./src/schema/index.js')

describe('@openpos/data Drizzle schema exports', () => {
  it('exposes the OpenPOS schema and derived replicated table metadata', () => {
    expect(typeof schema).toBe('object')
    expect(schema.users).toBeDefined()
    expect(schema.connectionMeta).toBeDefined()
    expect(schema.databaseSettings).toBeDefined()
    expect(schema.syncMetadata).toBeDefined()
    expect(schema.syncOutbox).toBeDefined()
    expect(schema.syncState).toBeDefined()
    expect(schema.orderSyncQueue).toBeDefined()
    expect(schema.products).toBeDefined()
    expect(typeof generateConnectionKey).toBe('function')
    expect(replicatedTables.map((table) => table.tableName)).toEqual([
      'users',
      'products',
      'customers',
      'company_settings',
      'orders',
      'order_items',
      'product_attributes',
      'product_variants',
      'product_variant_settings',
    ])
    expect(replicatedTablesByName.products.columns).toContain('barcode_normalized')
    expect(replicatedTablesByName.users.columns).toContain('pin_enabled')
    expect(replicatedTablesByName.users.columns).toContain('pin_hash')
  })

  it('re-exports every module through the package index', async () => {
    const index = await import('./src/index.js')
    const project = await import('./src/project.js')

    expect(index.schema).toBeDefined()
    expect(index.replicatedTables).toHaveLength(9)
    expect(index.replicatedTablesByName).toBeDefined()
    expect(typeof index.generateConnectionKey).toBe('function')
    expect(index.parseConnectionKey(index.generateConnectionKey())).toMatch(/^OPK_/)
    expect(index.migrationsDir).toBe(project.migrationsDir)
    expect(index.users).toBe(index.schema.users)
    expect(index.products).toBe(index.schema.products)
  })

  it('builds every table config, resolving indexes, checks, and foreign keys', async () => {
    const { getTableConfig } = await import('drizzle-orm/sqlite-core')

    for (const table of Object.values(schema)) {
      const config = getTableConfig(table)
      expect(config.name).toEqual(expect.any(String))
      expect(config.columns.length).toBeGreaterThan(0)
    }

    expect(getTableConfig(schema.users).indexes.length).toBeGreaterThan(0)
    expect(getTableConfig(schema.orderSyncQueue).checks.length).toBeGreaterThan(0)
    expect(getTableConfig(schema.orderItems).foreignKeys.length).toBeGreaterThan(0)
  })

  it('resolves every foreign key to a named constraint', async () => {
    const { getTableConfig } = await import('drizzle-orm/sqlite-core')

    const names = []
    for (const table of Object.values(schema)) {
      for (const key of getTableConfig(table).foreignKeys) {
        names.push(key.getName())
      }
    }

    expect(names).toContain('order_items_order_id_orders_id_fk')
    expect(names).toContain('orders_customer_id_customers_id_fk')
    for (const name of names) {
      expect(name).toMatch(/_fk$/)
    }
  })

  it('builds replicated configs and maps through the shared helpers', async () => {
    const { buildReplicatedTableConfig, buildReplicatedTableMap } = await import('./src/internal/replicated-meta.js')

    const config = buildReplicatedTableConfig(schema.products, {
      primaryKey: 'id',
      watermarkColumn: 'updated_at',
      deleteStrategy: 'hard',
      pullOrder: 20,
    })

    expect(config).toEqual(replicatedTablesByName.products)
    expect(buildReplicatedTableMap([config])).toEqual({ products: config })
  })
})
