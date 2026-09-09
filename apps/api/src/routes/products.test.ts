import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { execute, query } = vi.hoisted(() => ({
  execute: vi.fn(async () => ({ lastInsertId: 1, rowsAffected: 1 })),
  query: vi.fn(async () => []),
}))

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next()
  },
}))

vi.mock('../lib/turso.js', () => ({
  execute,
  query,
}))

const { productsRouter } = await import('./products.js')

function createApp() {
  const app = new Hono()
  app.route('/api/products', productsRouter)
  return app
}

function dbProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Apple',
    description: null,
    price: 10,
    cost: null,
    stock: 5,
    category: null,
    barcode: null,
    barcode_normalized: null,
    image: null,
    is_active: 1,
    variant_type: null,
    default_variant_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('productsRouter', () => {
  beforeEach(() => {
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 })
  })

  it('lists products with defaults', async () => {
    query.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([dbProduct()])
    const app = createApp()

    const res = await app.request('/api/products')
    const body = (await res.json()) as { products: unknown[]; totalCount: number; page: number; totalPages: number }

    expect(res.status).toBe(200)
    expect(body.totalCount).toBe(1)
    expect(body.page).toBe(1)
    expect(body.totalPages).toBe(1)
    expect(body.products).toHaveLength(1)
  })

  it('searches by name, barcode, and normalized barcode with paging', async () => {
    query.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([])
    const app = createApp()

    const res = await app.request('/api/products?search=%20%20750%20%20&category=food&page=2&limit=10')

    expect(res.status).toBe(200)
    const productsCall = query.mock.calls.find((call) => String(call[0]).includes('ORDER BY')) as unknown as [string, unknown[]]
    expect(productsCall[1]).toContain('750')
    expect(productsCall[1]).toContain('food')
    expect(productsCall[1].slice(-2)).toEqual([10, 10])
  })

  it('strips control whitespace from barcode searches and clamps paging', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const app = createApp()

    const res = await app.request('/api/products?search=%0A%09%20&page=0&limit=500')

    expect(res.status).toBe(200)
    const body = (await res.json()) as { totalCount: number }
    expect(body.totalCount).toBe(0)
    const productsCall = query.mock.calls.find((call) => String(call[0]).includes('ORDER BY')) as unknown as [string, unknown[]]
    expect(productsCall[1].slice(-2)).toEqual([100, 0])
  })

  it('gets a single product or 404', async () => {
    query.mockResolvedValueOnce([dbProduct({ id: 7 })])
    const app = createApp()

    const found = await app.request('/api/products/7')
    expect(found.status).toBe(200)
    expect(((await found.json()) as { product: { id: string } }).product.id).toBe('7')

    query.mockResolvedValueOnce([])
    const missing = await app.request('/api/products/8')
    expect(missing.status).toBe(404)
  })

  it('creates products without a barcode', async () => {
    query.mockResolvedValueOnce([dbProduct({ id: 1, name: 'Kiwi' })])
    const app = createApp()

    const res = await app.request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Kiwi', price: 3 }),
    })

    expect(res.status).toBe(201)
    expect(query).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledTimes(1)
    const params = execute.mock.calls[0][1] as unknown[]
    expect(params.slice(1, 6)).toEqual([null, 3, null, 0, null])
  })

  it('creates products with every field and formats barcodes', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([dbProduct({ id: 2 })])
    const app = createApp()

    const res = await app.request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Full',
        description: 'desc',
        price: 4,
        cost: 2,
        stock: 7,
        category: 'food',
        barcode: '\n 755\t ',
        image: 'img.png',
      }),
    })

    expect(res.status).toBe(201)
    const params = execute.mock.calls[0][1] as unknown[]
    expect(params.slice(0, 9)).toEqual(['Full', 'desc', 4, 2, 7, 'food', '755', '755', 'img.png'])
  })

  it('treats whitespace-only barcodes as missing', async () => {
    query.mockResolvedValueOnce([dbProduct({ id: 3 })])
    const app = createApp()

    const res = await app.request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'NoBar', price: 1, barcode: '   ' }),
    })

    expect(res.status).toBe(201)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('maps inactive rows to isActive false', async () => {
    query.mockResolvedValueOnce([dbProduct({ id: 4, is_active: 0 })])
    const app = createApp()

    const res = await app.request('/api/products/4')
    const body = (await res.json()) as { product: { isActive: boolean } }

    expect(body.product.isActive).toBe(false)
  })

  it('rejects barcodes already used by products or variants', async () => {
    const app = createApp()

    query.mockResolvedValueOnce([{ id: 2 }])
    const productConflict = await app.request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'A', price: 1, barcode: ' 750 ' }),
    })
    expect(productConflict.status).toBe(409)

    query.mockReset()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 9 }])
    const variantConflict = await app.request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'B', price: 1, barcode: '751' }),
    })
    expect(variantConflict.status).toBe(409)
  })

  it('creates products with a free barcode', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([dbProduct({ barcode: '752' })])
    const app = createApp()

    const res = await app.request('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'C', price: 1, barcode: ' 752 ' }),
    })

    expect(res.status).toBe(201)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('updates products and rejects conflicting barcodes', async () => {
    const app = createApp()

    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([dbProduct({ id: 3 })])
    const updated = await app.request('/api/products/3', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New',
        description: 'desc',
        price: 2,
        cost: 1,
        stock: 9,
        category: 'food',
        barcode: '753',
        image: 'img.png',
      }),
    })
    expect(updated.status).toBe(200)
    expect((execute.mock.calls[0][1] as unknown[]).slice(0, 9)).toEqual([
      'New',
      'desc',
      2,
      1,
      9,
      'food',
      '753',
      '753',
      'img.png',
    ])

    query.mockReset()
    query.mockResolvedValueOnce([{ id: 4 }])
    const conflict = await app.request('/api/products/3', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New', price: 2, barcode: '754' }),
    })
    expect(conflict.status).toBe(409)

    query.mockReset()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const missing = await app.request('/api/products/3', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New', price: 2 }),
    })
    expect(missing.status).toBe(404)
  })

  it('soft-deletes products or 404s', async () => {
    const app = createApp()

    const deleted = await app.request('/api/products/5', { method: 'DELETE' })
    expect(deleted.status).toBe(200)

    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })
    const missing = await app.request('/api/products/6', { method: 'DELETE' })
    expect(missing.status).toBe(404)
  })
})
