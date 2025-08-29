import Database from '@tauri-apps/plugin-sql'

export interface AnalyticsMetrics {
  totalSales: number
  totalOrders: number
  completedOrders: number
  pendingOrders: number
  cancelledOrders: number
  averageOrderValue: number
  totalRevenue: number
}

export interface SalesByMember {
  userId: string
  userName: string
  totalSales: number
  totalOrders: number
  totalRevenue: number
}

export interface SalesByPeriod {
  period: string
  sales: number
  orders: number
  revenue: number
}

export interface TopProduct {
  productId: string
  productName: string
  totalSold: number
  totalRevenue: number
  averagePrice: number
}

export type RecentActivity = {
  id: string
  type: 'order_created' | 'order_completed' | 'order_cancelled'
  description: string
  amount?: number
  timestamp: string
  userName?: string
}

export class AnalyticsService {
  private static instance: AnalyticsService
  private db: Database | null = null

  static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService()
    }
    return AnalyticsService.instance
  }

  private async getDatabase(): Promise<Database> {
    if (!this.db) {
      this.db = await Database.load('sqlite:postpos.db')
    }
    return this.db
  }

  async getOverallMetrics(startDate?: string, endDate?: string): Promise<AnalyticsMetrics> {
    try {
      const db = await this.getDatabase()

      let whereClause = ''
      const params: Array<string | number> = []

      if (startDate && endDate) {
        whereClause = 'WHERE created_at >= ? AND created_at <= ?'
        params.push(startDate, endDate)
      }

      const [metricsResult, avgOrderResult] = await Promise.all([
        db.select<
          {
            total_orders: number
            completed_orders: number
            pending_orders: number
            cancelled_orders: number
            total_revenue: number
          }[]
        >(
          `
          SELECT 
            COUNT(*) as total_orders,
            SUM(CASE WHEN status = 'completed' OR status = 'paid' THEN 1 ELSE 0 END) as completed_orders,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
            COALESCE(SUM(CASE WHEN status = 'completed' OR status = 'paid' THEN total ELSE 0 END), 0) as total_revenue
          FROM orders ${whereClause}
        `,
          params,
        ),

        db.select<{ avg_order_value: number }[]>(
          `
          SELECT 
            COALESCE(AVG(total), 0) as avg_order_value
          FROM orders 
          WHERE status IN ('completed', 'paid') ${startDate && endDate ? 'AND created_at >= ? AND created_at <= ?' : ''}
        `,
          startDate && endDate ? params : [],
        ),
      ])

      const metrics = metricsResult[0]
      const avgOrder = avgOrderResult[0]

      return {
        totalSales: metrics.completed_orders,
        totalOrders: metrics.total_orders,
        completedOrders: metrics.completed_orders,
        pendingOrders: metrics.pending_orders,
        cancelledOrders: metrics.cancelled_orders,
        averageOrderValue: avgOrder.avg_order_value,
        totalRevenue: metrics.total_revenue,
      }
    } catch (error) {
      console.error('Get overall metrics error:', error)
      return {
        totalSales: 0,
        totalOrders: 0,
        completedOrders: 0,
        pendingOrders: 0,
        cancelledOrders: 0,
        averageOrderValue: 0,
        totalRevenue: 0,
      }
    }
  }

  async getSalesByMembers(startDate?: string, endDate?: string): Promise<SalesByMember[]> {
    try {
      const db = await this.getDatabase()

      let whereClause = "WHERE o.status IN ('completed', 'paid')"
      const params: Array<string | number> = []

      if (startDate && endDate) {
        whereClause += ' AND o.created_at >= ? AND o.created_at <= ?'
        params.push(startDate, endDate)
      }

      const results = await db.select<
        {
          user_id: number
          user_name: string
          total_sales: number
          total_orders: number
          total_revenue: number
        }[]
      >(
        `
        SELECT 
          COALESCE(o.user_id, 1) as user_id,
          COALESCE(u.name, 'Unknown User') as user_name,
          COUNT(*) as total_sales,
          COUNT(*) as total_orders,
          COALESCE(SUM(o.total), 0) as total_revenue
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ${whereClause}
        GROUP BY o.user_id, u.name
        ORDER BY total_revenue DESC
      `,
        params,
      )

      return results.map((result) => ({
        userId: result.user_id.toString(),
        userName: result.user_name,
        totalSales: result.total_sales,
        totalOrders: result.total_orders,
        totalRevenue: result.total_revenue,
      }))
    } catch (error) {
      console.error('Get sales by members error:', error)
      return []
    }
  }

  async getTopProducts(limit: number = 10, startDate?: string, endDate?: string): Promise<TopProduct[]> {
    try {
      const db = await this.getDatabase()

      let whereClause = "WHERE o.status IN ('completed', 'paid')"
      const params: Array<string | number> = []

      if (startDate && endDate) {
        whereClause += ' AND o.created_at >= ? AND o.created_at <= ?'
        params.push(startDate, endDate)
      }

      params.push(limit)

      const results = await db.select<
        {
          product_id: number
          product_name: string
          total_sold: number
          total_revenue: number
          avg_price: number
        }[]
      >(
        `
        SELECT 
          oi.product_id,
          oi.product_name,
          SUM(oi.quantity) as total_sold,
          SUM(oi.total_price) as total_revenue,
          AVG(oi.unit_price) as avg_price
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        ${whereClause}
        GROUP BY oi.product_id, oi.product_name
        ORDER BY total_sold DESC
        LIMIT ?
      `,
        params,
      )

      return results.map((result) => ({
        productId: result.product_id.toString(),
        productName: result.product_name,
        totalSold: result.total_sold,
        totalRevenue: result.total_revenue,
        averagePrice: result.avg_price,
      }))
    } catch (error) {
      console.error('Get top products error:', error)
      return []
    }
  }

  async getSalesByPeriod(
    period: 'day' | 'week' | 'month',
    startDate?: string,
    endDate?: string,
  ): Promise<SalesByPeriod[]> {
    try {
      const db = await this.getDatabase()

      let dateFormat = ''
      switch (period) {
        case 'day':
          dateFormat = 'DATE(created_at)'
          break
        case 'week':
          dateFormat = 'strftime("%Y-W%W", created_at)'
          break
        case 'month':
          dateFormat = 'strftime("%Y-%m", created_at)'
          break
      }

      let whereClause = "WHERE status IN ('completed', 'paid')"
      const params: Array<string | number> = []

      if (startDate && endDate) {
        whereClause += ' AND created_at >= ? AND created_at <= ?'
        params.push(startDate, endDate)
      }

      const results = await db.select<
        {
          period: string
          sales: number
          orders: number
          revenue: number
        }[]
      >(
        `
        SELECT 
          ${dateFormat} as period,
          COUNT(*) as sales,
          COUNT(*) as orders,
          COALESCE(SUM(total), 0) as revenue
        FROM orders
        ${whereClause}
        GROUP BY ${dateFormat}
        ORDER BY period DESC
      `,
        params,
      )

      return results.map((result) => ({
        period: result.period,
        sales: result.sales,
        orders: result.orders,
        revenue: result.revenue,
      }))
    } catch (error) {
      console.error('Get sales by period error:', error)
      return []
    }
  }

  async getRecentActivity(limit: number = 10): Promise<RecentActivity[]> {
    try {
      const db = await this.getDatabase()

      const results = await db.select<
        {
          id: number
          status: string
          total: number
          created_at: string
          completed_at: string
          user_id: number
          user_name: string
        }[]
      >(
        `
        SELECT 
          o.id,
          o.status,
          o.total,
          o.created_at,
          o.completed_at,
          COALESCE(o.user_id, 1) as user_id,
          COALESCE(u.name, 'Unknown User') as user_name
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ORDER BY o.updated_at DESC
        LIMIT ?
      `,
        [limit],
      )

      return results.map((result) => {
        let type: 'order_created' | 'order_completed' | 'order_cancelled' = 'order_created'
        let description = `Order #${result.id} created`
        let timestamp = result.created_at

        if (result.status === 'completed' || result.status === 'paid') {
          type = 'order_completed'
          description = `Order #${result.id} completed`
          timestamp = result.completed_at || result.created_at
        } else if (result.status === 'cancelled') {
          type = 'order_cancelled'
          description = `Order #${result.id} cancelled`
        }

        return {
          id: result.id.toString(),
          type,
          description,
          amount: result.total,
          timestamp,
          userName: result.user_name,
        }
      })
    } catch (error) {
      console.error('Get recent activity error:', error)
      return []
    }
  }
}

export const analyticsService = AnalyticsService.getInstance()
