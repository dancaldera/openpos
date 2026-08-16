import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Hono } from 'hono'
import jwt from 'jsonwebtoken'

const execute = mock(
  async (_sql: string, _params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }> => ({
    lastInsertId: 11,
    rowsAffected: 1,
  }),
)
const query = mock(async (_sql: string, _params?: unknown[]): Promise<Array<Record<string, unknown>>> => [])

mock.module('../middleware/auth.js', () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next()
  },
}))

mock.module('../lib/turso.js', () => ({
  execute,
  query,
}))

const { customersRouter } = await import('./customers')

process.env.JWT_SECRET = 'customers-test-secret'

const authToken = jwt.sign(
  {
    sub: '3',
    email: 'manager@example.com',
    name: 'Manager',
    role: 'manager',
    permissions: [],
  },
  process.env.JWT_SECRET,
)

const authHeaders = { Authorization: `Bearer ${authToken}` }

function createApp() {
  const app = new Hono()
  app.route('/api/customers', customersRouter)
  return app
}

describe('customersRouter parity', () => {
  beforeEach(() => {
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 11, rowsAffected: 1 })
  })

  it('creates a business customer with company-only identity and round-trips rich fields', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ max_number: 10 }])
      .mockResolvedValueOnce([
        {
          id: 11,
          customer_number: 'CUST-00011',
          first_name: '',
          last_name: '',
          company_name: 'Optica Norte',
          email: 'optica@example.com',
          phone: '555-1000',
          phone_secondary: '555-1001',
          address_line1: 'Av. Principal 123',
          address_line2: 'Local 2',
          city: 'Monterrey',
          state: 'NL',
          postal_code: '64000',
          country: 'MX',
          customer_type: 'business',
          customer_segment: 'Wholesale',
          credit_limit: 8000,
          current_balance: 350,
          tax_exempt: 0,
          tax_id: 'RFC900',
          loyalty_points: 25,
          total_purchases: 15000,
          total_orders: 7,
          first_purchase_date: '2026-01-05T00:00:00.000Z',
          last_purchase_date: '2026-03-30T00:00:00.000Z',
          is_active: 1,
          notes: 'Frame reorder reminders',
          tags: JSON.stringify(['optical', 'vip']),
          custom_fields: JSON.stringify({
            businessProfile: 'optical',
            preferredContactMethod: 'whatsapp',
            referenceCode: 'LAB-77',
          }),
          created_at: '2026-03-30T10:00:00.000Z',
          updated_at: '2026-03-30T10:00:00.000Z',
          created_by: 3,
          deleted_at: null,
        },
      ])

    const response = await createApp().request('/api/customers', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerType: 'business',
        companyName: 'Optica Norte',
        email: 'optica@example.com',
        phone: '555-1000',
        phoneSecondary: '555-1001',
        addressLine1: 'Av. Principal 123',
        addressLine2: 'Local 2',
        city: 'Monterrey',
        state: 'NL',
        postalCode: '64000',
        country: 'MX',
        customerSegment: 'Wholesale',
        creditLimit: 8000,
        currentBalance: 350,
        taxExempt: false,
        taxId: 'RFC900',
        loyaltyPoints: 25,
        totalPurchases: 15000,
        totalOrders: 7,
        firstPurchaseDate: '2026-01-05T00:00:00.000Z',
        lastPurchaseDate: '2026-03-30T00:00:00.000Z',
        notes: 'Frame reorder reminders',
        tags: ['optical', 'vip'],
        customFields: {
          businessProfile: 'optical',
          preferredContactMethod: 'whatsapp',
          referenceCode: 'LAB-77',
        },
        createdBy: 3,
      }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      customer: {
        id: '11',
        customerNumber: 'CUST-00011',
        firstName: '',
        lastName: '',
        companyName: 'Optica Norte',
        email: 'optica@example.com',
        phone: '555-1000',
        phoneSecondary: '555-1001',
        addressLine1: 'Av. Principal 123',
        addressLine2: 'Local 2',
        city: 'Monterrey',
        state: 'NL',
        postalCode: '64000',
        country: 'MX',
        customerType: 'business',
        customerSegment: 'Wholesale',
        creditLimit: 8000,
        currentBalance: 350,
        taxExempt: false,
        taxId: 'RFC900',
        loyaltyPoints: 25,
        totalPurchases: 15000,
        totalOrders: 7,
        firstPurchaseDate: '2026-01-05T00:00:00.000Z',
        lastPurchaseDate: '2026-03-30T00:00:00.000Z',
        isActive: true,
        notes: 'Frame reorder reminders',
        tags: ['optical', 'vip'],
        customFields: {
          businessProfile: 'optical',
          preferredContactMethod: 'whatsapp',
          referenceCode: 'LAB-77',
        },
        createdAt: '2026-03-30T10:00:00.000Z',
        updatedAt: '2026-03-30T10:00:00.000Z',
        createdBy: '3',
        deletedAt: null,
      },
    })

    const firstExecuteCall = execute.mock.calls[0] as [string, unknown[]]
    expect(execute).toHaveBeenCalledTimes(1)
    expect(firstExecuteCall[0]).toContain('phone_secondary')
    expect(firstExecuteCall[0]).toContain('custom_fields')
    expect(firstExecuteCall[1]).toContain('CUST-00011')
    expect(firstExecuteCall[1]).toContain(JSON.stringify(['optical', 'vip']))
  })

  it('updates a business customer with company-only identity and persists custom fields', async () => {
    query
      .mockResolvedValueOnce([
        {
          id: 11,
          customer_number: 'CUST-00011',
          first_name: '',
          last_name: '',
          company_name: 'Optica Norte',
          email: 'optica@example.com',
          phone: '555-1000',
          phone_secondary: null,
          address_line1: null,
          address_line2: null,
          city: null,
          state: null,
          postal_code: null,
          country: 'MX',
          customer_type: 'business',
          customer_segment: 'Wholesale',
          credit_limit: 1000,
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
          created_at: '2026-03-30T10:00:00.000Z',
          updated_at: '2026-03-30T10:00:00.000Z',
          created_by: null,
          deleted_at: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 11,
          customer_number: 'CUST-00011',
          first_name: '',
          last_name: '',
          company_name: 'Optica Norte',
          email: 'optica@example.com',
          phone: '555-7777',
          phone_secondary: null,
          address_line1: null,
          address_line2: null,
          city: null,
          state: null,
          postal_code: null,
          country: 'MX',
          customer_type: 'business',
          customer_segment: 'Recurring',
          credit_limit: 1000,
          current_balance: 0,
          tax_exempt: 0,
          tax_id: null,
          loyalty_points: 0,
          total_purchases: 0,
          total_orders: 0,
          first_purchase_date: null,
          last_purchase_date: null,
          is_active: 1,
          notes: 'Updated notes',
          tags: JSON.stringify(['vip', 'frames']),
          custom_fields: JSON.stringify({
            businessProfile: 'optical',
            preferredContactMethod: 'email',
            referenceCode: 'FRAME-9',
          }),
          created_at: '2026-03-30T10:00:00.000Z',
          updated_at: '2026-03-31T10:00:00.000Z',
          created_by: null,
          deleted_at: null,
        },
      ])

    const response = await createApp().request('/api/customers/11', {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        companyName: 'Optica Norte',
        phone: '555-7777',
        customerSegment: 'Recurring',
        notes: 'Updated notes',
        tags: ['vip', 'frames'],
        customFields: {
          businessProfile: 'optical',
          preferredContactMethod: 'email',
          referenceCode: 'FRAME-9',
        },
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      customer: expect.objectContaining({
        id: '11',
        companyName: 'Optica Norte',
        phone: '555-7777',
        customerSegment: 'Recurring',
        notes: 'Updated notes',
        tags: ['vip', 'frames'],
        customFields: {
          businessProfile: 'optical',
          preferredContactMethod: 'email',
          referenceCode: 'FRAME-9',
        },
      }),
    })

    const firstExecuteCall = execute.mock.calls[0] as [string, unknown[]]
    expect(execute).toHaveBeenCalledTimes(1)
    expect(firstExecuteCall[0]).toContain('custom_fields = ?')
    expect(firstExecuteCall[0]).toContain('updated_at = ?')
  })

  it('uses parity search fields and returns parsed list payloads', async () => {
    query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([
        {
          id: 11,
          customer_number: 'CUST-00011',
          first_name: 'Marina',
          last_name: 'Lopez',
          company_name: 'Lopez Market',
          email: 'marina@example.com',
          phone: '555-0101',
          phone_secondary: '555-0102',
          address_line1: '123 Main St',
          address_line2: 'Suite 4',
          city: 'Monterrey',
          state: 'NL',
          postal_code: '64000',
          country: 'MX',
          customer_type: 'business',
          customer_segment: 'Wholesale',
          credit_limit: 1500,
          current_balance: 200,
          tax_exempt: 0,
          tax_id: 'RFC123',
          loyalty_points: 40,
          total_purchases: 4250.5,
          total_orders: 18,
          first_purchase_date: '2025-12-01T00:00:00.000Z',
          last_purchase_date: '2026-03-20T00:00:00.000Z',
          is_active: 0,
          notes: 'Priority account',
          tags: JSON.stringify(['vip', 'invoice']),
          custom_fields: JSON.stringify({
            businessProfile: 'grocery',
            referenceCode: 'HOUSE-77',
          }),
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-03-20T12:00:00.000Z',
          created_by: 3,
          deleted_at: null,
        },
      ])

    const response = await createApp().request('/api/customers?search=HOUSE-77', {
      headers: authHeaders,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      customers: [
        expect.objectContaining({
          id: '11',
          customerSegment: 'Wholesale',
          tags: ['vip', 'invoice'],
          customFields: {
            businessProfile: 'grocery',
            referenceCode: 'HOUSE-77',
          },
          isActive: false,
        }),
      ],
      totalCount: 1,
      page: 1,
      totalPages: 1,
    })

    const countQueryCall = query.mock.calls[0] as [string, unknown[]]
    const listQueryCall = query.mock.calls[1] as [string, unknown[]]
    expect(query).toHaveBeenCalledTimes(2)
    expect(countQueryCall[0]).toContain('customer_segment')
    expect(countQueryCall[0]).toContain('custom_fields')
    expect(listQueryCall[0]).not.toContain('is_active = 1')
  })
})
