import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({
  query: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<Array<Record<string, unknown>>> => []),
}))

vi.mock('../lib/db-adapter', () => ({
  query,
}))

const { analyticsService } = await import('./analytics-turso')

describe('AnalyticsService.getOverallMetrics', () => {
  beforeEach(() => {
    query.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns metrics without a date range', async () => {
    query
      .mockResolvedValueOnce([
        { total_orders: 10, completed_orders: 6, pending_orders: 3, cancelled_orders: 1, total_revenue: 600 },
      ])
      .mockResolvedValueOnce([{ avg_order_value: 100 }])
      .mockResolvedValueOnce([{ total_profit: 250 }])

    const metrics = await analyticsService.getOverallMetrics()

    expect(metrics).toEqual({
      totalSales: 6,
      totalOrders: 10,
      completedOrders: 6,
      pendingOrders: 3,
      cancelledOrders: 1,
      averageOrderValue: 100,
      totalRevenue: 600,
      totalProfit: 250,
    })
    expect(query).toHaveBeenCalledTimes(3)
    for (const call of query.mock.calls) {
      expect(call[1]).toEqual([])
    }
  })

  it('filters metrics by date range', async () => {
    query
      .mockResolvedValueOnce([
        { total_orders: 4, completed_orders: 2, pending_orders: 2, cancelled_orders: 0, total_revenue: 200 },
      ])
      .mockResolvedValueOnce([{ avg_order_value: 100 }])
      .mockResolvedValueOnce([{ total_profit: 80 }])

    const metrics = await analyticsService.getOverallMetrics('2026-01-01', '2026-01-31')

    expect(metrics.totalOrders).toBe(4)
    expect(metrics.totalProfit).toBe(80)
    for (const call of query.mock.calls) {
      expect(call[1]).toEqual(['2026-01-01', '2026-01-31'])
    }
  })

  it('returns zeroed metrics when the queries fail', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(analyticsService.getOverallMetrics()).resolves.toEqual({
      totalSales: 0,
      totalOrders: 0,
      completedOrders: 0,
      pendingOrders: 0,
      cancelledOrders: 0,
      averageOrderValue: 0,
      totalRevenue: 0,
      totalProfit: 0,
    })
    expect(console.error).toHaveBeenCalled()
  })
})

describe('AnalyticsService.getSalesByMembers', () => {
  beforeEach(() => {
    query.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('maps member rows with and without a date range', async () => {
    query.mockResolvedValueOnce([{ user_id: 1, user_name: 'Ana', total_sales: 5, total_orders: 5, total_revenue: 500 }])

    const members = await analyticsService.getSalesByMembers('2026-01-01', '2026-01-31')

    expect(members).toEqual([{ userId: '1', userName: 'Ana', totalSales: 5, totalOrders: 5, totalRevenue: 500 }])
    expect(query.mock.calls[0][1]).toEqual(['2026-01-01', '2026-01-31'])

    query.mockReset()
    query.mockResolvedValueOnce([
      { user_id: 2, user_name: 'Luis', total_sales: 2, total_orders: 2, total_revenue: 120 },
    ])

    const unfiltered = await analyticsService.getSalesByMembers()

    expect(unfiltered[0]?.userId).toBe('2')
    expect(query.mock.calls[0][1]).toEqual([])
  })

  it('returns an empty array on failure', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(analyticsService.getSalesByMembers()).resolves.toEqual([])
  })
})

describe('AnalyticsService.getTopProducts', () => {
  beforeEach(() => {
    query.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('maps top product rows with a default limit', async () => {
    query.mockResolvedValueOnce([
      { product_id: 7, product_name: 'Cafe', total_sold: 20, total_revenue: 400, avg_price: 20 },
    ])

    const top = await analyticsService.getTopProducts()

    expect(top).toEqual([{ productId: '7', productName: 'Cafe', totalSold: 20, totalRevenue: 400, averagePrice: 20 }])
    expect(query.mock.calls[0][1]).toEqual([10])
  })

  it('passes a custom limit and date range', async () => {
    query.mockResolvedValueOnce([])

    await analyticsService.getTopProducts(3, '2026-01-01', '2026-01-31')

    expect(query.mock.calls[0][1]).toEqual(['2026-01-01', '2026-01-31', 3])
  })

  it('returns an empty array on failure', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(analyticsService.getTopProducts()).resolves.toEqual([])
  })
})

describe('AnalyticsService.getSalesByPeriod', () => {
  beforeEach(() => {
    query.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('groups by day, week, and month', async () => {
    for (const period of ['day', 'week', 'month'] as const) {
      query.mockReset()
      query.mockResolvedValueOnce([{ period: 'p1', sales: 2, orders: 2, revenue: 50 }])

      const rows = await analyticsService.getSalesByPeriod(period)

      expect(rows).toEqual([{ period: 'p1', sales: 2, orders: 2, revenue: 50 }])
    }

    expect(query).toHaveBeenCalledTimes(1)
  })

  it('filters by date range', async () => {
    query.mockResolvedValueOnce([])

    await analyticsService.getSalesByPeriod('day', '2026-01-01', '2026-01-31')

    expect(query.mock.calls[0][1]).toEqual(['2026-01-01', '2026-01-31'])
  })

  it('returns an empty array on failure', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(analyticsService.getSalesByPeriod('month')).resolves.toEqual([])
  })
})

describe('AnalyticsService.getRecentActivity', () => {
  beforeEach(() => {
    query.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('classifies created, completed, paid, and cancelled orders', async () => {
    query.mockResolvedValueOnce([
      {
        id: 1,
        status: 'pending',
        total: 40,
        created_at: '2026-01-01T00:00:00.000Z',
        completed_at: null,
        user_id: 1,
        user_name: 'Ana',
      },
      {
        id: 2,
        status: 'completed',
        total: 60,
        created_at: '2026-01-01T01:00:00.000Z',
        completed_at: '2026-01-01T02:00:00.000Z',
        user_id: 1,
        user_name: 'Ana',
      },
      {
        id: 3,
        status: 'paid',
        total: 70,
        created_at: '2026-01-01T03:00:00.000Z',
        completed_at: null,
        user_id: 2,
        user_name: 'Luis',
      },
      {
        id: 4,
        status: 'cancelled',
        total: 10,
        created_at: '2026-01-01T04:00:00.000Z',
        completed_at: null,
        user_id: 2,
        user_name: 'Luis',
      },
    ])

    const activity = await analyticsService.getRecentActivity(4)

    expect(activity).toEqual([
      {
        id: '1',
        type: 'order_created',
        description: 'Order #1 created',
        amount: 40,
        timestamp: '2026-01-01T00:00:00.000Z',
        userName: 'Ana',
      },
      {
        id: '2',
        type: 'order_completed',
        description: 'Order #2 completed',
        amount: 60,
        timestamp: '2026-01-01T02:00:00.000Z',
        userName: 'Ana',
      },
      {
        id: '3',
        type: 'order_completed',
        description: 'Order #3 completed',
        amount: 70,
        timestamp: '2026-01-01T03:00:00.000Z',
        userName: 'Luis',
      },
      {
        id: '4',
        type: 'order_cancelled',
        description: 'Order #4 cancelled',
        amount: 10,
        timestamp: '2026-01-01T04:00:00.000Z',
        userName: 'Luis',
      },
    ])
    expect(query.mock.calls[0][1]).toEqual([4])
  })

  it('returns an empty array on failure', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(analyticsService.getRecentActivity()).resolves.toEqual([])
  })
})
