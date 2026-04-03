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

type CustomerType = 'individual' | 'business'

interface DatabaseCustomer {
  id: number
  customer_number: string
  first_name: string
  last_name: string
  company_name: string | null
  email: string | null
  phone: string | null
  phone_secondary: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  customer_type: CustomerType
  customer_segment: string | null
  credit_limit: number
  current_balance: number
  tax_exempt: number
  tax_id: string | null
  loyalty_points: number
  total_purchases: number
  total_orders: number
  first_purchase_date: string | null
  last_purchase_date: string | null
  is_active: number
  notes: string | null
  tags: string | null
  custom_fields: string | null
  created_at: string
  updated_at: string
  created_by: number | null
  deleted_at: string | null
}

type RequestCustomerBody = Partial<DatabaseCustomer> &
  Record<string, unknown> & {
    firstName?: string
    lastName?: string
    companyName?: string
    phoneSecondary?: string
    addressLine1?: string
    addressLine2?: string
    postalCode?: string
    customerType?: CustomerType
    customerSegment?: string
    creditLimit?: number
    currentBalance?: number
    taxExempt?: boolean
    taxId?: string
    totalPurchases?: number
    totalOrders?: number
    firstPurchaseDate?: string
    lastPurchaseDate?: string
    isActive?: boolean
    customFields?: Record<string, unknown>
    createdBy?: string | number
  }

interface NormalizedCustomerPayload {
  firstName?: string
  lastName?: string
  companyName?: string
  email?: string
  phone?: string
  phoneSecondary?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  customerType?: CustomerType
  customerSegment?: string
  creditLimit?: number
  currentBalance?: number
  taxExempt?: boolean
  taxId?: string
  loyaltyPoints?: number
  totalPurchases?: number
  totalOrders?: number
  firstPurchaseDate?: string
  lastPurchaseDate?: string
  isActive?: boolean
  notes?: string
  tags?: string[]
  customFields?: Record<string, unknown>
  createdBy?: number
}

function hasOwn(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key)
}

function getBodyValue(body: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (hasOwn(body, key)) {
      return body[key]
    }
  }

  return undefined
}

function hasBodyValue(body: Record<string, unknown>, ...keys: string[]) {
  return keys.some((key) => hasOwn(body, key))
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (value === null) {
    return undefined
  }

  return normalizeText(value) || undefined
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') {
      return true
    }

    if (normalized === 'false' || normalized === '0') {
      return false
    }
  }

  return undefined
}

function normalizeCustomerType(value: unknown): CustomerType | undefined {
  return value === 'individual' || value === 'business' ? value : undefined
}

function normalizeTags(value: unknown): string[] | undefined {
  if (value == null) {
    return undefined
  }

  const normalizeEntries = (entries: unknown[]) => {
    const uniqueTags = new Set(
      entries.map((entry) => normalizeText(entry)).filter((entry) => entry.length > 0),
    )

    return uniqueTags.size > 0 ? [...uniqueTags] : undefined
  }

  if (Array.isArray(value)) {
    return normalizeEntries(value)
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return normalizeEntries(parsed)
      }
    } catch {
      return normalizeEntries(value.split(','))
    }
  }

  return undefined
}

function normalizeCustomFields(value: unknown): Record<string, unknown> | undefined {
  if (!value) {
    return undefined
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return undefined
    }
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return undefined
}

function parseJsonArray(value: string | null): string[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function validateCustomerIdentity(customerData: {
  customerType: CustomerType
  firstName?: string
  lastName?: string
  companyName?: string
}) {
  if (customerData.customerType === 'business') {
    if (!normalizeText(customerData.companyName)) {
      return 'Company name is required'
    }

    return null
  }

  if (!normalizeText(customerData.firstName)) {
    return 'First name is required'
  }

  if (!normalizeText(customerData.lastName)) {
    return 'Last name is required'
  }

  return null
}

function validateCustomerEmail(email?: string) {
  if (!email) {
    return null
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) ? null : 'Invalid email format'
}

function normalizeCustomerPayload(body: RequestCustomerBody): NormalizedCustomerPayload {
  return {
    firstName: normalizeOptionalString(getBodyValue(body, 'first_name', 'firstName')),
    lastName: normalizeOptionalString(getBodyValue(body, 'last_name', 'lastName')),
    companyName: normalizeOptionalString(getBodyValue(body, 'company_name', 'companyName')),
    email: normalizeOptionalString(getBodyValue(body, 'email')),
    phone: normalizeOptionalString(getBodyValue(body, 'phone')),
    phoneSecondary: normalizeOptionalString(getBodyValue(body, 'phone_secondary', 'phoneSecondary')),
    addressLine1: normalizeOptionalString(getBodyValue(body, 'address_line1', 'addressLine1')),
    addressLine2: normalizeOptionalString(getBodyValue(body, 'address_line2', 'addressLine2')),
    city: normalizeOptionalString(getBodyValue(body, 'city')),
    state: normalizeOptionalString(getBodyValue(body, 'state')),
    postalCode: normalizeOptionalString(getBodyValue(body, 'postal_code', 'postalCode')),
    country: normalizeOptionalString(getBodyValue(body, 'country')),
    customerType: normalizeCustomerType(getBodyValue(body, 'customer_type', 'customerType')),
    customerSegment: normalizeOptionalString(getBodyValue(body, 'customer_segment', 'customerSegment')),
    creditLimit: normalizeNumber(getBodyValue(body, 'credit_limit', 'creditLimit')),
    currentBalance: normalizeNumber(getBodyValue(body, 'current_balance', 'currentBalance')),
    taxExempt: normalizeBoolean(getBodyValue(body, 'tax_exempt', 'taxExempt')),
    taxId: normalizeOptionalString(getBodyValue(body, 'tax_id', 'taxId')),
    loyaltyPoints: normalizeNumber(getBodyValue(body, 'loyalty_points', 'loyaltyPoints')),
    totalPurchases: normalizeNumber(getBodyValue(body, 'total_purchases', 'totalPurchases')),
    totalOrders: normalizeNumber(getBodyValue(body, 'total_orders', 'totalOrders')),
    firstPurchaseDate: normalizeOptionalString(getBodyValue(body, 'first_purchase_date', 'firstPurchaseDate')),
    lastPurchaseDate: normalizeOptionalString(getBodyValue(body, 'last_purchase_date', 'lastPurchaseDate')),
    isActive: normalizeBoolean(getBodyValue(body, 'is_active', 'isActive')),
    notes: normalizeOptionalString(getBodyValue(body, 'notes')),
    tags: normalizeTags(getBodyValue(body, 'tags')),
    customFields: normalizeCustomFields(getBodyValue(body, 'custom_fields', 'customFields')),
    createdBy: normalizeNumber(getBodyValue(body, 'created_by', 'createdBy')),
  }
}

async function findExistingCustomer(id: number) {
  const rows = await query<DatabaseCustomer>('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL LIMIT 1', [id])
  return rows[0] ?? null
}

async function findCustomerByEmail(email: string, excludeId?: number) {
  const sql =
    excludeId === undefined
      ? 'SELECT id FROM customers WHERE email = ? AND deleted_at IS NULL LIMIT 1'
      : 'SELECT id FROM customers WHERE email = ? AND id != ? AND deleted_at IS NULL LIMIT 1'

  const params = excludeId === undefined ? [email] : [email, excludeId]
  const rows = await query<{ id: number }>(sql, params)
  return rows.length > 0
}

async function generateCustomerNumber() {
  try {
    const result = await query<{ max_number: number }>(
      "SELECT MAX(CAST(SUBSTR(customer_number, 6) AS INTEGER)) as max_number FROM customers WHERE customer_number LIKE 'CUST-%'",
    )

    const maxNumber = result[0]?.max_number || 0
    return `CUST-${(maxNumber + 1).toString().padStart(5, '0')}`
  } catch {
    return `CUST-${Date.now().toString().slice(-5)}`
  }
}

export const customersRouter = new Hono()

customersRouter.use('/*', authMiddleware)

// GET /api/customers
customersRouter.get('/', async (c) => {
  const search = c.req.query('search') ?? ''
  const page = Math.max(1, Number(c.req.query('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '20')))
  const offset = (page - 1) * limit

  let sql = 'SELECT * FROM customers WHERE deleted_at IS NULL'
  const params: unknown[] = []

  if (search) {
    sql += ` AND (LOWER(first_name) LIKE ?
      OR LOWER(last_name) LIKE ?
      OR LOWER(company_name) LIKE ?
      OR LOWER(email) LIKE ?
      OR LOWER(COALESCE(customer_segment, '')) LIKE ?
      OR LOWER(COALESCE(tags, '')) LIKE ?
      OR LOWER(COALESCE(custom_fields, '')) LIKE ?
      OR (phone IS NOT NULL AND phone LIKE ?)
      OR (customer_number IS NOT NULL AND customer_number LIKE ?))`
    const s = `%${search}%`
    params.push(s.toLowerCase(), s.toLowerCase(), s.toLowerCase(), s.toLowerCase(), s.toLowerCase(), s.toLowerCase(), s.toLowerCase(), s, s)
  }

  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count')
  const [countResult, customers] = await Promise.all([
    query<{ count: number }>(countSql, params),
    query<DatabaseCustomer>(`${sql} ORDER BY customer_number DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
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
  const customer = await findExistingCustomer(id)
  if (!customer) return c.json({ error: 'Customer not found' }, 404)
  return c.json({ customer: toCustomer(customer) })
})

// POST /api/customers
customersRouter.post('/', async (c) => {
  const body = await c.req.json<RequestCustomerBody>()
  const normalized = normalizeCustomerPayload(body)
  const customerType = normalized.customerType ?? 'individual'
  const validationError = validateCustomerIdentity({
    customerType,
    firstName: normalized.firstName,
    lastName: normalized.lastName,
    companyName: normalized.companyName,
  })

  if (validationError) {
    return c.json({ error: validationError }, 400)
  }

  const emailError = validateCustomerEmail(normalized.email)
  if (emailError) {
    return c.json({ error: emailError }, 400)
  }

  if (normalized.email && (await findCustomerByEmail(normalized.email))) {
    return c.json({ error: 'Customer with this email already exists' }, 400)
  }

  const now = new Date().toISOString()
  const customerNumber = await generateCustomerNumber()

  const result = await execute(
    `INSERT INTO customers (
      customer_number, first_name, last_name, company_name, email, phone, phone_secondary,
      address_line1, address_line2, city, state, postal_code, country, customer_type,
      customer_segment, credit_limit, current_balance, tax_exempt, tax_id,
      loyalty_points, total_purchases, total_orders, first_purchase_date, last_purchase_date,
      is_active, notes, tags, custom_fields, created_at, updated_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      customerNumber,
      normalized.firstName ?? '',
      normalized.lastName ?? '',
      normalized.companyName ?? null,
      normalized.email ?? null,
      normalized.phone ?? null,
      normalized.phoneSecondary ?? null,
      normalized.addressLine1 ?? null,
      normalized.addressLine2 ?? null,
      normalized.city ?? null,
      normalized.state ?? null,
      normalized.postalCode ?? null,
      normalized.country ?? 'US',
      customerType,
      normalized.customerSegment ?? null,
      normalized.creditLimit ?? 0,
      normalized.currentBalance ?? 0,
      normalized.taxExempt ? 1 : 0,
      normalized.taxId ?? null,
      normalized.loyaltyPoints ?? 0,
      normalized.totalPurchases ?? 0,
      normalized.totalOrders ?? 0,
      normalized.firstPurchaseDate ?? null,
      normalized.lastPurchaseDate ?? null,
      normalized.isActive === false ? 0 : 1,
      normalized.notes ?? null,
      normalized.tags ? JSON.stringify(normalized.tags) : null,
      normalized.customFields ? JSON.stringify(normalized.customFields) : null,
      now,
      now,
      normalized.createdBy ?? null,
    ],
  )

  const rows = await query<DatabaseCustomer>('SELECT * FROM customers WHERE id = ? LIMIT 1', [result.lastInsertId])
  return c.json({ customer: toCustomer(rows[0]) }, 201)
})

// PUT /api/customers/:id
customersRouter.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<RequestCustomerBody>()
  const existingCustomer = await findExistingCustomer(id)

  if (!existingCustomer) {
    return c.json({ error: 'Customer not found' }, 404)
  }

  const normalized = normalizeCustomerPayload(body)
  const customerType = normalized.customerType ?? existingCustomer.customer_type
  const validationError = validateCustomerIdentity({
    customerType,
    firstName: normalized.firstName ?? existingCustomer.first_name,
    lastName: normalized.lastName ?? existingCustomer.last_name,
    companyName: normalized.companyName ?? existingCustomer.company_name ?? undefined,
  })

  if (validationError) {
    return c.json({ error: validationError }, 400)
  }

  const email = normalized.email ?? existingCustomer.email ?? undefined
  const emailError = validateCustomerEmail(email)
  if (emailError) {
    return c.json({ error: emailError }, 400)
  }

  if (normalized.email && (await findCustomerByEmail(normalized.email, id))) {
    return c.json({ error: 'Customer with this email already exists' }, 400)
  }

  const now = new Date().toISOString()
  const updateFields: string[] = []
  const updateValues: unknown[] = []

  const addStringUpdate = (bodyKeys: string[], column: string, value: string | undefined) => {
    if (hasBodyValue(body, ...bodyKeys)) {
      updateFields.push(`${column} = ?`)
      updateValues.push(value ?? null)
    }
  }

  addStringUpdate(['first_name', 'firstName'], 'first_name', normalized.firstName)
  addStringUpdate(['last_name', 'lastName'], 'last_name', normalized.lastName)
  addStringUpdate(['company_name', 'companyName'], 'company_name', normalized.companyName)
  addStringUpdate(['email'], 'email', normalized.email)
  addStringUpdate(['phone'], 'phone', normalized.phone)
  addStringUpdate(['phone_secondary', 'phoneSecondary'], 'phone_secondary', normalized.phoneSecondary)
  addStringUpdate(['address_line1', 'addressLine1'], 'address_line1', normalized.addressLine1)
  addStringUpdate(['address_line2', 'addressLine2'], 'address_line2', normalized.addressLine2)
  addStringUpdate(['city'], 'city', normalized.city)
  addStringUpdate(['state'], 'state', normalized.state)
  addStringUpdate(['postal_code', 'postalCode'], 'postal_code', normalized.postalCode)
  addStringUpdate(['country'], 'country', normalized.country)
  addStringUpdate(['customer_segment', 'customerSegment'], 'customer_segment', normalized.customerSegment)
  addStringUpdate(['tax_id', 'taxId'], 'tax_id', normalized.taxId)
  addStringUpdate(['first_purchase_date', 'firstPurchaseDate'], 'first_purchase_date', normalized.firstPurchaseDate)
  addStringUpdate(['last_purchase_date', 'lastPurchaseDate'], 'last_purchase_date', normalized.lastPurchaseDate)
  addStringUpdate(['notes'], 'notes', normalized.notes)

  if (hasBodyValue(body, 'customer_type', 'customerType')) {
    updateFields.push('customer_type = ?')
    updateValues.push(customerType)
  }

  if (hasBodyValue(body, 'credit_limit', 'creditLimit')) {
    updateFields.push('credit_limit = ?')
    updateValues.push(normalized.creditLimit ?? 0)
  }

  if (hasBodyValue(body, 'current_balance', 'currentBalance')) {
    updateFields.push('current_balance = ?')
    updateValues.push(normalized.currentBalance ?? 0)
  }

  if (hasBodyValue(body, 'tax_exempt', 'taxExempt')) {
    updateFields.push('tax_exempt = ?')
    updateValues.push(normalized.taxExempt ? 1 : 0)
  }

  if (hasBodyValue(body, 'loyalty_points', 'loyaltyPoints')) {
    updateFields.push('loyalty_points = ?')
    updateValues.push(normalized.loyaltyPoints ?? 0)
  }

  if (hasBodyValue(body, 'total_purchases', 'totalPurchases')) {
    updateFields.push('total_purchases = ?')
    updateValues.push(normalized.totalPurchases ?? 0)
  }

  if (hasBodyValue(body, 'total_orders', 'totalOrders')) {
    updateFields.push('total_orders = ?')
    updateValues.push(normalized.totalOrders ?? 0)
  }

  if (hasBodyValue(body, 'is_active', 'isActive')) {
    updateFields.push('is_active = ?')
    updateValues.push(normalized.isActive === false ? 0 : 1)
  }

  if (hasBodyValue(body, 'tags')) {
    updateFields.push('tags = ?')
    updateValues.push(normalized.tags ? JSON.stringify(normalized.tags) : null)
  }

  if (hasBodyValue(body, 'custom_fields', 'customFields')) {
    updateFields.push('custom_fields = ?')
    updateValues.push(normalized.customFields ? JSON.stringify(normalized.customFields) : null)
  }

  if (hasBodyValue(body, 'created_by', 'createdBy')) {
    updateFields.push('created_by = ?')
    updateValues.push(normalized.createdBy ?? null)
  }

  updateFields.push('updated_at = ?')
  updateValues.push(now)
  updateValues.push(id)

  await execute(`UPDATE customers SET ${updateFields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, updateValues)

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
    phoneSecondary: c.phone_secondary,
    addressLine1: c.address_line1,
    addressLine2: c.address_line2,
    city: c.city,
    state: c.state,
    postalCode: c.postal_code,
    country: c.country,
    customerType: c.customer_type,
    customerSegment: c.customer_segment,
    creditLimit: c.credit_limit,
    currentBalance: c.current_balance,
    taxExempt: c.tax_exempt === 1,
    taxId: c.tax_id,
    loyaltyPoints: c.loyalty_points,
    totalPurchases: c.total_purchases,
    totalOrders: c.total_orders,
    firstPurchaseDate: c.first_purchase_date,
    lastPurchaseDate: c.last_purchase_date,
    isActive: c.is_active === 1,
    notes: c.notes,
    tags: parseJsonArray(c.tags),
    customFields: parseJsonObject(c.custom_fields),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    createdBy: c.created_by?.toString(),
    deletedAt: c.deleted_at,
  }
}
