import { describe, expect, it } from 'vitest'
const { replicatedTables, replicatedTablesByName, schema } = await import('./src/index.js')

describe('@openpos/data Drizzle schema exports', () => {
  it('exposes the OpenPOS schema and derived replicated table metadata', () => {
    expect(typeof schema).toBe('object')
    expect(schema.users).toBeDefined()
    expect(schema.passwordRecoveryCodes).toBeDefined()
    expect(schema.passwordResetTokens).toBeDefined()
    expect(schema.passwordResetSettings).toBeDefined()
    expect(schema.products).toBeDefined()
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
  })
})
