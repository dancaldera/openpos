export interface DashboardStats {
  totalSales: number
  ordersToday: number
  averageOrderValue: number
  lowStockProducts: number
  pendingOrders: number
}

type QueryRunner = <T>(sql: string, params?: unknown[]) => Promise<T[]>

type DashboardStatsCacheEntry = {
  stats: DashboardStats
  expiresAt: number
}

type LoadDashboardStatsOptions = {
  now?: number
  referenceDate?: Date
}

const dashboardStatsCache = new Map<string, DashboardStatsCacheEntry>()

export const DASHBOARD_STATS_TTL_MS = 30_000

export function invalidateDashboardStatsCache(cacheKey?: string): void {
  if (cacheKey) {
    dashboardStatsCache.delete(cacheKey)
    for (const key of dashboardStatsCache.keys()) {
      if (key.startsWith(`${cacheKey}:`)) {
        dashboardStatsCache.delete(key)
      }
    }
    return
  }

  dashboardStatsCache.clear()
}

export async function fetchDashboardStats(
  runQuery: QueryRunner,
  referenceDate: Date = new Date(),
): Promise<DashboardStats> {
  const todayStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  ).toISOString()
  const todayEnd = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() + 1,
  ).toISOString()

  const [todayMetricsResult, lowStockProductsResult, pendingOrdersResult] = await Promise.all([
    runQuery<{
      total_sales: number
      orders_today: number
      average_order_value: number
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status IN ('completed', 'paid') THEN total ELSE 0 END), 0) as total_sales,
         COUNT(*) as orders_today,
         COALESCE(AVG(CASE WHEN status IN ('completed', 'paid') THEN total END), 0) as average_order_value
       FROM orders
       WHERE created_at >= ? AND created_at < ?`,
      [todayStart, todayEnd],
    ),
    runQuery<{ low_stock_products: number }>(
      `SELECT COUNT(*) as low_stock_products
       FROM products
       WHERE is_active = 1
         AND stock > 0
         AND stock < ?`,
      [10],
    ),
    runQuery<{ pending_orders: number }>(
      `SELECT COUNT(*) as pending_orders
       FROM orders
       WHERE status = ?`,
      ['pending'],
    ),
  ])

  const todayMetrics = todayMetricsResult[0]
  const lowStockProducts = lowStockProductsResult[0]
  const pendingOrders = pendingOrdersResult[0]

  return {
    totalSales: todayMetrics?.total_sales ?? 0,
    ordersToday: todayMetrics?.orders_today ?? 0,
    averageOrderValue: todayMetrics?.average_order_value ?? 0,
    lowStockProducts: lowStockProducts?.low_stock_products ?? 0,
    pendingOrders: pendingOrders?.pending_orders ?? 0,
  }
}

export async function loadDashboardStats(
  cacheKey: string,
  runQuery: QueryRunner,
  options: LoadDashboardStatsOptions = {},
): Promise<DashboardStats> {
  const now = options.now ?? Date.now()
  const referenceDate = options.referenceDate ?? new Date(now)
  const scopedCacheKey = [
    cacheKey,
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  ].join(':')
  const cachedEntry = dashboardStatsCache.get(scopedCacheKey)

  if (cachedEntry && cachedEntry.expiresAt > now) {
    return cachedEntry.stats
  }

  const stats = await fetchDashboardStats(runQuery, referenceDate)
  dashboardStatsCache.set(scopedCacheKey, {
    stats,
    expiresAt: now + DASHBOARD_STATS_TTL_MS,
  })

  return stats
}
