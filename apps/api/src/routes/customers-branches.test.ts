import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { execute, query } = vi.hoisted(() => ({
  execute: vi.fn(async () => ({ lastInsertId: 12, rowsAffected: 1 })),
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

const { customersRouter } = await import('./customers.js')

function createApp() {
  const app = new Hono()
  app.route('/api/customers', customersRouter)
  return app
}

function dbCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    customer_number: 'CUST-00012',
    first_name: 'Ada',
    last_name: 'Lovelace',
    company_name: null,
    email: null,
    phone: null,
    phone_secondary: null,
    address_line1: null,
    address_line2: null,
    city: null,
    state: null,
    postal_code: null,
    country: 'US',
    customer_type: 'individual',
    customer_segment: null,
    credit_limit: 0,
    current_balance: 0,
    tax_exempt: 0,
    tax_id: null,
    loyalty_points: 0,
    total_purchases: 0,
    total_orders: 0,
    first_purchase_date: null,
    last_purchase_date: null,
    is_active: 1,
    notes: null,
    tags: null,
    custom_fields: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    created_by: null,
    deleted_at: null,
    ...overrides,
  }
}

describe('customersRouter branches', () => {
  beforeEach(() => {
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 12, rowsAffected: 1 })
  })

  it('gets a single customer or 404s', async () => {
    query.mockResolvedValueOnce([dbCustomer()])
    const app = createApp()

    const found = await app.request('/api/customers/12')
    expect(found.status).toBe(200)
    expect(((await found.json()) as { customer: { id: string } }).customer.id).toBe('12')

    query.mockReset()
    query.mockResolvedValueOnce([])
    const missing = await app.request('/api/customers/99')
    expect(missing.status).toBe(404)
  })

  it('lists customers without search and parses broken JSON payloads', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      dbCustomer(),
      dbCustomer({ id: 13, tags: 'broken{', custom_fields: 'broken{' }),
      dbCustomer({ id: 14, tags: '"nope"', custom_fields: '[1]' }),
    ])
    const app = createApp()

    const res = await app.request('/api/customers')
    const body = (await res.json()) as {
      customers: Array<{ tags: unknown[]; customFields: Record<string, unknown> }>
      totalCount: number
    }

    expect(res.status).toBe(200)
    expect(body.totalCount).toBe(0)
    expect(body.customers).toHaveLength(3)
    expect(body.customers[0].tags).toEqual([])
    expect(body.customers[0].customFields).toEqual({})
    expect(body.customers[1].tags).toEqual([])
    expect(body.customers[1].customFields).toEqual({})
    expect(body.customers[2].tags).toEqual([])
    expect(body.customers[2].customFields).toEqual({})
  })

  it('creates a minimal individual with defaults', async () => {
    query.mockResolvedValueOnce([{ max_number: 41 }]).mockResolvedValueOnce([dbCustomer()])
    const app = createApp()

    const res = await app.request('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace' }),
    })

    expect(res.status).toBe(201)
    const params = execute.mock.calls[0][1] as unknown[]
    expect(params[0]).toBe('CUST-00042')
    expect(params[12]).toBe('US')
    expect(params[13]).toBe('individual')
    expect(params[15]).toBe(0)
    expect(params[16]).toBe(0)
    expect(params[17]).toBe(0)
    expect(params[19]).toBe(0)
    expect(params[24]).toBe(1)
    expect(params[26]).toBeNull()
    expect(params[27]).toBeNull()
    expect(params[30]).toBeNull()
  })

  it('starts numbering at CUST-00001 when no customers exist', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([dbCustomer()])
    const app = createApp()

    const res = await app.request('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace' }),
    })

    expect(res.status).toBe(201)
    expect((execute.mock.calls[0][1] as unknown[])[0]).toBe('CUST-00001')
  })

  it('falls back to a timestamp number when numbering fails', async () => {
    query
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce([dbCustomer()])
    const app = createApp()

    const res = await app.request('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }),
    })

    expect(res.status).toBe(201)
    expect((execute.mock.calls[0][1] as unknown[])[0]).toMatch(/^CUST-\d{5}$/)
  })

  it('rejects invalid identities, emails, and duplicates on create', async () => {
    const app = createApp()

    const noCompany = await app.request('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerType: 'business' }),
    })
    expect(noCompany.status).toBe(400)

    const noFirst = await app.request('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastName: 'Lovelace' }),
    })
    expect(noFirst.status).toBe(400)

    const noLast = await app.request('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Ada' }),
    })
    expect(noLast.status).toBe(400)

    query.mockResolvedValueOnce([])
    const badEmail = await app.request('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace', email: 'bad' }),
    })
    expect(badEmail.status).toBe(400)

    query.mockReset()
    query.mockResolvedValueOnce([{ id: 7 }])
    const duplicate = await app.request('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }),
    })
    expect(duplicate.status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
  })

  it('coerces numbers, booleans, tags, and custom fields from loose input', async () => {
    query.mockResolvedValueOnce([{ max_number: 1 }]).mockResolvedValueOnce([dbCustomer()])
    const app = createApp()

    const res = await app.request('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Ada',
        lastName: 'Lovelace',
        creditLimit: '2500',
        currentBalance: 'abc',
        loyaltyPoints: '  ',
        totalPurchases: true,
        totalOrders: null,
        taxExempt: 1,
        isActive: 'true',
        tags: '["a","b"]',
        customFields: '{"a":1}',
      }),
    })

    expect(res.status).toBe(201)
    const params = execute.mock.calls[0][1] as unknown[]
    expect(params[15]).toBe(2500)
    expect(params[16]).toBe(0)
    expect(params[19]).toBe(0)
    expect(params[20]).toBe(0)
    expect(params[21]).toBe(0)
    expect(params[17]).toBe(1)
    expect(params[24]).toBe(1)
    expect(params[26]).toBe('["a","b"]')
    expect(params[27]).toBe('{"a":1}')
  })

  it('splits comma-separated tags and honors explicit isActive false', async () => {
    query.mockResolvedValueOnce([{ max_number: 1 }]).mockResolvedValueOnce([dbCustomer()])
    const app = createApp()

    const res = await app.request('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace', tags: 'vip, frames', isActive: false }),
    })

    expect(res.status).toBe(201)
    const params = execute.mock.calls[0][1] as unknown[]
    expect(params[24]).toBe(0)
    expect(params[26]).toBe('["vip","frames"]')
  })

  it('stores null tags for empty arrays', async () => {
    query.mockResolvedValueOnce([{ max_number: 1 }]).mockResolvedValueOnce([dbCustomer()])
    const app = createApp()

    const res = await app.request('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Ada', lastName: 'Lovelace', tags: [] }),
    })

    expect(res.status).toBe(201)
    expect((execute.mock.calls[0][1] as unknown[])[26]).toBeNull()
  })

  it('404s when updating a missing customer', async () => {
    query.mockResolvedValueOnce([])
    const app = createApp()

    const res = await app.request('/api/customers/99', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '1' }),
    })

    expect(res.status).toBe(404)
  })

  it('rejects invalid identity, email, and duplicate email on update', async () => {
    const app = createApp()

    query.mockResolvedValueOnce([dbCustomer()])
    const badIdentity = await app.request('/api/customers/12', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerType: 'business' }),
    })
    expect(badIdentity.status).toBe(400)

    query.mockReset()
    query.mockResolvedValueOnce([dbCustomer()])
    const badEmail = await app.request('/api/customers/12', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bad' }),
    })
    expect(badEmail.status).toBe(400)

    query.mockReset()
    query.mockResolvedValueOnce([dbCustomer()]).mockResolvedValueOnce([{ id: 9 }])
    const duplicate = await app.request('/api/customers/12', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'taken@example.com' }),
    })
    expect(duplicate.status).toBe(400)
  })

  it('updates with empty bodies and keeps existing contact fallbacks', async () => {
    query.mockResolvedValueOnce([dbCustomer()]).mockResolvedValueOnce([dbCustomer()])
    const app = createApp()

    const res = await app.request('/api/customers/12', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(200)
    const [sql] = execute.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('updated_at = ?')

    query.mockReset()
    query.mockResolvedValueOnce([dbCustomer({ email: 'ada@example.com', company_name: 'Lovelace Ltd' })])
    query.mockResolvedValueOnce([dbCustomer({ email: 'ada@example.com' })])
    const withFallbacks = await app.request('/api/customers/12', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '555-1' }),
    })
    expect(withFallbacks.status).toBe(200)
  })

  it('updates every typed field with values', async () => {
    query.mockResolvedValueOnce([dbCustomer()]).mockResolvedValueOnce([dbCustomer()])
    const app = createApp()

    const res = await app.request('/api/customers/12', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerType: 'individual',
        creditLimit: 500,
        currentBalance: 10,
        taxExempt: '1',
        loyaltyPoints: 5,
        totalPurchases: 100,
        totalOrders: 2,
        isActive: '0',
        createdBy: '7',
        phone: null,
      }),
    })

    expect(res.status).toBe(200)
    const [sql, params] = execute.mock.calls[0] as [string, unknown[]]
    for (const column of [
      'customer_type',
      'credit_limit',
      'current_balance',
      'tax_exempt',
      'loyalty_points',
      'total_purchases',
      'total_orders',
      'is_active',
      'created_by',
      'phone',
    ]) {
      expect(sql).toContain(`${column} = ?`)
    }
    expect(params).toContain(500)
    expect(params).toContain(1)
    expect(params).toContain(7)
    expect(params).toContain(null)
  })

  it('updates typed fields with nulls and falsy flags', async () => {
    query.mockResolvedValueOnce([dbCustomer()]).mockResolvedValueOnce([dbCustomer()])
    const app = createApp()

    const res = await app.request('/api/customers/12', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creditLimit: null,
        currentBalance: null,
        loyaltyPoints: null,
        totalPurchases: null,
        totalOrders: null,
        createdBy: null,
        taxExempt: 'banana',
        isActive: false,
      }),
    })

    expect(res.status).toBe(200)
    const [sql, params] = execute.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('credit_limit = ?')
    expect(params.filter((value) => value === 0).length).toBeGreaterThanOrEqual(7)
    expect(params).toContain(null)
  })

  it('nulls tags and custom fields from loose update input', async () => {
    const app = createApp()

    for (const body of [{ tags: null }, { tags: 123 }, { tags: '"solo"' }, { customFields: 'nope' }, { customFields: '[1]' }, { customFields: '"s"' }, { customFields: 'null' }, { customFields: [1] }]) {
      query.mockReset()
      query.mockResolvedValueOnce([dbCustomer()]).mockResolvedValueOnce([dbCustomer()])
      const res = await app.request('/api/customers/12', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      expect(res.status).toBe(200)
      const params = execute.mock.calls[0][1] as unknown[]
      expect(params).toContain(null)
    }
  })

  it('accepts a new email on update', async () => {
    query.mockResolvedValueOnce([dbCustomer()]).mockResolvedValueOnce([]).mockResolvedValueOnce([dbCustomer()])
    const app = createApp()

    const res = await app.request('/api/customers/12', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com', isActive: true }),
    })

    expect(res.status).toBe(200)
    const [sql] = execute.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('email = ?')
  })

  it('404s when the updated customer disappears', async () => {
    query.mockResolvedValueOnce([dbCustomer()]).mockResolvedValueOnce([])
    const app = createApp()

    const res = await app.request('/api/customers/12', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '1' }),
    })

    expect(res.status).toBe(404)
  })

  it('deletes customers or 404s', async () => {
    const app = createApp()

    const deleted = await app.request('/api/customers/12', { method: 'DELETE' })
    expect(deleted.status).toBe(200)

    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })
    const missing = await app.request('/api/customers/99', { method: 'DELETE' })
    expect(missing.status).toBe(404)
  })
})
