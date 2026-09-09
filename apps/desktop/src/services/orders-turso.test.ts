import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  execute,
  query,
  transaction,
  syncAggregate,
  getProduct,
  updateProduct,
  getVariant,
  updateVariant,
  calculateTotalWithTax,
  invalidateDashboardStatsCache,
} = vi.hoisted(() => ({
  execute: vi.fn(async (_sql: string, _params: unknown[] = []) => ({ lastInsertId: 0, rowsAffected: 1 })),
  query: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<Array<Record<string, unknown>>> => []),
  transaction: vi.fn(async (_statements: Array<{ sql: string; params?: unknown[] }>) => {}),
  syncAggregate: vi.fn(async (_orderId: string, _operation: string) => ({ queued: true })),
  getProduct: vi.fn(async (_id: string): Promise<Record<string, unknown> | null> => null),
  updateProduct: vi.fn(
    async (): Promise<{ success: boolean; product?: null; error?: string }> => ({ success: true, product: null }),
  ),
  getVariant: vi.fn(async (_id: string): Promise<Record<string, unknown> | null> => null),
  updateVariant: vi.fn(
    async (): Promise<{ success: boolean; variant?: null; error?: string }> => ({ success: true, variant: null }),
  ),
  calculateTotalWithTax: vi.fn(async (_subtotal: number) => ({ tax: 0, total: 0 })),
  invalidateDashboardStatsCache: vi.fn((_key?: string) => {}),
}))

vi.mock('../lib/db-adapter', () => ({
  execute,
  query,
  transaction,
}))

vi.mock('../lib/desktop', () => ({
  requireDesktopApi: vi.fn(() => ({
    orders: { syncAggregate },
  })),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: true,
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
  invalidateDashboardStatsCache,
}))

const { orderService } = await import('./orders-turso')

function dbOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: 1,
    customer_id: 2,
    subtotal: 100,
    tax: 16,
    total: 116,
    status: 'pending',
    payment_method: 'cash',
    notes: 'n',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T01:00:00.000Z',
    completed_at: null,
    ...overrides,
  }
}

function dbItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    order_id: 1,
    product_id: 1,
    product_name: 'Cafe',
    quantity: 2,
    unit_price: 50,
    total_price: 100,
    variant_id: null,
    variant_attributes: null,
    ...overrides,
  }
}

interface OrderRouterOptions {
  orderRows?: Record<string, unknown>[]
  itemRows?: Record<string, unknown>[]
  pragma?: { orders?: string[]; items?: string[] }
  count?: number | null
  nextId?: number | null
  topRows?: Record<string, unknown>[]
  totalSales?: number | null
}

function mockOrderDb(options: OrderRouterOptions = {}) {
  const pragma = options.pragma ?? { orders: ['user_id', 'customer_id'], items: ['variant_id'] }
  query.mockImplementation(async (sql: string) => {
    if (sql.startsWith('PRAGMA table_info(orders)')) {
      return (pragma.orders ?? []).map((name) => ({ name }))
    }
    if (sql.startsWith('PRAGMA table_info(order_items)')) {
      return (pragma.items ?? []).map((name) => ({ name }))
    }
    if (sql.includes('COALESCE(MAX(id)')) {
      if (options.nextId === null) return []
      return [{ next_id: options.nextId ?? 5 }]
    }
    if (sql.includes('COUNT(*)')) {
      if (options.count === null) return []
      return [{ count: options.count ?? 0 }]
    }
    if (sql.includes('JOIN orders o ON oi.order_id')) {
      return options.topRows ?? []
    }
    if (sql.includes('COALESCE(SUM(total)')) {
      if (options.totalSales === null) return []
      return [{ total_sales: options.totalSales ?? 0 }]
    }
    if (sql.includes('FROM order_items')) {
      return options.itemRows ?? []
    }
    if (sql.includes('FROM orders')) {
      return options.orderRows ?? []
    }
    return []
  })
}

function simpleProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    name: 'Cafe',
    price: 100,
    cost: 60,
    stock: 20,
    isActive: true,
    variantType: 'simple',
    ...overrides,
  }
}

describe('OrderService getters', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    transaction.mockReset()
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('lists orders with variant details', async () => {
    mockOrderDb({
      orderRows: [dbOrder(), dbOrder({ id: 2, user_id: null, customer_id: null })],
      itemRows: [
        dbItem({ variant_id: 5, variant_attributes: JSON.stringify({ size: 'L' }) }),
        dbItem({ id: 2, variant_id: 6, variant_attributes: 'broken' }),
        dbItem({ id: 3, variant_id: 7 }),
        dbItem({ id: 4 }),
      ],
    })

    const orders = await orderService.getOrders()

    expect(orders).toHaveLength(2)
    expect(orders[0]?.items).toHaveLength(4)
    expect(orders[0]?.items[0]).toMatchObject({ variantId: '5', variantAttributes: { size: 'L' } })
    expect(orders[0]?.items[1]?.variantAttributes).toBeUndefined()
    expect(orders[0]?.items[2]?.variantAttributes).toBeUndefined()
    expect(orders[0]?.items[3]?.variantId).toBeUndefined()
    expect(orders[1]?.userId).toBeUndefined()
    expect(orders[1]?.customerId).toBeUndefined()
  })

  it('throws when listing fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(orderService.getOrders()).rejects.toThrow('Failed to fetch orders')
  })

  it('paginates orders', async () => {
    mockOrderDb({ count: 25, orderRows: [dbOrder()], itemRows: [] })

    const page = await orderService.getOrdersPaginated(2, 10)

    expect(page).toMatchObject({
      totalCount: 25,
      totalPages: 3,
      currentPage: 2,
      hasNextPage: true,
      hasPreviousPage: true,
    })
  })

  it('handles an empty count when paginating', async () => {
    mockOrderDb({ count: null, orderRows: [] })

    const page = await orderService.getOrdersPaginated()

    expect(page).toMatchObject({ totalCount: 0, totalPages: 0 })
  })

  it('throws when pagination fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(orderService.getOrdersPaginated()).rejects.toThrow('Failed to fetch paginated orders')
  })

  it('gets an order by id or returns null', async () => {
    mockOrderDb({ orderRows: [dbOrder()], itemRows: [dbItem()] })

    await expect(orderService.getOrder('1')).resolves.toMatchObject({ id: '1' })

    query.mockReset()
    query.mockResolvedValue([])

    await expect(orderService.getOrder('99')).resolves.toBeNull()
  })

  it('throws when getting an order fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(orderService.getOrder('1')).rejects.toThrow('Failed to fetch order')
  })

  it('gets orders by status', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'completed' })], itemRows: [] })

    const orders = await orderService.getOrdersByStatus('completed')

    expect(orders).toHaveLength(1)
    expect(query.mock.calls[0][1]).toEqual(['completed'])

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(orderService.getOrdersByStatus('pending')).rejects.toThrow('Failed to fetch orders by status')
  })

  it('totals completed sales', async () => {
    mockOrderDb({ totalSales: 999 })

    await expect(orderService.getTotalSales()).resolves.toBe(999)

    query.mockReset()
    mockOrderDb({ totalSales: null })

    await expect(orderService.getTotalSales()).resolves.toBe(0)

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(orderService.getTotalSales()).resolves.toBe(0)
  })

  it('gets orders by date range', async () => {
    mockOrderDb({ orderRows: [dbOrder()], itemRows: [] })

    const orders = await orderService.getOrdersByDateRange('2026-01-01', '2026-01-31')

    expect(orders).toHaveLength(1)
    expect(query.mock.calls[0][1]).toEqual(['2026-01-01', '2026-01-31'])

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(orderService.getOrdersByDateRange('2026-01-01', '2026-01-31')).rejects.toThrow(
      'Failed to fetch orders by date range',
    )
  })

  it('filters orders by today, yesterday, or a specific date', async () => {
    mockOrderDb({ orderRows: [dbOrder()], itemRows: [dbItem()] })

    const today = await orderService.getOrdersByDateFilter('today')
    await orderService.getOrdersByDateFilter('yesterday')
    await orderService.getOrdersByDateFilter('2026-02-14')

    expect(today).toHaveLength(1)
    expect(today[0]?.items).toHaveLength(1)
    expect(query).toHaveBeenCalledTimes(6)

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(orderService.getOrdersByDateFilter('today')).rejects.toThrow('Failed to fetch orders by date filter')
  })

  it('paginates orders by date filter', async () => {
    mockOrderDb({ count: 12, orderRows: [dbOrder()], itemRows: [] })

    const today = await orderService.getOrdersByDateFilterPaginated('today', 2, 10)

    expect(today).toMatchObject({ totalCount: 12, totalPages: 2, currentPage: 2 })

    const yesterday = await orderService.getOrdersByDateFilterPaginated('yesterday')

    expect(yesterday.currentPage).toBe(1)

    const specific = await orderService.getOrdersByDateFilterPaginated('2026-02-14')

    expect(specific.currentPage).toBe(1)

    query.mockReset()
    mockOrderDb({ count: null, orderRows: [], itemRows: [] })

    const empty = await orderService.getOrdersByDateFilterPaginated('today')

    expect(empty).toMatchObject({ totalCount: 0, totalPages: 0, orders: [] })

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(orderService.getOrdersByDateFilterPaginated('today')).rejects.toThrow(
      'Failed to fetch paginated orders by date filter',
    )
  })

  it('lists top selling products', async () => {
    mockOrderDb({
      topRows: [{ product_id: 1, product_name: 'Cafe', total_sold: 10, total_revenue: 500 }],
    })

    const top = await orderService.getTopSellingProducts(5)

    expect(top).toEqual([{ productId: '1', productName: 'Cafe', totalSold: 10, totalRevenue: 500 }])
    expect(query.mock.calls[0][1]).toEqual([5])

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(orderService.getTopSellingProducts()).resolves.toEqual([])
  })
})

describe('OrderService.createOrder', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    transaction.mockReset()
    syncAggregate.mockClear()
    invalidateDashboardStatsCache.mockClear()
    getProduct.mockReset()
    updateProduct.mockReset()
    getVariant.mockReset()
    updateVariant.mockReset()
    calculateTotalWithTax.mockReset()
    getProduct.mockResolvedValue(null)
    getVariant.mockResolvedValue(null)
    updateProduct.mockResolvedValue({ success: true, product: null })
    updateVariant.mockResolvedValue({ success: true, variant: null })
    calculateTotalWithTax.mockResolvedValue({ tax: 0, total: 0 })
    transaction.mockResolvedValue(undefined)
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('requires at least one item', async () => {
    await expect(orderService.createOrder({ items: [] })).resolves.toMatchObject({
      success: false,
      error: 'Order must contain at least one item',
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects unavailable stock', async () => {
    getProduct.mockResolvedValueOnce(null)

    await expect(orderService.createOrder({ items: [{ productId: '9', quantity: 1 }] })).resolves.toMatchObject({
      success: false,
      error: 'Product 9 not found',
    })

    getProduct.mockReset()
    getProduct.mockResolvedValueOnce(simpleProduct({ isActive: false }))

    await expect(orderService.createOrder({ items: [{ productId: '1', quantity: 1 }] })).resolves.toMatchObject({
      success: false,
      error: 'Product Cafe is not active',
    })

    getProduct.mockReset()
    getProduct.mockResolvedValueOnce(simpleProduct({ variantType: 'configurable' }))

    await expect(orderService.createOrder({ items: [{ productId: '1', quantity: 1 }] })).resolves.toMatchObject({
      success: false,
      error: 'Product Cafe has variants. Please select a variant.',
    })

    getProduct.mockReset()
    getProduct.mockResolvedValueOnce(simpleProduct({ stock: 1 }))

    await expect(orderService.createOrder({ items: [{ productId: '1', quantity: 5 }] })).resolves.toMatchObject({
      success: false,
      error: 'Insufficient stock for Cafe. Available: 1, Requested: 5',
    })
  })

  it('rejects unavailable variants', async () => {
    getProduct.mockResolvedValue(simpleProduct())
    getVariant.mockResolvedValueOnce(null)

    await expect(
      orderService.createOrder({ items: [{ productId: '1', quantity: 1, variantId: '9' }] }),
    ).resolves.toMatchObject({ success: false, error: 'Variant 9 not found for this product' })

    getVariant.mockReset()
    getVariant.mockResolvedValueOnce({ id: '9', parentProductId: '2', isActive: true, stock: 5 })

    await expect(
      orderService.createOrder({ items: [{ productId: '1', quantity: 1, variantId: '9' }] }),
    ).resolves.toMatchObject({ success: false, error: 'Variant 9 not found for this product' })

    getVariant.mockReset()
    getVariant.mockResolvedValueOnce({ id: '9', parentProductId: '1', isActive: false, stock: 5 })

    await expect(
      orderService.createOrder({ items: [{ productId: '1', quantity: 1, variantId: '9' }] }),
    ).resolves.toMatchObject({ success: false, error: 'Variant is not active' })

    getVariant.mockReset()
    getVariant.mockResolvedValueOnce({
      id: '9',
      parentProductId: '1',
      isActive: true,
      stock: 1,
      attributes: { size: 'S' },
    })

    await expect(
      orderService.createOrder({ items: [{ productId: '1', quantity: 5, variantId: '9' }] }),
    ).resolves.toMatchObject({
      success: false,
      error: 'Insufficient stock for Cafe (size: S). Available: 1, Requested: 5',
    })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('creates an order with variants and user columns', async () => {
    const prod1 = simpleProduct({ id: '1', price: 100, stock: 20 })
    const prod2 = simpleProduct({ id: '2', name: 'Pan', price: 50, stock: 10 })
    const variant = { id: '5', parentProductId: '1', price: 70, isActive: true, stock: 5, attributes: { size: 'L' } }
    getProduct.mockResolvedValue(prod1)
    getProduct
      .mockResolvedValueOnce(prod1)
      .mockResolvedValueOnce(prod2)
      .mockResolvedValueOnce(prod1)
      .mockResolvedValueOnce(prod2)
    getVariant.mockResolvedValue(variant)
    calculateTotalWithTax.mockResolvedValue({ tax: 17, total: 187 })
    mockOrderDb({ nextId: 42 })

    const result = await orderService.createOrder({
      items: [
        { productId: '1', quantity: 1, variantId: '5' },
        { productId: '2', quantity: 2 },
      ],
      customerId: '3',
      paymentMethod: 'card',
      notes: 'gift',
    })

    expect(result.success).toBe(true)
    expect(result.order).toMatchObject({ id: '42', subtotal: 170, tax: 17, total: 187, status: 'pending' })
    expect(result.order?.items[0]).toMatchObject({ unitPrice: 70, variantAttributes: { size: 'L' } })
    expect(transaction).toHaveBeenCalledTimes(1)
    const [statements] = transaction.mock.calls[0]
    expect(statements).toHaveLength(3)
    expect(statements[0]?.sql).toContain('user_id')
    expect(statements[1]?.sql).toContain('variant_id')
    expect(syncAggregate).toHaveBeenCalledWith('42', 'UPSERT')
    expect(invalidateDashboardStatsCache).toHaveBeenCalledWith('turso')
  })

  it('creates a minimal order without optional columns', async () => {
    getProduct.mockResolvedValue(simpleProduct())
    calculateTotalWithTax.mockResolvedValue({ tax: 0, total: 100 })
    mockOrderDb({ nextId: null, pragma: { orders: [], items: [] } })

    const result = await orderService.createOrder({ items: [{ productId: '1', quantity: 1 }] })

    expect(result.success).toBe(true)
    expect(result.order?.id).toBe('1')
    const [statements] = transaction.mock.calls[0]
    expect(statements).toHaveLength(2)
    expect(statements[0]?.sql).not.toContain('user_id')
    expect(statements[1]?.sql).not.toContain('variant_id')
  })

  it('reports missing products and variants while building', async () => {
    getProduct.mockResolvedValueOnce(simpleProduct()).mockResolvedValueOnce(null)
    mockOrderDb({})

    await expect(orderService.createOrder({ items: [{ productId: '1', quantity: 1 }] })).resolves.toMatchObject({
      success: false,
      error: 'Product 1 not found',
    })

    getProduct.mockReset()
    getVariant.mockReset()
    getProduct.mockResolvedValue(simpleProduct())
    getVariant
      .mockResolvedValueOnce({ id: '5', parentProductId: '1', isActive: true, stock: 5 })
      .mockResolvedValueOnce(null)
    mockOrderDb({})

    await expect(
      orderService.createOrder({ items: [{ productId: '1', quantity: 1, variantId: '5' }] }),
    ).resolves.toMatchObject({ success: false, error: 'Variant 5 not found for this product' })

    getProduct.mockReset()
    getVariant.mockReset()
    getProduct.mockResolvedValue(simpleProduct())
    getVariant
      .mockResolvedValueOnce({ id: '5', parentProductId: '1', isActive: true, stock: 5 })
      .mockResolvedValueOnce({ id: '5', parentProductId: '1', isActive: false, stock: 5 })
    mockOrderDb({})

    await expect(
      orderService.createOrder({ items: [{ productId: '1', quantity: 1, variantId: '5' }] }),
    ).resolves.toMatchObject({ success: false, error: 'Variant is not active' })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('returns an error when creation fails', async () => {
    getProduct.mockResolvedValue(simpleProduct())
    calculateTotalWithTax.mockResolvedValue({ tax: 0, total: 100 })
    mockOrderDb({})
    transaction.mockRejectedValueOnce(new Error('db down'))

    await expect(orderService.createOrder({ items: [{ productId: '1', quantity: 1 }] })).resolves.toMatchObject({
      success: false,
      error: 'Failed to create order',
    })
  })
})

describe('OrderService.updateOrderStatus', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    transaction.mockReset()
    syncAggregate.mockClear()
    invalidateDashboardStatsCache.mockClear()
    getProduct.mockReset()
    updateProduct.mockReset()
    getVariant.mockReset()
    updateVariant.mockReset()
    getProduct.mockResolvedValue(null)
    getVariant.mockResolvedValue(null)
    updateProduct.mockResolvedValue({ success: true, product: null })
    updateVariant.mockResolvedValue({ success: true, variant: null })
    transaction.mockResolvedValue(undefined)
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns not found for missing orders', async () => {
    mockOrderDb({ orderRows: [] })

    await expect(orderService.updateOrderStatus('99', 'completed')).resolves.toMatchObject({
      success: false,
      error: 'Order not found',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('deducts simple product stock when completing', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'pending' })], itemRows: [dbItem()] })
    getProduct.mockResolvedValue(simpleProduct({ stock: 20 }))
    updateProduct.mockResolvedValue({ success: true, product: null })

    const result = await orderService.updateOrderStatus('1', 'completed', 'cash')

    expect(result.success).toBe(true)
    expect(updateProduct).toHaveBeenCalledWith('1', { stock: 18, updatedAt: expect.any(String) })
    expect(execute).toHaveBeenCalled()
    expect(syncAggregate).toHaveBeenCalledWith('1', 'UPSERT')
  })

  it('skips deduction when the order is already completed', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'completed' })], itemRows: [dbItem()] })

    const result = await orderService.updateOrderStatus('1', 'paid')

    expect(result.success).toBe(true)
    expect(getProduct).not.toHaveBeenCalled()
    expect(updateProduct).not.toHaveBeenCalled()
  })

  it('deducts variant stock when completing', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'pending' })], itemRows: [dbItem({ variant_id: 5 })] })
    getVariant.mockResolvedValue({ id: '5', stock: 10 })
    updateVariant.mockResolvedValue({ success: true, variant: null })

    const result = await orderService.updateOrderStatus('1', 'paid')

    expect(result.success).toBe(true)
    expect(updateVariant).toHaveBeenCalledWith('5', { stock: 8 })
  })

  it('reports deduction failures', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'pending' })], itemRows: [dbItem({ variant_id: 5 })] })
    getVariant.mockResolvedValue(null)

    await expect(orderService.updateOrderStatus('1', 'completed')).resolves.toMatchObject({
      success: false,
      error: 'Variant 5 not found',
    })

    getVariant.mockReset()
    getVariant.mockResolvedValue({ id: '5', stock: 1 })

    await expect(orderService.updateOrderStatus('1', 'completed')).resolves.toMatchObject({
      success: false,
      error: 'Insufficient stock for variant. Available: 1, Needed: 2',
    })

    getVariant.mockReset()
    getVariant.mockResolvedValue({ id: '5', stock: 10 })
    updateVariant.mockReset()
    updateVariant.mockResolvedValue({ success: false, error: 'locked' })

    await expect(orderService.updateOrderStatus('1', 'completed')).resolves.toMatchObject({
      success: false,
      error: 'locked',
    })

    updateVariant.mockReset()
    updateVariant.mockResolvedValue({ success: false })

    await expect(orderService.updateOrderStatus('1', 'completed')).resolves.toMatchObject({
      success: false,
      error: 'Failed to update variant stock',
    })
  })

  it('reports simple product deduction failures', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'pending' })], itemRows: [dbItem()] })
    getProduct.mockResolvedValue(null)

    await expect(orderService.updateOrderStatus('1', 'completed')).resolves.toMatchObject({
      success: false,
      error: 'Product 1 not found',
    })

    getProduct.mockReset()
    getProduct.mockResolvedValue(simpleProduct({ variantType: 'configurable' }))

    await expect(orderService.updateOrderStatus('1', 'completed')).resolves.toMatchObject({
      success: false,
      error: 'Cannot deduct stock from configurable product Cafe without variant selection',
    })

    getProduct.mockReset()
    getProduct.mockResolvedValue(simpleProduct({ stock: 1 }))

    await expect(orderService.updateOrderStatus('1', 'completed')).resolves.toMatchObject({
      success: false,
      error: 'Insufficient stock for Cafe. Available: 1, Needed: 2',
    })

    getProduct.mockReset()
    getProduct.mockResolvedValue(simpleProduct({ stock: 20 }))
    updateProduct.mockReset()
    updateProduct.mockResolvedValue({ success: false, error: 'locked' })

    await expect(orderService.updateOrderStatus('1', 'completed')).resolves.toMatchObject({
      success: false,
      error: 'locked',
    })

    updateProduct.mockReset()
    updateProduct.mockResolvedValue({ success: false })

    await expect(orderService.updateOrderStatus('1', 'completed')).resolves.toMatchObject({
      success: false,
      error: 'Failed to update product stock',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('restores stock when cancelling a completed order', async () => {
    mockOrderDb({
      orderRows: [dbOrder({ status: 'completed' })],
      itemRows: [
        dbItem({ id: 1, variant_id: 5, quantity: 1 }),
        dbItem({ id: 2, product_id: 2, quantity: 1 }),
        dbItem({ id: 3, product_id: 3, quantity: 1 }),
        dbItem({ id: 4, product_id: 9, quantity: 1 }),
      ],
    })
    getVariant.mockResolvedValue({ id: '5', stock: 4 })
    updateVariant.mockResolvedValue({ success: true, variant: null })
    getProduct.mockImplementation(async (id: string) => {
      if (id === '2') return simpleProduct({ id: '2', stock: 5 })
      if (id === '3') return simpleProduct({ id: '3', variantType: 'configurable', stock: 5 })
      return null
    })
    updateProduct.mockResolvedValue({ success: true, product: null })

    const result = await orderService.updateOrderStatus('1', 'cancelled')

    expect(result.success).toBe(true)
    expect(updateVariant).toHaveBeenCalledWith('5', { stock: 5 })
    expect(updateProduct).toHaveBeenCalledWith('2', { stock: 6, updatedAt: expect.any(String) })
  })

  it('skips missing variants when restoring', async () => {
    mockOrderDb({
      orderRows: [dbOrder({ status: 'paid' })],
      itemRows: [dbItem({ variant_id: 5, quantity: 1 })],
    })
    getVariant.mockResolvedValue(null)

    const result = await orderService.updateOrderStatus('1', 'pending')

    expect(result.success).toBe(true)
    expect(updateVariant).not.toHaveBeenCalled()
  })

  it('returns an updated order or undefined when it vanished', async () => {
    query
      .mockResolvedValueOnce([dbOrder({ status: 'pending' })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    getProduct.mockResolvedValue(simpleProduct({ stock: 20 }))

    const result = await orderService.updateOrderStatus('1', 'completed')

    expect(result.success).toBe(true)
    expect(result.order).toBeUndefined()
  })

  it('keeps the current payment method when none is given', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'pending' })], itemRows: [] })
    getProduct.mockResolvedValue(simpleProduct())

    const result = await orderService.updateOrderStatus('1', 'pending')

    expect(result.success).toBe(true)
    const [, params] = execute.mock.calls[0]
    expect(params?.[1]).toBe('cash')
    expect(params?.[3]).toBeNull()
  })

  it('returns an error when the status update fails', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'pending' })], itemRows: [] })
    getProduct.mockResolvedValue(simpleProduct())
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(orderService.updateOrderStatus('1', 'completed')).resolves.toMatchObject({
      success: false,
      error: 'Failed to update order status',
    })
  })
})

describe('OrderService.deleteOrder', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    transaction.mockReset()
    syncAggregate.mockClear()
    getProduct.mockReset()
    updateProduct.mockReset()
    getVariant.mockReset()
    updateVariant.mockReset()
    getProduct.mockResolvedValue(null)
    getVariant.mockResolvedValue(null)
    updateProduct.mockResolvedValue({ success: true, product: null })
    updateVariant.mockResolvedValue({ success: true, variant: null })
    transaction.mockResolvedValue(undefined)
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns not found for missing orders', async () => {
    mockOrderDb({ orderRows: [] })

    await expect(orderService.deleteOrder('99')).resolves.toMatchObject({
      success: false,
      error: 'Order not found',
    })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('deletes pending orders without restoring stock', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'pending' })], itemRows: [dbItem()] })

    const result = await orderService.deleteOrder('1')

    expect(result).toEqual({ success: true })
    expect(getProduct).not.toHaveBeenCalled()
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(syncAggregate).toHaveBeenCalledWith('1', 'DELETE')
  })

  it('restores stock when deleting completed orders', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'completed' })], itemRows: [dbItem()] })
    getProduct.mockResolvedValue(simpleProduct({ stock: 5 }))

    const result = await orderService.deleteOrder('1')

    expect(result).toEqual({ success: true })
    expect(updateProduct).toHaveBeenCalled()
  })

  it('returns an error when deletion fails', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'pending' })], itemRows: [] })
    transaction.mockRejectedValueOnce(new Error('db down'))

    await expect(orderService.deleteOrder('1')).resolves.toMatchObject({
      success: false,
      error: 'Failed to delete order',
    })
  })
})

describe('OrderService.updateOrder', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    transaction.mockReset()
    syncAggregate.mockClear()
    getProduct.mockReset()
    updateProduct.mockReset()
    getVariant.mockReset()
    updateVariant.mockReset()
    calculateTotalWithTax.mockReset()
    getProduct.mockResolvedValue(null)
    getVariant.mockResolvedValue(null)
    updateProduct.mockResolvedValue({ success: true, product: null })
    updateVariant.mockResolvedValue({ success: true, variant: null })
    calculateTotalWithTax.mockResolvedValue({ tax: 0, total: 0 })
    transaction.mockResolvedValue(undefined)
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('requires items and a pending order', async () => {
    await expect(orderService.updateOrder('1', { items: [] })).resolves.toMatchObject({
      success: false,
      error: 'Order must contain at least one item',
    })

    mockOrderDb({ orderRows: [] })

    await expect(orderService.updateOrder('99', { items: [{ productId: '1', quantity: 1 }] })).resolves.toMatchObject({
      success: false,
      error: 'Order not found',
    })

    query.mockReset()
    mockOrderDb({ orderRows: [dbOrder({ status: 'completed' })], itemRows: [] })

    await expect(orderService.updateOrder('1', { items: [{ productId: '1', quantity: 1 }] })).resolves.toMatchObject({
      success: false,
      error: 'Can only update pending orders',
    })
  })

  it('rejects unavailable stock for the new items', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'pending' })], itemRows: [] })
    getProduct.mockResolvedValue(simpleProduct({ stock: 0 }))

    await expect(orderService.updateOrder('1', { items: [{ productId: '1', quantity: 1 }] })).resolves.toMatchObject({
      success: false,
      error: 'Insufficient stock for Cafe. Available: 0, Requested: 1',
    })
  })

  it('reports missing products and variants while rebuilding', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'pending' })], itemRows: [] })
    getProduct.mockResolvedValue(simpleProduct())
    getProduct.mockResolvedValueOnce(simpleProduct()).mockResolvedValueOnce(null)

    await expect(orderService.updateOrder('1', { items: [{ productId: '1', quantity: 1 }] })).resolves.toMatchObject({
      success: false,
      error: 'Product 1 not found',
    })

    getProduct.mockReset()
    getVariant.mockReset()
    getProduct.mockResolvedValue(simpleProduct())
    getVariant
      .mockResolvedValueOnce({ id: '9', parentProductId: '1', isActive: true, stock: 5 })
      .mockResolvedValueOnce(null)

    await expect(
      orderService.updateOrder('1', { items: [{ productId: '1', quantity: 1, variantId: '9' }] }),
    ).resolves.toMatchObject({ success: false, error: 'Variant 9 not found for this product' })

    getVariant.mockReset()
    getVariant
      .mockResolvedValueOnce({ id: '5', parentProductId: '1', isActive: true, stock: 5 })
      .mockResolvedValueOnce({ id: '5', parentProductId: '1', isActive: false, stock: 5 })

    await expect(
      orderService.updateOrder('1', { items: [{ productId: '1', quantity: 1, variantId: '5' }] }),
    ).resolves.toMatchObject({ success: false, error: 'Variant is not active' })
  })

  it('rewrites the order with variant support', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'pending' })], itemRows: [] })
    const prod = simpleProduct({ stock: 20 })
    getProduct.mockResolvedValue(prod)
    getVariant.mockResolvedValue({
      id: '5',
      parentProductId: '1',
      price: 70,
      isActive: true,
      stock: 5,
      attributes: { size: 'L' },
    })
    calculateTotalWithTax.mockResolvedValue({ tax: 7, total: 77 })

    const result = await orderService.updateOrder('1', {
      items: [{ productId: '1', quantity: 1, variantId: '5' }],
      paymentMethod: 'transfer',
      notes: 'updated',
    })

    expect(result.success).toBe(true)
    const [statements] = transaction.mock.calls[0]
    expect(statements).toHaveLength(3)
    expect(statements[0]?.sql).toContain('DELETE FROM order_items')
    expect(statements[1]?.sql).toContain('variant_id')
    expect(syncAggregate).toHaveBeenCalledWith('1', 'UPSERT')
  })

  it('rewrites the order without variant columns and keeps current values', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'pending' })], itemRows: [], pragma: { orders: [], items: [] } })
    getProduct.mockResolvedValue(simpleProduct({ stock: 20 }))
    calculateTotalWithTax.mockResolvedValue({ tax: 0, total: 100 })

    const result = await orderService.updateOrder('1', { items: [{ productId: '1', quantity: 1 }] })

    expect(result.success).toBe(true)
    const [statements] = transaction.mock.calls[0]
    expect(statements).toHaveLength(3)
    expect(statements[1]?.sql).not.toContain('variant_id')
    const updateStmt = statements[2]
    expect(updateStmt?.params?.[3]).toBe('cash')
    expect(updateStmt?.params?.[4]).toBe('n')
  })

  it('returns no order when it vanished after rewriting', async () => {
    query
      .mockResolvedValueOnce([dbOrder({ status: 'pending' })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    getProduct.mockResolvedValue(simpleProduct({ stock: 20 }))
    calculateTotalWithTax.mockResolvedValue({ tax: 0, total: 100 })

    const result = await orderService.updateOrder('1', { items: [{ productId: '1', quantity: 1 }] })

    expect(result.success).toBe(true)
    expect(result.order).toBeUndefined()
  })

  it('returns an error when the rewrite fails', async () => {
    mockOrderDb({ orderRows: [dbOrder({ status: 'pending' })], itemRows: [] })
    getProduct.mockResolvedValue(simpleProduct({ stock: 20 }))
    calculateTotalWithTax.mockResolvedValue({ tax: 0, total: 100 })
    transaction.mockRejectedValueOnce(new Error('db down'))

    await expect(orderService.updateOrder('1', { items: [{ productId: '1', quantity: 1 }] })).resolves.toMatchObject({
      success: false,
      error: 'Failed to update order',
    })
  })
})
