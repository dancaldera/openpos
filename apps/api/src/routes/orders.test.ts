import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { execute, query, mockJwtPayload } = vi.hoisted(() => ({
  execute: vi.fn(async () => ({ lastInsertId: 1, rowsAffected: 1 })),
  query: vi.fn(async () => []),
  mockJwtPayload: { value: { sub: '3' } as { sub?: string } },
}))

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('jwtPayload', mockJwtPayload.value)
    await next()
  },
}))

vi.mock('../lib/turso.js', () => ({
  execute,
  query,
}))

const { ordersRouter } = await import('./orders.js')

function createApp() {
  const app = new Hono()
  app.route('/api/orders', ordersRouter)
  return app
}

function dbOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    subtotal: 100,
    tax: 16,
    total: 116,
    status: 'completed',
    payment_method: 'cash',
    notes: null,
    completed_at: null,
    user_id: 3,
    customer_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function dbItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    order_id: 1,
    product_id: 5,
    product_name: 'Apple',
    quantity: 2,
    unit_price: 50,
    total_price: 100,
    variant_id: null,
    variant_attributes: null,
    ...overrides,
  }
}

describe('ordersRouter', () => {
  beforeEach(() => {
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 })
    mockJwtPayload.value = { sub: '3' }
  })

  it('lists orders with defaults', async () => {
    query.mockResolvedValueOnce([{ count: 2 }]).mockResolvedValueOnce([dbOrder(), dbOrder({ id: 2, user_id: null, customer_id: 7 })])
    const app = createApp()

    const res = await app.request('/api/orders')
    const body = (await res.json()) as { orders: Array<{ id: string; userId: string | null; customerId: string | null }>; totalCount: number }

    expect(res.status).toBe(200)
    expect(body.totalCount).toBe(2)
    expect(body.orders[0]).toMatchObject({ id: '1', userId: '3', customerId: null })
    expect(body.orders[1]).toMatchObject({ id: '2', userId: null, customerId: '7' })
  })

  it('filters by status with paging and empty counts', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const app = createApp()

    const res = await app.request('/api/orders?status=pending&page=3&limit=10')
    const body = (await res.json()) as { totalCount: number; page: number; totalPages: number }

    expect(res.status).toBe(200)
    expect(body).toEqual({ orders: [], totalCount: 0, page: 3, totalPages: 0 })
    const listCall = query.mock.calls.find((call) => String(call[0]).includes('ORDER BY')) as unknown as [string, unknown[]]
    expect(listCall[0]).toContain('status = ?')
    expect(listCall[1]).toEqual(['pending', 10, 20])
  })

  it('gets an order with items or 404s', async () => {
    query.mockResolvedValueOnce([dbOrder()]).mockResolvedValueOnce([dbItem(), dbItem({ id: 2, variant_id: 9, variant_attributes: 'red' })])
    const app = createApp()

    const found = await app.request('/api/orders/1')
    expect(found.status).toBe(200)
    const body = (await found.json()) as { order: { items: Array<{ variantId: string | null }> } }
    expect(body.order.items).toHaveLength(2)
    expect(body.order.items[0].variantId).toBeNull()
    expect(body.order.items[1].variantId).toBe('9')

    query.mockReset()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const missing = await app.request('/api/orders/2')
    expect(missing.status).toBe(404)
  })

  it('creates orders with items, variants, and customer', async () => {
    query.mockResolvedValueOnce([dbOrder()]).mockResolvedValueOnce([dbItem()])
    const app = createApp()

    const res = await app.request('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { productId: '5', productName: 'Apple', quantity: 2, unitPrice: 50 },
          { productId: '6', productName: 'Shirt', quantity: 1, unitPrice: 100, variantId: '9', variantAttributes: 'red' },
        ],
        subtotal: 200,
        tax: 32,
        total: 232,
        paymentMethod: 'card',
        notes: 'gift',
        customerId: '7',
      }),
    })

    expect(res.status).toBe(201)
    expect(execute).toHaveBeenCalledTimes(3)
    const orderParams = execute.mock.calls[0][1] as unknown[]
    expect(orderParams.slice(0, 8)).toEqual([200, 32, 232, 'card', 'gift', 3, 7, expect.any(String)])
    const plainItem = execute.mock.calls[1][1] as unknown[]
    expect(plainItem.slice(1, 8)).toEqual([5, 'Apple', 2, 50, 100, null, null])
    const variantItem = execute.mock.calls[2][1] as unknown[]
    expect(variantItem.slice(5, 8)).toEqual([100, 9, 'red'])
  })

  it('creates orders without optional identity', async () => {
    mockJwtPayload.value = {}
    query.mockResolvedValueOnce([dbOrder({ user_id: null })]).mockResolvedValueOnce([])
    const app = createApp()

    const res = await app.request('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [], subtotal: 0, tax: 0, total: 0 }),
    })

    expect(res.status).toBe(201)
    expect(execute).toHaveBeenCalledTimes(1)
    const orderParams = execute.mock.calls[0][1] as unknown[]
    expect(orderParams.slice(3, 7)).toEqual([null, null, null, null])
  })

  it('updates order fields or 404s', async () => {
    const app = createApp()

    query.mockResolvedValueOnce([dbOrder({ status: 'pending' })])
    const updated = await app.request('/api/orders/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending', notes: 'n', paymentMethod: 'cash' }),
    })
    expect(updated.status).toBe(200)
    expect(execute.mock.calls[0][1]).toEqual(['pending', 'n', 'cash', expect.any(String), 1])

    query.mockReset()
    query.mockResolvedValueOnce([dbOrder()])
    const partial = await app.request('/api/orders/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(partial.status).toBe(200)
    expect((execute.mock.calls[1][1] as unknown[]).slice(0, 3)).toEqual([null, null, null])

    query.mockReset()
    query.mockResolvedValueOnce([])
    const missing = await app.request('/api/orders/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending' }),
    })
    expect(missing.status).toBe(404)
  })

  it('cancels orders or 404s', async () => {
    const app = createApp()

    const cancelled = await app.request('/api/orders/1', { method: 'DELETE' })
    expect(cancelled.status).toBe(200)

    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })
    const missing = await app.request('/api/orders/2', { method: 'DELETE' })
    expect(missing.status).toBe(404)
  })
})
