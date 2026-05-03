import Database from '../lib/local-database'
import {
  type DashboardStats,
  invalidateDashboardStatsCache as invalidateDashboardStatsCacheEntry,
  loadDashboardStats,
} from './dashboard-stats'
import { orderService } from './orders-sqlite'
import { productService } from './products-sqlite'

export type { DashboardStats } from './dashboard-stats'

export interface SalesData {
  date: string
  amount: number
}

export interface TopProduct {
  id: string
  name: string
  sales: number
  revenue: number
}

export interface InventoryStatus {
  totalProducts: number
  outOfStock: number
  lowStock: number
  inStock: number
}

interface GetDashboardStatsOptions {
  referenceDate?: Date
}

export class DashboardService {
  private static instance: DashboardService

  static getInstance(): DashboardService {
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService()
    }
    return DashboardService.instance
  }

  invalidateDashboardStatsCache(): void {
    invalidateDashboardStatsCacheEntry('sqlite')
  }

  async getDashboardStats(options: GetDashboardStatsOptions = {}): Promise<DashboardStats> {
    try {
      const db = await Database.load('sqlite:postpos.db')

      return await loadDashboardStats('sqlite', (sql, params = []) => db.select(sql, params), {
        referenceDate: options.referenceDate,
      })
    } catch (error) {
      console.error('Dashboard stats error:', error)
      throw new Error('Failed to fetch dashboard statistics')
    }
  }

  async getSalesData(days: number = 7): Promise<SalesData[]> {
    try {
      const orders = await orderService.getOrders()
      const completedOrders = orders.filter((o) => o.status === 'completed' || o.status === 'paid')

      // Generate sales data for the specified number of days
      const salesData: SalesData[] = []
      const today = new Date()

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString()
        const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString()

        const dailySales = completedOrders
          .filter((order) => order.createdAt >= dayStart && order.createdAt < dayEnd)
          .reduce((sum, order) => sum + order.total, 0)

        salesData.push({
          date: date.toISOString().split('T')[0],
          amount: dailySales,
        })
      }

      return salesData
    } catch (error) {
      console.error('Sales data error:', error)
      throw new Error('Failed to fetch sales data')
    }
  }

  async getTopProducts(limit: number = 5): Promise<TopProduct[]> {
    try {
      // Use the orderService's getTopSellingProducts method for better performance
      const topProducts = await orderService.getTopSellingProducts(limit)

      return topProducts.map((product) => ({
        id: product.productId,
        name: product.productName,
        sales: product.totalSold,
        revenue: product.totalRevenue,
      }))
    } catch (error) {
      console.error('Top products error:', error)
      throw new Error('Failed to fetch top products')
    }
  }

  async getRecentOrders(limit: number = 5) {
    try {
      const orders = await orderService.getOrders()
      return orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit)
    } catch (error) {
      console.error('Recent orders error:', error)
      throw new Error('Failed to fetch recent orders')
    }
  }

  async getInventoryStatus(): Promise<InventoryStatus> {
    try {
      const products = await productService.getProducts()
      const activeProducts = products.filter((p) => p.isActive)

      return {
        totalProducts: activeProducts.length,
        outOfStock: activeProducts.filter((p) => p.stock === 0).length,
        lowStock: activeProducts.filter((p) => p.stock > 0 && p.stock < 10).length,
        inStock: activeProducts.filter((p) => p.stock >= 10).length,
      }
    } catch (error) {
      console.error('Inventory status error:', error)
      throw new Error('Failed to fetch inventory status')
    }
  }

  async getSalesDataByDateRange(startDate: string, endDate: string): Promise<SalesData[]> {
    try {
      const orders = await orderService.getOrdersByDateRange(startDate, endDate)
      const completedOrders = orders.filter((o) => o.status === 'completed' || o.status === 'paid')

      // Group orders by date
      const salesByDate = new Map<string, number>()

      completedOrders.forEach((order) => {
        const date = order.createdAt.split('T')[0]
        const currentAmount = salesByDate.get(date) || 0
        salesByDate.set(date, currentAmount + order.total)
      })

      // Convert to array and sort by date
      const salesData: SalesData[] = Array.from(salesByDate.entries())
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date))

      return salesData
    } catch (error) {
      console.error('Sales data by date range error:', error)
      throw new Error('Failed to fetch sales data for date range')
    }
  }

  async getTotalSalesAmount(): Promise<number> {
    try {
      return await orderService.getTotalSales()
    } catch (error) {
      console.error('Total sales amount error:', error)
      throw new Error('Failed to fetch total sales amount')
    }
  }

  async getOrderStatusBreakdown() {
    try {
      const [pending, paid, completed, cancelled] = await Promise.all([
        orderService.getOrdersByStatus('pending'),
        orderService.getOrdersByStatus('paid'),
        orderService.getOrdersByStatus('completed'),
        orderService.getOrdersByStatus('cancelled'),
      ])

      return {
        pending: pending.length,
        paid: paid.length,
        completed: completed.length,
        cancelled: cancelled.length,
        total: pending.length + paid.length + completed.length + cancelled.length,
      }
    } catch (error) {
      console.error('Order status breakdown error:', error)
      throw new Error('Failed to fetch order status breakdown')
    }
  }
}

export const dashboardService = DashboardService.getInstance()
