/**
 * Customers routes (protected)
 *
 * GET    /api/customers           — list customers (paginated, searchable)
 * GET    /api/customers/:id       — get single customer
 * POST   /api/customers           — create customer
 * PUT    /api/customers/:id       — update customer
 * DELETE /api/customers/:id       — soft-delete customer
 */

import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { execute, query } from '../lib/turso.js'

interface DatabaseCustomer {
  id: number
  customer_number: string
  first_name: string
  last_name: string
  company_name: string | null
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  country: string | null
  customer_type: string | null
  customer_segment: string | null
  loyalty_points: number
  total_purchases: number
  total_orders: number
  is_active: number
  notes: string | null
  tags: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export const customersRouter = new Hono()

customersRouter.use('/*', authMiddleware)

// GET /api/customers
customersRouter.get('/', async (c) => {
  const search = c.req.query('search') ?? ''
  const page = Math.max(1, Number(c.req.query('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '20')))
  const offset = (page - 1) * limit

  let sql = 'SELECT * FROM customers WHERE deleted_at IS NULL AND is_active = 1'
  const params: unknown[] = []

  if (search) {
    sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR customer_number LIKE ?)'
    const s = `%${search}%`
    params.push(s, s, s, s, s)
  }

  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count')
  const [countResult, customers] = await Promise.all([
    query<{ count: number }>(countSql, params),
    query<DatabaseCustomer>(`${sql} ORDER BY first_name ASC, last_name ASC LIMIT ? OFFSET ?`, [...params, limit, offset]),
  ])

  const totalCount = countResult[0]?.count ?? 0

  return c.json({
    customers: customers.map(toCustomer),
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / limit),
  })
})

// GET /api/customers/:id
customersRouter.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const rows = await query<DatabaseCustomer>('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL LIMIT 1', [id])
  if (rows.length === 0) return c.json({ error: 'Customer not found' }, 404)
  return c.json({ customer: toCustomer(rows[0]) })
})

// POST /api/customers
customersRouter.post('/', async (c) => {
  const body = await c.req.json<Partial<DatabaseCustomer>>()
  const now = new Date().toISOString()

  // Auto-generate customer number
  const maxRows = await query<{ max_number: string | null }>('SELECT MAX(customer_number) as max_number FROM customers')
  const lastNum = Number(maxRows[0]?.max_number?.replace('C', '') ?? '0')
  const customerNumber = `C${String(lastNum + 1).padStart(5, '0')}`

  const result = await execute(
    `INSERT INTO customers (customer_number, first_name, last_name, company_name, email, phone, city, state, country,
      customer_type, customer_segment, loyalty_points, total_purchases, total_orders, is_active, notes, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1, ?, ?, ?, ?)`,
    [customerNumber, body.first_name, body.last_name, body.company_name ?? null, body.email ?? null, body.phone ?? null, body.city ?? null, body.state ?? null, body.country ?? null, body.customer_type ?? null, body.customer_segment ?? null, body.notes ?? null, body.tags ?? null, now, now],
  )

  const rows = await query<DatabaseCustomer>('SELECT * FROM customers WHERE id = ? LIMIT 1', [result.lastInsertId])
  return c.json({ customer: toCustomer(rows[0]) }, 201)
})

// PUT /api/customers/:id
customersRouter.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<Partial<DatabaseCustomer>>()
  const now = new Date().toISOString()

  await execute(
    `UPDATE customers SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name),
     company_name = COALESCE(?, company_name), email = COALESCE(?, email), phone = COALESCE(?, phone),
     city = COALESCE(?, city), state = COALESCE(?, state), country = COALESCE(?, country),
     notes = COALESCE(?, notes), tags = COALESCE(?, tags), updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
    [body.first_name ?? null, body.last_name ?? null, body.company_name ?? null, body.email ?? null, body.phone ?? null, body.city ?? null, body.state ?? null, body.country ?? null, body.notes ?? null, body.tags ?? null, now, id],
  )

  const rows = await query<DatabaseCustomer>('SELECT * FROM customers WHERE id = ? LIMIT 1', [id])
  if (rows.length === 0) return c.json({ error: 'Customer not found' }, 404)
  return c.json({ customer: toCustomer(rows[0]) })
})

// DELETE /api/customers/:id (soft delete)
customersRouter.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const now = new Date().toISOString()
  const result = await execute('UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [now, now, id])
  if (result.rowsAffected === 0) return c.json({ error: 'Customer not found' }, 404)
  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toCustomer(c: DatabaseCustomer) {
  return {
    id: c.id.toString(),
    customerNumber: c.customer_number,
    firstName: c.first_name,
    lastName: c.last_name,
    companyName: c.company_name,
    email: c.email,
    phone: c.phone,
    city: c.city,
    state: c.state,
    country: c.country,
    customerType: c.customer_type,
    customerSegment: c.customer_segment,
    loyaltyPoints: c.loyalty_points,
    totalPurchases: c.total_purchases,
    totalOrders: c.total_orders,
    isActive: c.is_active === 1,
    notes: c.notes,
    tags: c.tags,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }
}
