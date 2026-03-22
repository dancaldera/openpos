/**
 * Analytics routes (protected)
 *
 * GET /api/analytics/summary    — key metrics (revenue, orders, customers)
 * GET /api/analytics/sales      — sales over time (daily/weekly/monthly)
 * GET /api/analytics/products   — top products
 * GET /api/analytics/staff      — staff performance
 */

import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { query } from '../lib/turso.js'

export const analyticsRouter = new Hono()

analyticsRouter.use('/*', authMiddleware)

// GET /api/analytics/summary
analyticsRouter.get('/summary', async (c) => {
  const [
    orderStats,
    avgValue,
    profitStats,
    customerCount,
    newCustomers,
  ] = await Promise.all([
    query<{ total_orders: number; completed_orders: number; pending_orders: number; cancelled_orders: number; total_revenue: number }>(
      `SELECT COUNT(*) as total_orders,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
              SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
              SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END) as total_revenue
       FROM orders`,
    ),
    query<{ avg_order_value: number }>(
      "SELECT AVG(total) as avg_order_value FROM orders WHERE status = 'completed'",
    ),
    query<{ total_profit: number }>(
      `SELECT SUM(oi.quantity * (p.price - COALESCE(p.cost, 0))) as total_profit
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'completed'`,
    ),
    query<{ count: number }>('SELECT COUNT(*) as count FROM customers WHERE deleted_at IS NULL AND is_active = 1'),
    query<{ count: number }>(
      `SELECT COUNT(*) as count FROM customers
       WHERE deleted_at IS NULL AND created_at >= datetime('now', '-30 days')`,
    ),
  ])

  const stats = orderStats[0]
  return c.json({
    totalOrders: stats?.total_orders ?? 0,
    completedOrders: stats?.completed_orders ?? 0,
    pendingOrders: stats?.pending_orders ?? 0,
    cancelledOrders: stats?.cancelled_orders ?? 0,
    totalRevenue: stats?.total_revenue ?? 0,
    avgOrderValue: avgValue[0]?.avg_order_value ?? 0,
    totalProfit: profitStats[0]?.total_profit ?? 0,
    totalCustomers: customerCount[0]?.count ?? 0,
    newCustomers30d: newCustomers[0]?.count ?? 0,
  })
})

// GET /api/analytics/sales?period=daily|weekly|monthly
analyticsRouter.get('/sales', async (c) => {
  const period = c.req.query('period') ?? 'daily'

  let groupBy: string
  switch (period) {
    case 'monthly':
      groupBy = "strftime('%Y-%m', created_at)"
      break
    case 'weekly':
      groupBy = "strftime('%Y-W%W', created_at)"
      break
    default:
      groupBy = "strftime('%Y-%m-%d', created_at)"
  }

  const rows = await query<{ period: string; sales: number; orders: number; revenue: number }>(
    `SELECT ${groupBy} as period,
            SUM(total) as sales,
            COUNT(*) as orders,
            SUM(total) as revenue
     FROM orders
     WHERE status = 'completed'
     GROUP BY ${groupBy}
     ORDER BY period DESC
     LIMIT 30`,
  )

  return c.json({ data: rows })
})

// GET /api/analytics/products?limit=10
analyticsRouter.get('/products', async (c) => {
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? '10')))

  const rows = await query<{ product_id: number; product_name: string; total_sold: number; total_revenue: number; avg_price: number }>(
    `SELECT oi.product_id,
            oi.product_name,
            SUM(oi.quantity) as total_sold,
            SUM(oi.total_price) as total_revenue,
            AVG(oi.unit_price) as avg_price
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status = 'completed'
     GROUP BY oi.product_id, oi.product_name
     ORDER BY total_sold DESC
     LIMIT ?`,
    [limit],
  )

  return c.json({ data: rows })
})

// GET /api/analytics/staff
analyticsRouter.get('/staff', async (c) => {
  const rows = await query<{ user_id: number; user_name: string; total_sales: number; total_orders: number; total_revenue: number }>(
    `SELECT u.id as user_id,
            u.name as user_name,
            SUM(o.total) as total_sales,
            COUNT(o.id) as total_orders,
            SUM(o.total) as total_revenue
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.status = 'completed'
     GROUP BY u.id, u.name
     ORDER BY total_revenue DESC`,
  )

  return c.json({ data: rows })
})
