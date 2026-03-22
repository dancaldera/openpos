/**
 * Orders routes (protected)
 *
 * GET    /api/orders           — list orders (paginated, filterable)
 * GET    /api/orders/:id       — get single order with items
 * POST   /api/orders           — create order
 * PUT    /api/orders/:id       — update order status
 * DELETE /api/orders/:id       — cancel/delete order
 */

import { Hono } from 'hono'
import { authMiddleware, type JwtPayload } from '../middleware/auth.js'
import { execute, query } from '../lib/turso.js'

interface DatabaseOrder {
  id: number
  subtotal: number
  tax: number
  total: number
  status: string
  payment_method: string | null
  notes: string | null
  completed_at: string | null
  user_id: number | null
  customer_id: number | null
  created_at: string
  updated_at: string
}

interface DatabaseOrderItem {
  id: number
  order_id: number
  product_id: number
  product_name: string
  quantity: number
  unit_price: number
  total_price: number
  variant_id: number | null
  variant_attributes: string | null
  created_at?: string | null
  updated_at?: string | null
}

export const ordersRouter = new Hono()

ordersRouter.use('/*', authMiddleware)

// GET /api/orders
ordersRouter.get('/', async (c) => {
  const page = Math.max(1, Number(c.req.query('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '20')))
  const offset = (page - 1) * limit
  const status = c.req.query('status') ?? ''

  let sql = 'SELECT * FROM orders WHERE 1=1'
  const params: unknown[] = []

  if (status) {
    sql += ' AND status = ?'
    params.push(status)
  }

  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count')
  const [countResult, orders] = await Promise.all([
    query<{ count: number }>(countSql, params),
    query<DatabaseOrder>(`${sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
  ])

  const totalCount = countResult[0]?.count ?? 0

  return c.json({
    orders: orders.map(toOrder),
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / limit),
  })
})

// GET /api/orders/:id
ordersRouter.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [orders, items] = await Promise.all([
    query<DatabaseOrder>('SELECT * FROM orders WHERE id = ? LIMIT 1', [id]),
    query<DatabaseOrderItem>('SELECT * FROM order_items WHERE order_id = ?', [id]),
  ])

  if (orders.length === 0) return c.json({ error: 'Order not found' }, 404)

  return c.json({
    order: {
      ...toOrder(orders[0]),
      items: items.map(toOrderItem),
    },
  })
})

// POST /api/orders
ordersRouter.post('/', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const jwtPayload = (c as any).get('jwtPayload') as JwtPayload
  const body = await c.req.json<{
    items: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; variantId?: string; variantAttributes?: string }>
    subtotal: number
    tax: number
    total: number
    paymentMethod?: string
    notes?: string
    customerId?: string
  }>()

  const now = new Date().toISOString()

  const result = await execute(
    `INSERT INTO orders (subtotal, tax, total, status, payment_method, notes, user_id, customer_id, created_at, updated_at)
     VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?)`,
    [body.subtotal, body.tax, body.total, body.paymentMethod ?? null, body.notes ?? null, jwtPayload.sub ? Number(jwtPayload.sub) : null, body.customerId ? Number(body.customerId) : null, now, now],
  )

  const orderId = result.lastInsertId

  for (const item of body.items) {
    await execute(
      `INSERT INTO order_items (
         order_id, product_id, product_name, quantity, unit_price, total_price,
         variant_id, variant_attributes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        Number(item.productId),
        item.productName,
        item.quantity,
        item.unitPrice,
        item.quantity * item.unitPrice,
        item.variantId ? Number(item.variantId) : null,
        item.variantAttributes ?? null,
        now,
        now,
      ],
    )
  }

  const [orders, items] = await Promise.all([
    query<DatabaseOrder>('SELECT * FROM orders WHERE id = ? LIMIT 1', [orderId]),
    query<DatabaseOrderItem>('SELECT * FROM order_items WHERE order_id = ?', [orderId]),
  ])

  return c.json({ order: { ...toOrder(orders[0]), items: items.map(toOrderItem) } }, 201)
})

// PUT /api/orders/:id
ordersRouter.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<Partial<{ status: string; notes: string; paymentMethod: string }>>()
  const now = new Date().toISOString()

  await execute(
    'UPDATE orders SET status = COALESCE(?, status), notes = COALESCE(?, notes), payment_method = COALESCE(?, payment_method), updated_at = ? WHERE id = ?',
    [body.status ?? null, body.notes ?? null, body.paymentMethod ?? null, now, id],
  )

  const rows = await query<DatabaseOrder>('SELECT * FROM orders WHERE id = ? LIMIT 1', [id])
  if (rows.length === 0) return c.json({ error: 'Order not found' }, 404)
  return c.json({ order: toOrder(rows[0]) })
})

// DELETE /api/orders/:id
ordersRouter.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const now = new Date().toISOString()
  const result = await execute("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?", [now, id])
  if (result.rowsAffected === 0) return c.json({ error: 'Order not found' }, 404)
  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toOrder(o: DatabaseOrder) {
  return {
    id: o.id.toString(),
    subtotal: o.subtotal,
    tax: o.tax,
    total: o.total,
    status: o.status,
    paymentMethod: o.payment_method,
    notes: o.notes,
    completedAt: o.completed_at,
    userId: o.user_id?.toString() ?? null,
    customerId: o.customer_id?.toString() ?? null,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  }
}

function toOrderItem(i: DatabaseOrderItem) {
  return {
    id: i.id.toString(),
    orderId: i.order_id.toString(),
    productId: i.product_id.toString(),
    productName: i.product_name,
    quantity: i.quantity,
    unitPrice: i.unit_price,
    totalPrice: i.total_price,
    variantId: i.variant_id?.toString() ?? null,
    variantAttributes: i.variant_attributes,
  }
}
