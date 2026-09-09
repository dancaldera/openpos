import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({
  query: vi.fn(async () => []),
}))

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next()
  },
}))

vi.mock('../lib/turso.js', () => ({
  query,
}))

const { analyticsRouter } = await import('./analytics.js')

function createApp() {
  const app = new Hono()
  app.route('/api/analytics', analyticsRouter)
  return app
}

describe('analyticsRouter', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('summarizes metrics with zeros for missing rows', async () => {
    query
      .mockResolvedValueOnce([{ total_orders: 10, completed_orders: 7, pending_orders: 2, cancelled_orders: 1, total_revenue: 500 }])
      .mockResolvedValueOnce([{ avg_order_value: 71 }])
      .mockResolvedValueOnce([{ total_profit: 200 }])
      .mockResolvedValueOnce([{ count: 30 }])
      .mockResolvedValueOnce([{ count: 5 }])
    const app = createApp()

    const res = await app.request('/api/analytics/summary')
    const body = (await res.json()) as Record<string, number>

    expect(res.status).toBe(200)
    expect(body).toEqual({
      totalOrders: 10,
      completedOrders: 7,
      pendingOrders: 2,
      cancelledOrders: 1,
      totalRevenue: 500,
      avgOrderValue: 71,
      totalProfit: 200,
      totalCustomers: 30,
      newCustomers30d: 5,
    })
  })

  it('summarizes empty databases as zeros', async () => {
    query.mockResolvedValue([])
    const app = createApp()

    const res = await app.request('/api/analytics/summary')
    const body = (await res.json()) as Record<string, number>

    expect(res.status).toBe(200)
    expect(body).toEqual({
      totalOrders: 0,
      completedOrders: 0,
      pendingOrders: 0,
      cancelledOrders: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      totalProfit: 0,
      totalCustomers: 0,
      newCustomers30d: 0,
    })
  })

  it('groups sales by month, week, and day', async () => {
    query.mockResolvedValue([{ period: '2026-01', sales: 100, orders: 2, revenue: 100 }])
    const app = createApp()

    for (const period of ['monthly', 'weekly']) {
      const res = await app.request(`/api/analytics/sales?period=${period}`)
      expect(res.status).toBe(200)
    }

    const daily = await app.request('/api/analytics/sales')
    expect(daily.status).toBe(200)

    const statements = query.mock.calls.map((call) => String(call[0]))
    expect(statements[0]).toContain("strftime('%Y-%m', created_at)")
    expect(statements[1]).toContain("strftime('%Y-W%W', created_at)")
    expect(statements[2]).toContain("strftime('%Y-%m-%d', created_at)")
  })

  it('lists top products with a clamped limit', async () => {
    query.mockResolvedValue([{ product_id: 1, product_name: 'Apple', total_sold: 5, total_revenue: 50, avg_price: 10 }])
    const app = createApp()

    const res = await app.request('/api/analytics/products?limit=5')
    expect(res.status).toBe(200)
    expect(query.mock.calls[0][1]).toEqual([5])

    query.mockClear()
    const defaulted = await app.request('/api/analytics/products')
    expect(defaulted.status).toBe(200)
    expect(query.mock.calls[0][1]).toEqual([10])
  })

  it('lists staff performance', async () => {
    query.mockResolvedValue([{ user_id: 3, user_name: 'Ada', total_sales: 100, total_orders: 2, total_revenue: 100 }])
    const app = createApp()

    const res = await app.request('/api/analytics/staff')
    const body = (await res.json()) as { data: unknown[] }

    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(1)
  })
})
