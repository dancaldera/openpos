import Database from '@tauri-apps/plugin-sql'
import { companySettingsService } from './company-settings-sqlite'
import { productService } from './products-sqlite'

export interface OrderItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export interface Order {
  id: string
  userId?: string
  items: OrderItem[]
  subtotal: number
  tax: number
  total: number
  status: 'pending' | 'paid' | 'cancelled' | 'completed'
  paymentMethod?: 'cash' | 'card' | 'transfer'
  notes?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface CreateOrderRequest {
  items: Array<{
    productId: string
    quantity: number
  }>
  paymentMethod?: 'cash' | 'card' | 'transfer'
  notes?: string
}

export interface UpdateOrderRequest {
  items: Array<{
    productId: string
    quantity: number
  }>
  paymentMethod?: 'cash' | 'card' | 'transfer'
  notes?: string
}

interface DatabaseOrder {
  id: number
  user_id?: number
  subtotal: number
  tax: number
  total: number
  status: 'pending' | 'paid' | 'cancelled' | 'completed'
  payment_method?: 'cash' | 'card' | 'transfer'
  notes?: string
  created_at: string
  updated_at: string
  completed_at?: string
}

interface DatabaseOrderItem {
  id: number
  order_id: number
  product_id: number
  product_name: string
  quantity: number
  unit_price: number
  total_price: number
}

export class OrderService {
  private static instance: OrderService
  private db: Database | null = null

  static getInstance(): OrderService {
    if (!OrderService.instance) {
      OrderService.instance = new OrderService()
    }
    return OrderService.instance
  }

  private async getDatabase(): Promise<Database> {
    if (!this.db) {
      this.db = await Database.load('sqlite:postpos.db')
    }
    return this.db
  }

  private async convertDbOrder(dbOrder: DatabaseOrder): Promise<Order> {
    const db = await this.getDatabase()

    // Get order items
    const orderItems = await db.select<DatabaseOrderItem[]>('SELECT * FROM order_items WHERE order_id = ?', [
      dbOrder.id,
    ])

    const items: OrderItem[] = orderItems.map((item) => ({
      productId: item.product_id.toString(),
      productName: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      totalPrice: item.total_price,
    }))

    return {
      id: dbOrder.id.toString(),
      userId: dbOrder.user_id?.toString(),
      items,
      subtotal: dbOrder.subtotal,
      tax: dbOrder.tax,
      total: dbOrder.total,
      status: dbOrder.status,
      paymentMethod: dbOrder.payment_method,
      notes: dbOrder.notes,
      createdAt: dbOrder.created_at,
      updatedAt: dbOrder.updated_at,
      completedAt: dbOrder.completed_at,
    }
  }

  async getOrders(): Promise<Order[]> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const orders = await db.select<DatabaseOrder[]>('SELECT * FROM orders ORDER BY created_at DESC')

      const convertedOrders = []
      for (const order of orders) {
        convertedOrders.push(await this.convertDbOrder(order))
      }

      return convertedOrders
    } catch (error) {
      console.error('Get orders error:', error)
      throw new Error('Failed to fetch orders')
    }
  }

  async getOrdersPaginated(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    orders: Order[]
    totalCount: number
    totalPages: number
    currentPage: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const offset = (page - 1) * limit

      // Get total count
      const countResult = await db.select<{ count: number }[]>('SELECT COUNT(*) as count FROM orders')
      const totalCount = countResult[0]?.count || 0
      const totalPages = Math.ceil(totalCount / limit)

      // Get paginated orders
      const orders = await db.select<DatabaseOrder[]>(
        'SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [limit, offset],
      )

      const convertedOrders = []
      for (const order of orders) {
        convertedOrders.push(await this.convertDbOrder(order))
      }

      return {
        orders: convertedOrders,
        totalCount,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    } catch (error) {
      console.error('Get paginated orders error:', error)
      throw new Error('Failed to fetch paginated orders')
    }
  }

  async getOrder(id: string): Promise<Order | null> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 150))

      const orders = await db.select<DatabaseOrder[]>('SELECT * FROM orders WHERE id = ? LIMIT 1', [parseInt(id, 10)])

      if (orders.length === 0) {
        return null
      }

      return await this.convertDbOrder(orders[0])
    } catch (error) {
      console.error('Get order error:', error)
      throw new Error('Failed to fetch order')
    }
  }

  async createOrder(orderData: CreateOrderRequest): Promise<{ success: boolean; order?: Order; error?: string }> {
    if (!orderData.items.length) {
      return { success: false, error: 'Order must contain at least one item' }
    }

    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 400))

      // Check stock availability first
      const stockCheck = await this.checkStockAvailability(orderData.items)
      if (!stockCheck.success) {
        return { success: false, error: stockCheck.error }
      }

      // Build order items with product details
      const orderItems: OrderItem[] = []
      let subtotal = 0

      for (const item of orderData.items) {
        const product = await productService.getProduct(item.productId)
        if (!product) {
          return {
            success: false,
            error: `Product ${item.productId} not found`,
          }
        }

        const itemTotal = product.price * item.quantity
        orderItems.push({
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: product.price,
          totalPrice: itemTotal,
        })

        subtotal += itemTotal
      }

      // Get tax rate from company settings
      const { tax: taxAmount, total } = await companySettingsService.calculateTotalWithTax(subtotal)
      const now = new Date().toISOString()

      // Create order (with user_id if column exists, without if it doesn't)
      let orderResult: { lastInsertId?: number }
      try {
        // Try with user_id first (for new schema)
        orderResult = await db.execute(
          `INSERT INTO orders (
            user_id, subtotal, tax, total, status, 
            payment_method, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            1, // Default to Admin User (id=1)
            subtotal,
            taxAmount,
            total,
            'pending',
            orderData.paymentMethod || null,
            orderData.notes || null,
            now,
            now,
          ],
        )
      } catch (error: unknown) {
        // If user_id column doesn't exist, fall back to old schema
        const message = error instanceof Error ? error.message : ''
        if (message.includes('no column named user_id')) {
          orderResult = await db.execute(
            `INSERT INTO orders (
              subtotal, tax, total, status, 
              payment_method, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [subtotal, taxAmount, total, 'pending', orderData.paymentMethod || null, orderData.notes || null, now, now],
          )
        } else {
          throw error
        }
      }

      const orderId = orderResult.lastInsertId ?? 0

      // Create order items
      for (const item of orderItems) {
        await db.execute(
          `INSERT INTO order_items (
            order_id, product_id, product_name, quantity, unit_price, total_price
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [orderId, parseInt(item.productId, 10), item.productName, item.quantity, item.unitPrice, item.totalPrice],
        )
      }

      const newOrder: Order = {
        id: orderId.toString(),
        userId: undefined, // Will be set by convertDbOrder if column exists
        items: orderItems,
        subtotal,
        tax: taxAmount,
        total,
        status: 'pending',
        paymentMethod: orderData.paymentMethod,
        notes: orderData.notes,
        createdAt: now,
        updatedAt: now,
      }

      return { success: true, order: newOrder }
    } catch (error) {
      console.error('Create order error:', error)
      return { success: false, error: 'Failed to create order' }
    }
  }

  async updateOrderStatus(
    id: string,
    status: Order['status'],
    paymentMethod?: Order['paymentMethod'],
  ): Promise<{ success: boolean; order?: Order; error?: string }> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Get current order
      const currentOrder = await this.getOrder(id)
      if (!currentOrder) {
        return { success: false, error: 'Order not found' }
      }

      const oldStatus = currentOrder.status
      const now = new Date().toISOString()
      const completedAt = status === 'completed' || status === 'paid' ? now : null

      // Handle stock management based on status change
      if (status === 'completed' || status === 'paid') {
        // Deduct stock when order is completed/paid
        if (oldStatus !== 'completed' && oldStatus !== 'paid') {
          const stockResult = await this.deductStockFromOrder(currentOrder)
          if (!stockResult.success) {
            return { success: false, error: stockResult.error }
          }
        }
      } else if (
        (status === 'cancelled' || status === 'pending') &&
        (oldStatus === 'completed' || oldStatus === 'paid')
      ) {
        // Restore stock if order is cancelled or set back to pending after being completed/paid
        await this.restoreStockFromOrder(currentOrder)
      }

      // Update order status
      await db.execute(
        `UPDATE orders SET 
         status = ?, payment_method = ?, updated_at = ?, completed_at = ? 
         WHERE id = ?`,
        [status, paymentMethod || currentOrder.paymentMethod, now, completedAt, parseInt(id, 10)],
      )

      // Return updated order
      const updatedOrder = await this.getOrder(id)
      return { success: true, order: updatedOrder || undefined }
    } catch (error) {
      console.error('Update order status error:', error)
      return { success: false, error: 'Failed to update order status' }
    }
  }

  async deleteOrder(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 250))

      // Get order before deleting to restore stock if needed
      const order = await this.getOrder(id)
      if (!order) {
        return { success: false, error: 'Order not found' }
      }

      // Restore stock if order was completed/paid
      if (order.status === 'completed' || order.status === 'paid') {
        await this.restoreStockFromOrder(order)
      }

      // Delete order (order_items will be deleted automatically due to CASCADE)
      const result = await db.execute('DELETE FROM orders WHERE id = ?', [parseInt(id, 10)])

      if (result.rowsAffected === 0) {
        return { success: false, error: 'Order not found' }
      }

      return { success: true }
    } catch (error) {
      console.error('Delete order error:', error)
      return { success: false, error: 'Failed to delete order' }
    }
  }

  private async checkStockAvailability(
    items: Array<{ productId: string; quantity: number }>,
  ): Promise<{ success: boolean; error?: string }> {
    for (const item of items) {
      const product = await productService.getProduct(item.productId)
      if (!product) {
        return { success: false, error: `Product ${item.productId} not found` }
      }

      if (!product.isActive) {
        return {
          success: false,
          error: `Product ${product.name} is not active`,
        }
      }

      if (product.stock < item.quantity) {
        return {
          success: false,
          error: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`,
        }
      }
    }
    return { success: true }
  }

  private async deductStockFromOrder(order: Order): Promise<{ success: boolean; error?: string }> {
    for (const item of order.items) {
      const product = await productService.getProduct(item.productId)
      if (!product) {
        return { success: false, error: `Product ${item.productId} not found` }
      }

      if (product.stock < item.quantity) {
        return {
          success: false,
          error: `Insufficient stock for ${product.name}. Available: ${product.stock}, Needed: ${item.quantity}`,
        }
      }

      // Update product stock
      const updateResult = await productService.updateProduct(product.id, {
        stock: product.stock - item.quantity,
        updatedAt: new Date().toISOString(),
      })

      if (!updateResult.success) {
        return {
          success: false,
          error: updateResult.error || 'Failed to update product stock',
        }
      }
    }
    return { success: true }
  }

  private async restoreStockFromOrder(order: Order): Promise<void> {
    for (const item of order.items) {
      const product = await productService.getProduct(item.productId)
      if (product) {
        await productService.updateProduct(product.id, {
          stock: product.stock + item.quantity,
          updatedAt: new Date().toISOString(),
        })
      }
    }
  }

  async getOrdersByStatus(status: Order['status']): Promise<Order[]> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 150))

      const orders = await db.select<DatabaseOrder[]>(
        'SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC',
        [status],
      )

      const convertedOrders = []
      for (const order of orders) {
        convertedOrders.push(await this.convertDbOrder(order))
      }

      return convertedOrders
    } catch (error) {
      console.error('Get orders by status error:', error)
      throw new Error('Failed to fetch orders by status')
    }
  }

  async getTotalSales(): Promise<number> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 100))

      const result = await db.select<{ total_sales: number }[]>(
        `SELECT COALESCE(SUM(total), 0) as total_sales 
         FROM orders 
         WHERE status IN ('completed', 'paid')`,
      )

      return result[0]?.total_sales || 0
    } catch (error) {
      console.error('Get total sales error:', error)
      return 0
    }
  }

  async getOrdersByDateRange(startDate: string, endDate: string): Promise<Order[]> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const orders = await db.select<DatabaseOrder[]>(
        `SELECT * FROM orders 
         WHERE created_at >= ? AND created_at <= ? 
         ORDER BY created_at DESC`,
        [startDate, endDate],
      )

      const convertedOrders = []
      for (const order of orders) {
        convertedOrders.push(await this.convertDbOrder(order))
      }

      return convertedOrders
    } catch (error) {
      console.error('Get orders by date range error:', error)
      throw new Error('Failed to fetch orders by date range')
    }
  }

  async getOrdersByDateFilter(dateFilter: 'today' | 'yesterday' | string): Promise<Order[]> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 200))

      let startDate: string
      let endDate: string
      const now = new Date()

      if (dateFilter === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        startDate = today.toISOString()
        endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      } else if (dateFilter === 'yesterday') {
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
        startDate = yesterday.toISOString()
        endDate = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      } else {
        // Handle specific date (YYYY-MM-DD format)
        const targetDate = new Date(`${dateFilter}T00:00:00.000Z`)
        startDate = targetDate.toISOString()
        endDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      }

      const orders = await db.select<DatabaseOrder[]>(
        `SELECT * FROM orders 
         WHERE created_at >= ? AND created_at <= ? 
         ORDER BY created_at DESC`,
        [startDate, endDate],
      )

      const convertedOrders = []
      for (const order of orders) {
        convertedOrders.push(await this.convertDbOrder(order))
      }

      return convertedOrders
    } catch (error) {
      console.error('Get orders by date filter error:', error)
      throw new Error('Failed to fetch orders by date filter')
    }
  }

  async getOrdersByDateFilterPaginated(
    dateFilter: 'today' | 'yesterday' | string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    orders: Order[]
    totalCount: number
    totalPages: number
    currentPage: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 200))

      let startDate: string
      let endDate: string
      const now = new Date()

      if (dateFilter === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        startDate = today.toISOString()
        endDate = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      } else if (dateFilter === 'yesterday') {
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
        startDate = yesterday.toISOString()
        endDate = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      } else {
        // Handle specific date (YYYY-MM-DD format)
        const targetDate = new Date(`${dateFilter}T00:00:00.000Z`)
        startDate = targetDate.toISOString()
        endDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      }

      const offset = (page - 1) * limit

      // Get total count for the date filter
      const countResult = await db.select<{ count: number }[]>(
        'SELECT COUNT(*) as count FROM orders WHERE created_at >= ? AND created_at <= ?',
        [startDate, endDate],
      )
      const totalCount = countResult[0]?.count || 0
      const totalPages = Math.ceil(totalCount / limit)

      // Get paginated orders with date filter
      const orders = await db.select<DatabaseOrder[]>(
        `SELECT * FROM orders 
         WHERE created_at >= ? AND created_at <= ? 
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [startDate, endDate, limit, offset],
      )

      const convertedOrders = []
      for (const order of orders) {
        convertedOrders.push(await this.convertDbOrder(order))
      }

      return {
        orders: convertedOrders,
        totalCount,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    } catch (error) {
      console.error('Get orders by date filter paginated error:', error)
      throw new Error('Failed to fetch paginated orders by date filter')
    }
  }

  async getTopSellingProducts(limit: number = 10): Promise<
    Array<{
      productId: string
      productName: string
      totalSold: number
      totalRevenue: number
    }>
  > {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 150))

      const results = await db.select<
        {
          product_id: number
          product_name: string
          total_sold: number
          total_revenue: number
        }[]
      >(
        `SELECT 
           oi.product_id,
           oi.product_name,
           SUM(oi.quantity) as total_sold,
           SUM(oi.total_price) as total_revenue
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE o.status IN ('completed', 'paid')
         GROUP BY oi.product_id, oi.product_name
         ORDER BY total_sold DESC
         LIMIT ?`,
        [limit],
      )

      return results.map((r) => ({
        productId: r.product_id.toString(),
        productName: r.product_name,
        totalSold: r.total_sold,
        totalRevenue: r.total_revenue,
      }))
    } catch (error) {
      console.error('Get top selling products error:', error)
      return []
    }
  }

  async updateOrder(
    orderId: string,
    updateData: UpdateOrderRequest,
  ): Promise<{ success: boolean; order?: Order; error?: string }> {
    if (!updateData.items.length) {
      return { success: false, error: 'Order must contain at least one item' }
    }

    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 400))

      // Get current order
      const currentOrder = await this.getOrder(orderId)
      if (!currentOrder) {
        return { success: false, error: 'Order not found' }
      }

      // Only allow editing pending orders
      if (currentOrder.status !== 'pending') {
        return { success: false, error: 'Can only update pending orders' }
      }

      // Check stock availability for the updated items
      const stockCheck = await this.checkStockAvailability(updateData.items)
      if (!stockCheck.success) {
        return { success: false, error: stockCheck.error }
      }

      // Build new order items with product details
      const newOrderItems: OrderItem[] = []
      let newSubtotal = 0

      for (const item of updateData.items) {
        const product = await productService.getProduct(item.productId)
        if (!product) {
          return {
            success: false,
            error: `Product ${item.productId} not found`,
          }
        }

        const itemTotal = product.price * item.quantity
        newOrderItems.push({
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: product.price,
          totalPrice: itemTotal,
        })

        newSubtotal += itemTotal
      }

      // Calculate new tax and total
      const { tax: newTaxAmount, total: newTotal } = await companySettingsService.calculateTotalWithTax(newSubtotal)
      const now = new Date().toISOString()

      // Delete existing order items
      await db.execute('DELETE FROM order_items WHERE order_id = ?', [parseInt(orderId, 10)])

      // Insert new order items
      for (const item of newOrderItems) {
        await db.execute(
          `INSERT INTO order_items (
            order_id, product_id, product_name, quantity, unit_price, total_price
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            parseInt(orderId, 10),
            parseInt(item.productId, 10),
            item.productName,
            item.quantity,
            item.unitPrice,
            item.totalPrice,
          ],
        )
      }

      // Update order totals and details
      await db.execute(
        'UPDATE orders SET subtotal = ?, tax = ?, total = ?, payment_method = ?, notes = ?, updated_at = ? WHERE id = ?',
        [
          newSubtotal,
          newTaxAmount,
          newTotal,
          updateData.paymentMethod || currentOrder.paymentMethod,
          updateData.notes !== undefined ? updateData.notes : currentOrder.notes,
          now,
          parseInt(orderId, 10),
        ],
      )

      // Return updated order
      const updatedOrder = await this.getOrder(orderId)
      return { success: true, order: updatedOrder || undefined }
    } catch (error) {
      console.error('Update order error:', error)
      return { success: false, error: 'Failed to update order' }
    }
  }
}

export const orderService = OrderService.getInstance()
