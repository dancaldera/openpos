import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query, getOrders, getOrdersByDateRange, getOrdersByStatus, getTotalSales, getTopSellingProducts, getProducts } =
  vi.hoisted(() => ({
    query: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<Array<Record<string, unknown>>> => []),
    getOrders: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
    getOrdersByDateRange: vi.fn(async (_start: string, _end: string): Promise<Array<Record<string, unknown>>> => []),
    getOrdersByStatus: vi.fn(async (_status: string): Promise<Array<Record<string, unknown>>> => []),
    getTotalSales: vi.fn(async (): Promise<number> => 0),
    getTopSellingProducts: vi.fn(async (_limit: number): Promise<Array<Record<string, unknown>>> => []),
    getProducts: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
  }))

vi.mock('../lib/db-adapter', () => ({
  query,
}))

vi.mock('./orders-turso', () => ({
  orderService: { getOrders, getOrdersByDateRange, getOrdersByStatus, getTotalSales, getTopSellingProducts },
}))

vi.mock('./products-turso', () => ({
  productService: { getProducts },
}))

const { dashboardService } = await import('./dashboard-turso')
const { invalidateDashboardStatsCache, loadDashboardStats } = await import('./dashboard-stats')

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    items: [],
    subtotal: 100,
    tax: 16,
    total: 116,
    status: 'completed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('DashboardService', () => {
  beforeEach(() => {
    query.mockReset()
    getOrders.mockReset()
    getOrdersByDateRange.mockReset()
    getOrdersByStatus.mockReset()
    getTotalSales.mockReset()
    getTopSellingProducts.mockReset()
    getProducts.mockReset()
    getOrders.mockResolvedValue([])
    getOrdersByDateRange.mockResolvedValue([])
    getOrdersByStatus.mockResolvedValue([])
    getTotalSales.mockResolvedValue(0)
    getTopSellingProducts.mockResolvedValue([])
    getProducts.mockResolvedValue([])
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('low_stock_products')) return [{ low_stock_products: 2 }]
      if (sql.includes('status = ?')) return [{ pending_orders: 1 }]
      return [{ total_sales: 500, orders_today: 4, average_order_value: 125 }]
    })
    invalidateDashboardStatsCache()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('invalidates cached stats including scoped and unrelated keys', async () => {
    await loadDashboardStats('other', async () => [])
    await dashboardService.getDashboardStats()

    dashboardService.invalidateDashboardStatsCache()

    expect(query).toHaveBeenCalled()
  })

  it('returns dashboard stats for a reference date', async () => {
    const stats = await dashboardService.getDashboardStats({ referenceDate: new Date('2026-03-01T12:00:00Z') })

    expect(stats).toEqual({
      totalSales: 500,
      ordersToday: 4,
      averageOrderValue: 125,
      lowStockProducts: 2,
      pendingOrders: 1,
    })
  })

  it('throws when dashboard stats fail', async () => {
    query.mockImplementation(async () => {
      throw new Error('db down')
    })

    await expect(dashboardService.getDashboardStats()).rejects.toThrow('Failed to fetch dashboard statistics')
  })

  it('builds daily sales data from completed and paid orders', async () => {
    const today = new Date().toISOString()
    getOrders.mockResolvedValue([
      order({ id: '1', total: 100, status: 'completed', createdAt: today }),
      order({ id: '2', total: 50, status: 'paid', createdAt: today }),
      order({ id: '3', total: 999, status: 'pending', createdAt: today }),
      order({ id: '4', total: 25, status: 'cancelled', createdAt: today }),
    ])

    const sales = await dashboardService.getSalesData(1)

    expect(sales).toHaveLength(1)
    expect(sales[0]?.amount).toBe(150)

    const week = await dashboardService.getSalesData()

    expect(week).toHaveLength(7)
  })

  it('throws when sales data fails', async () => {
    getOrders.mockRejectedValueOnce(new Error('db down'))

    await expect(dashboardService.getSalesData()).rejects.toThrow('Failed to fetch sales data')
  })

  it('maps top products with a default limit', async () => {
    getTopSellingProducts.mockResolvedValueOnce([
      { productId: '1', productName: 'Cafe', totalSold: 10, totalRevenue: 200 },
    ])

    const top = await dashboardService.getTopProducts()

    expect(getTopSellingProducts).toHaveBeenCalledWith(5)
    expect(top).toEqual([{ id: '1', name: 'Cafe', sales: 10, revenue: 200 }])
  })

  it('throws when top products fail', async () => {
    getTopSellingProducts.mockRejectedValueOnce(new Error('db down'))

    await expect(dashboardService.getTopProducts(3)).rejects.toThrow('Failed to fetch top products')
  })

  it('returns recent orders sorted by creation date', async () => {
    getOrders.mockResolvedValue([
      order({ id: '1', createdAt: '2026-01-01T00:00:00.000Z' }),
      order({ id: '2', createdAt: '2026-03-01T00:00:00.000Z' }),
      order({ id: '3', createdAt: '2026-02-01T00:00:00.000Z' }),
    ])

    const recent = await dashboardService.getRecentOrders(2)

    expect(recent.map((o) => o.id)).toEqual(['2', '3'])
  })

  it('throws when recent orders fail', async () => {
    getOrders.mockRejectedValueOnce(new Error('db down'))

    await expect(dashboardService.getRecentOrders()).rejects.toThrow('Failed to fetch recent orders')
  })

  it('computes inventory status for active products', async () => {
    getProducts.mockResolvedValue([
      { id: '1', isActive: true, stock: 0 },
      { id: '2', isActive: true, stock: 3 },
      { id: '3', isActive: true, stock: 20 },
      { id: '4', isActive: false, stock: 0 },
    ])

    await expect(dashboardService.getInventoryStatus()).resolves.toEqual({
      totalProducts: 3,
      outOfStock: 1,
      lowStock: 1,
      inStock: 1,
    })
  })

  it('throws when inventory status fails', async () => {
    getProducts.mockRejectedValueOnce(new Error('db down'))

    await expect(dashboardService.getInventoryStatus()).rejects.toThrow('Failed to fetch inventory status')
  })

  it('groups sales by date range', async () => {
    getOrdersByDateRange.mockResolvedValue([
      order({ id: '1', total: 100, status: 'completed', createdAt: '2026-01-02T10:00:00.000Z' }),
      order({ id: '2', total: 50, status: 'paid', createdAt: '2026-01-02T15:00:00.000Z' }),
      order({ id: '3', total: 75, status: 'completed', createdAt: '2026-01-01T10:00:00.000Z' }),
      order({ id: '4', total: 999, status: 'pending', createdAt: '2026-01-01T11:00:00.000Z' }),
    ])

    const sales = await dashboardService.getSalesDataByDateRange('2026-01-01', '2026-01-02')

    expect(sales).toEqual([
      { date: '2026-01-01', amount: 75 },
      { date: '2026-01-02', amount: 150 },
    ])
  })

  it('throws when date range sales fail', async () => {
    getOrdersByDateRange.mockRejectedValueOnce(new Error('db down'))

    await expect(dashboardService.getSalesDataByDateRange('2026-01-01', '2026-01-02')).rejects.toThrow(
      'Failed to fetch sales data for date range',
    )
  })

  it('returns the total sales amount', async () => {
    getTotalSales.mockResolvedValueOnce(1234)

    await expect(dashboardService.getTotalSalesAmount()).resolves.toBe(1234)
  })

  it('throws when total sales fail', async () => {
    getTotalSales.mockRejectedValueOnce(new Error('db down'))

    await expect(dashboardService.getTotalSalesAmount()).rejects.toThrow('Failed to fetch total sales amount')
  })

  it('breaks orders down by status', async () => {
    getOrdersByStatus.mockImplementation(async (status: string) => {
      if (status === 'pending') return [order({ id: '1', status }), order({ id: '2', status })]
      if (status === 'paid') return [order({ id: '3', status })]
      if (status === 'completed') return [order({ id: '4', status })]
      return []
    })

    await expect(dashboardService.getOrderStatusBreakdown()).resolves.toEqual({
      pending: 2,
      paid: 1,
      completed: 1,
      cancelled: 0,
      total: 4,
    })
    expect(getOrdersByStatus).toHaveBeenCalledTimes(4)
  })

  it('throws when the status breakdown fails', async () => {
    getOrdersByStatus.mockRejectedValueOnce(new Error('db down'))

    await expect(dashboardService.getOrderStatusBreakdown()).rejects.toThrow('Failed to fetch order status breakdown')
  })
})
