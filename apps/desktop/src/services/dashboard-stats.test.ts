import { beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  DASHBOARD_STATS_TTL_MS,
  fetchDashboardStats,
  invalidateDashboardStatsCache,
  loadDashboardStats,
} from './dashboard-stats'

function createQueryRunner(responses: {
  todayMetrics: { total_sales: number; orders_today: number; average_order_value: number }
  lowStockProducts: { low_stock_products: number }
  pendingOrders: { pending_orders: number }
}) {
  const queryMock = mock(async (sql: string, params?: unknown[]) => {
    if (sql.includes('orders_today')) {
      return [responses.todayMetrics]
    }

    if (sql.includes('low_stock_products')) {
      return [responses.lowStockProducts]
    }

    if (sql.includes('pending_orders')) {
      return [responses.pendingOrders]
    }

    throw new Error(`Unexpected query: ${sql} :: ${JSON.stringify(params ?? [])}`)
  })

  const runQuery = async <T>(sql: string, params?: unknown[]) => queryMock(sql, params) as Promise<T[]>

  return { queryMock, runQuery }
}

describe('dashboard stats helpers', () => {
  beforeEach(() => {
    invalidateDashboardStatsCache()
  })

  it('maps aggregate query results into dashboard stats using the current day window', async () => {
    const referenceDate = new Date(2026, 3, 3, 15, 45, 0, 0)
    const { queryMock, runQuery } = createQueryRunner({
      todayMetrics: {
        total_sales: 156.25,
        orders_today: 4,
        average_order_value: 78.125,
      },
      lowStockProducts: { low_stock_products: 3 },
      pendingOrders: { pending_orders: 2 },
    })

    const stats = await fetchDashboardStats(runQuery, referenceDate)

    expect(stats).toEqual({
      totalSales: 156.25,
      ordersToday: 4,
      averageOrderValue: 78.125,
      lowStockProducts: 3,
      pendingOrders: 2,
    })
    expect(queryMock).toHaveBeenCalledTimes(3)

    const ordersCall = queryMock.mock.calls.find(([sql]) => String(sql).includes('orders_today'))
    expect(ordersCall).toBeDefined()
    expect(ordersCall?.[1]).toEqual([new Date(2026, 3, 3).toISOString(), new Date(2026, 3, 4).toISOString()])
  })

  it('reuses cached stats while the TTL is still valid', async () => {
    const { queryMock, runQuery } = createQueryRunner({
      todayMetrics: {
        total_sales: 45,
        orders_today: 2,
        average_order_value: 22.5,
      },
      lowStockProducts: { low_stock_products: 1 },
      pendingOrders: { pending_orders: 5 },
    })

    const first = await loadDashboardStats('dashboard-test', runQuery, {
      now: 1_000,
      referenceDate: new Date(2026, 3, 3, 9, 0, 0, 0),
    })
    const second = await loadDashboardStats('dashboard-test', runQuery, {
      now: 1_000 + DASHBOARD_STATS_TTL_MS - 1,
      referenceDate: new Date(2026, 3, 4, 9, 0, 0, 0),
    })

    expect(first).toEqual(second)
    expect(queryMock).toHaveBeenCalledTimes(3)
  })

  it('refreshes cached stats once the TTL expires', async () => {
    let totalSales = 80
    const queryMock = mock(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('orders_today')) {
        return [
          {
            total_sales: totalSales,
            orders_today: 3,
            average_order_value: totalSales / 2,
          },
        ]
      }

      if (sql.includes('low_stock_products')) {
        return [{ low_stock_products: 2 }]
      }

      if (sql.includes('pending_orders')) {
        return [{ pending_orders: 1 }]
      }

      throw new Error(`Unexpected query: ${sql}`)
    })
    const runQuery = async <T>(sql: string, params?: unknown[]) => queryMock(sql, params) as Promise<T[]>

    const first = await loadDashboardStats('dashboard-test', runQuery, {
      now: 5_000,
      referenceDate: new Date(2026, 3, 3, 9, 0, 0, 0),
    })

    totalSales = 120

    const second = await loadDashboardStats('dashboard-test', runQuery, {
      now: 5_000 + DASHBOARD_STATS_TTL_MS,
      referenceDate: new Date(2026, 3, 3, 10, 0, 0, 0),
    })

    expect(first.totalSales).toBe(80)
    expect(second.totalSales).toBe(120)
    expect(queryMock).toHaveBeenCalledTimes(6)
  })

  it('forces a refresh after explicit invalidation', async () => {
    let lowStockProducts = 4
    const queryMock = mock(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('orders_today')) {
        return [{ total_sales: 200, orders_today: 6, average_order_value: 50 }]
      }

      if (sql.includes('low_stock_products')) {
        return [{ low_stock_products: lowStockProducts }]
      }

      if (sql.includes('pending_orders')) {
        return [{ pending_orders: 2 }]
      }

      throw new Error(`Unexpected query: ${sql}`)
    })
    const runQuery = async <T>(sql: string, params?: unknown[]) => queryMock(sql, params) as Promise<T[]>

    const first = await loadDashboardStats('dashboard-test', runQuery, {
      now: 10_000,
      referenceDate: new Date(2026, 3, 3, 11, 0, 0, 0),
    })

    invalidateDashboardStatsCache('dashboard-test')
    lowStockProducts = 1

    const second = await loadDashboardStats('dashboard-test', runQuery, {
      now: 10_001,
      referenceDate: new Date(2026, 3, 3, 11, 1, 0, 0),
    })

    expect(first.lowStockProducts).toBe(4)
    expect(second.lowStockProducts).toBe(1)
    expect(queryMock).toHaveBeenCalledTimes(6)
  })
})
