/**
 * Products routes (protected)
 *
 * GET    /api/products           — list products (with optional search/category/page)
 * GET    /api/products/:id       — get single product
 * POST   /api/products           — create product
 * PUT    /api/products/:id       — update product
 * DELETE /api/products/:id       — soft-delete product
 */

import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { execute, query } from '../lib/turso.js'

interface DatabaseProduct {
  id: number
  name: string
  description: string | null
  price: number
  cost: number | null
  stock: number
  category: string | null
  barcode: string | null
  barcode_normalized: string | null
  image: string | null
  is_active: number
  variant_type: string | null
  default_variant_id: number | null
  created_at: string
  updated_at: string
}

export const productsRouter = new Hono()

productsRouter.use('/*', authMiddleware)

function normalizeBarcode(barcode?: string | null): string | null {
  if (!barcode) return null

  const normalized = barcode
    .trim()
    .replace(/[\r\n\t]+/g, '')
    .replace(/\s+/g, '')

  return normalized.length > 0 ? normalized : null
}

function formatBarcodeForStorage(barcode?: string | null): string | null {
  const formatted = barcode?.trim()
  return formatted && formatted.length > 0 ? formatted : null
}

async function isBarcodeInUse(normalizedBarcode: string, excludeProductId?: number): Promise<boolean> {
  const productConflicts = await query<{ id: number }>(
    `SELECT id FROM products
     WHERE barcode_normalized = ?
       AND (? IS NULL OR id != ?)
     LIMIT 1`,
    [normalizedBarcode, excludeProductId ?? null, excludeProductId ?? null],
  )

  if (productConflicts.length > 0) {
    return true
  }

  const variantConflicts = await query<{ id: number }>(
    'SELECT id FROM product_variants WHERE barcode_normalized = ? LIMIT 1',
    [normalizedBarcode],
  )

  return variantConflicts.length > 0
}

// GET /api/products
productsRouter.get('/', async (c) => {
  const search = c.req.query('search') ?? ''
  const category = c.req.query('category') ?? ''
  const normalizedBarcode = normalizeBarcode(search)
  const page = Math.max(1, Number(c.req.query('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '50')))
  const offset = (page - 1) * limit

  let sql = 'SELECT * FROM products WHERE is_active = 1'
  const params: unknown[] = []

  if (search) {
    sql += ' AND (name LIKE ? OR barcode LIKE ? OR (? IS NOT NULL AND barcode_normalized = ?))'
    params.push(`%${search}%`, `%${search}%`, normalizedBarcode, normalizedBarcode)
  }

  if (category) {
    sql += ' AND category = ?'
    params.push(category)
  }

  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count')
  const [countResult, products] = await Promise.all([
    query<{ count: number }>(countSql, params),
    query<DatabaseProduct>(`${sql} ORDER BY name ASC LIMIT ? OFFSET ?`, [...params, limit, offset]),
  ])

  const totalCount = countResult[0]?.count ?? 0

  return c.json({
    products: products.map(toProduct),
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / limit),
  })
})

// GET /api/products/:id
productsRouter.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const rows = await query<DatabaseProduct>('SELECT * FROM products WHERE id = ? LIMIT 1', [id])
  if (rows.length === 0) return c.json({ error: 'Product not found' }, 404)
  return c.json({ product: toProduct(rows[0]) })
})

// POST /api/products
productsRouter.post('/', async (c) => {
  const body = await c.req.json<Partial<DatabaseProduct>>()
  const now = new Date().toISOString()
  const barcode = formatBarcodeForStorage(body.barcode)
  const barcodeNormalized = normalizeBarcode(barcode)

  if (barcodeNormalized && (await isBarcodeInUse(barcodeNormalized))) {
    return c.json({ error: 'Barcode is already assigned to another product or variant' }, 409)
  }

  const result = await execute(
    `INSERT INTO products (name, description, price, cost, stock, category, barcode, barcode_normalized, image, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      body.name,
      body.description ?? null,
      body.price,
      body.cost ?? null,
      body.stock ?? 0,
      body.category ?? null,
      barcode,
      barcodeNormalized,
      body.image ?? null,
      now,
      now,
    ],
  )

  const rows = await query<DatabaseProduct>('SELECT * FROM products WHERE id = ? LIMIT 1', [result.lastInsertId])
  return c.json({ product: toProduct(rows[0]) }, 201)
})

// PUT /api/products/:id
productsRouter.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<Partial<DatabaseProduct>>()
  const now = new Date().toISOString()
  const barcode = formatBarcodeForStorage(body.barcode)
  const barcodeNormalized = normalizeBarcode(barcode)

  if (barcodeNormalized && (await isBarcodeInUse(barcodeNormalized, id))) {
    return c.json({ error: 'Barcode is already assigned to another product or variant' }, 409)
  }

  await execute(
    `UPDATE products SET name = ?, description = ?, price = ?, cost = ?, stock = ?,
     category = ?, barcode = ?, barcode_normalized = ?, image = ?, updated_at = ? WHERE id = ?`,
    [
      body.name,
      body.description ?? null,
      body.price,
      body.cost ?? null,
      body.stock ?? 0,
      body.category ?? null,
      barcode,
      barcodeNormalized,
      body.image ?? null,
      now,
      id,
    ],
  )

  const rows = await query<DatabaseProduct>('SELECT * FROM products WHERE id = ? LIMIT 1', [id])
  if (rows.length === 0) return c.json({ error: 'Product not found' }, 404)
  return c.json({ product: toProduct(rows[0]) })
})

// DELETE /api/products/:id (soft delete)
productsRouter.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const now = new Date().toISOString()
  const result = await execute('UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?', [now, id])
  if (result.rowsAffected === 0) return c.json({ error: 'Product not found' }, 404)
  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toProduct(p: DatabaseProduct) {
  return {
    id: p.id.toString(),
    name: p.name,
    description: p.description,
    price: p.price,
    cost: p.cost,
    stock: p.stock,
    category: p.category,
    barcode: p.barcode,
    image: p.image,
    isActive: p.is_active === 1,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }
}
