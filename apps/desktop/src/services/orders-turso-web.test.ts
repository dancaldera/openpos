import { beforeEach, describe, expect, it, vi } from 'vitest'

const { execute, query, transaction, getProduct, updateProduct, getVariant, updateVariant, calculateTotalWithTax } =
  vi.hoisted(() => ({
    execute: vi.fn(async (_sql: string, _params: unknown[] = []) => ({ lastInsertId: 0, rowsAffected: 1 })),
    query: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<Array<Record<string, unknown>>> => []),
    transaction: vi.fn(async (_statements: Array<{ sql: string; params?: unknown[] }>) => {}),
    getProduct: vi.fn(async (_id: string): Promise<Record<string, unknown> | null> => null),
    updateProduct: vi.fn(async () => ({ success: true, product: null })),
    getVariant: vi.fn(async (_id: string): Promise<Record<string, unknown> | null> => null),
    updateVariant: vi.fn(async () => ({ success: true, variant: null })),
    calculateTotalWithTax: vi.fn(async (_subtotal: number) => ({ tax: 0, total: 0 })),
  }))

vi.mock('../lib/db-adapter', () => ({
  execute,
  query,
  transaction,
}))

vi.mock('../lib/desktop', () => ({
  requireDesktopApi: vi.fn(() => {
    throw new Error('Desktop API should not be used in web mode tests')
  }),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: false,
}))

vi.mock('./products-turso', () => ({
  productService: { getProduct, updateProduct },
}))

vi.mock('./product-variants-turso', () => ({
  productVariantsService: { getVariant, updateVariant },
}))

vi.mock('./company-settings-turso', () => ({
  companySettingsService: { calculateTotalWithTax },
}))

vi.mock('./dashboard-stats', () => ({
  invalidateDashboardStatsCache: vi.fn((_key?: string) => {}),
}))

const { orderService } = await import('./orders-turso')

describe('OrderService web mode', () => {
  beforeEach(() => {
    query.mockReset()
    transaction.mockReset()
    getProduct.mockReset()
    calculateTotalWithTax.mockReset()
    getProduct.mockResolvedValue({
      id: '1',
      name: 'Cafe',
      price: 100,
      stock: 20,
      isActive: true,
      variantType: 'simple',
    })
    calculateTotalWithTax.mockResolvedValue({ tax: 16, total: 116 })
    transaction.mockResolvedValue(undefined)
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('PRAGMA')) return [{ name: 'user_id' }, { name: 'customer_id' }, { name: 'variant_id' }]
      if (sql.includes('COALESCE(MAX(id)')) return [{ next_id: 3 }]
      return []
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('creates an order without syncing desktop aggregates', async () => {
    const result = await orderService.createOrder({ items: [{ productId: '1', quantity: 1 }] })

    expect(result).toMatchObject({ success: true, order: { id: '3', subtotal: 100, tax: 16, total: 116 } })
    expect(transaction).toHaveBeenCalledTimes(1)
  })
})
