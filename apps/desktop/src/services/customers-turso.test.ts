import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Customer } from './customers-turso'

const { execute, query } = vi.hoisted(() => ({
  execute: vi.fn(async (_sql: string, _params: unknown[] = []) => ({ lastInsertId: 0, rowsAffected: 1 })),
  query: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<Array<Record<string, unknown>>> => []),
}))

vi.mock('../lib/db-adapter', () => ({
  execute,
  query,
}))

const { customerService, CustomerService } = await import('./customers-turso')

function dbCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    customer_number: 'CUST-00001',
    first_name: 'Ana',
    last_name: 'Lopez',
    company_name: null,
    email: 'ana@example.com',
    phone: '555-0100',
    phone_secondary: null,
    address_line1: 'Calle 1',
    address_line2: null,
    city: 'CDMX',
    state: null,
    postal_code: '01000',
    country: 'MX',
    customer_type: 'individual',
    customer_segment: null,
    credit_limit: 1000,
    current_balance: 100,
    tax_exempt: 0,
    tax_id: null,
    loyalty_points: 10,
    total_purchases: 500,
    total_orders: 3,
    first_purchase_date: '2026-01-01T00:00:00.000Z',
    last_purchase_date: '2026-02-01T00:00:00.000Z',
    is_active: 1,
    notes: 'VIP',
    tags: JSON.stringify(['vip']),
    custom_fields: JSON.stringify({ tier: 'gold' }),
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
    created_by: 2,
    deleted_at: null,
    ...overrides,
  }
}

type CustomerInput = Omit<Customer, 'id' | 'customerNumber' | 'createdAt' | 'updatedAt'>

function customerInput(overrides: Partial<CustomerInput> = {}): CustomerInput {
  return {
    firstName: 'Ana',
    lastName: 'Lopez',
    country: 'MX',
    customerType: 'individual',
    creditLimit: 1000,
    currentBalance: 0,
    taxExempt: false,
    loyaltyPoints: 0,
    totalPurchases: 0,
    totalOrders: 0,
    isActive: true,
    ...overrides,
  }
}

describe('CustomerService getters', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    query.mockResolvedValue([])
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('lists customers with parsed tags and fields', async () => {
    query.mockResolvedValueOnce([dbCustomer(), dbCustomer({ id: 2, customer_number: 'CUST-00002' })])

    const customers = await customerService.getCustomers()

    expect(customers).toHaveLength(2)
    expect(customers[0]).toMatchObject({
      id: '1',
      customerNumber: 'CUST-00001',
      taxExempt: false,
      isActive: true,
      tags: ['vip'],
      customFields: { tier: 'gold' },
      createdBy: '2',
    })
  })

  it('tolerates invalid tags and custom fields JSON', async () => {
    query.mockResolvedValueOnce([dbCustomer({ tags: 'not-json', custom_fields: 'also-bad', created_by: null })])

    const customers = await customerService.getCustomers()

    expect(customers[0]?.tags).toEqual([])
    expect(customers[0]?.customFields).toEqual({})
    expect(customers[0]?.createdBy).toBeUndefined()
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('throws when listing fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(customerService.getCustomers()).rejects.toThrow('Failed to fetch customers')
  })

  it('paginates customers', async () => {
    query.mockResolvedValueOnce([{ count: 25 }]).mockResolvedValueOnce([dbCustomer()])

    const page = await customerService.getCustomersPaginated(2, 10)

    expect(page).toMatchObject({
      totalCount: 25,
      totalPages: 3,
      currentPage: 2,
      hasNextPage: true,
      hasPreviousPage: true,
    })
    expect(page.customers).toHaveLength(1)
  })

  it('handles an empty count when paginating', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const page = await customerService.getCustomersPaginated()

    expect(page).toMatchObject({ totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false })
  })

  it('throws when pagination fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(customerService.getCustomersPaginated()).rejects.toThrow('Failed to fetch paginated customers')
  })

  it('gets a customer by id or returns null', async () => {
    query.mockResolvedValueOnce([dbCustomer()])

    await expect(customerService.getCustomer('1')).resolves.toMatchObject({ id: '1' })

    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(customerService.getCustomer('99')).resolves.toBeNull()
  })

  it('throws when getting a customer fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(customerService.getCustomer('1')).rejects.toThrow('Failed to fetch customer')
  })

  it('generates the next customer number', async () => {
    query.mockResolvedValueOnce([{ max_number: 7 }])

    await expect(customerService.generateCustomerNumber()).resolves.toBe('CUST-00008')
  })

  it('starts numbering when no customers exist', async () => {
    query.mockResolvedValueOnce([])

    await expect(customerService.generateCustomerNumber()).resolves.toBe('CUST-00001')

    query.mockReset()
    query.mockResolvedValueOnce([{ max_number: null }])

    await expect(customerService.generateCustomerNumber()).resolves.toBe('CUST-00001')
  })

  it('falls back to a timestamp number on failure', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    const number = await customerService.generateCustomerNumber()

    expect(number.startsWith('CUST-')).toBe(true)
  })
})

describe('CustomerService.createCustomer', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    execute.mockResolvedValue({ lastInsertId: 7, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('validates identity and email', async () => {
    await expect(
      customerService.createCustomer(customerInput({ customerType: 'business', companyName: '  ' })),
    ).resolves.toMatchObject({ success: false, error: 'Company name is required' })
    await expect(customerService.createCustomer(customerInput({ firstName: '  ' }))).resolves.toMatchObject({
      success: false,
      error: 'First name is required',
    })
    await expect(customerService.createCustomer(customerInput({ lastName: '' }))).resolves.toMatchObject({
      success: false,
      error: 'Last name is required',
    })
    await expect(customerService.createCustomer(customerInput({ email: 'bad' }))).resolves.toMatchObject({
      success: false,
      error: 'Invalid email format',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects duplicate emails', async () => {
    query.mockResolvedValueOnce([{ id: 3 }])

    await expect(customerService.createCustomer(customerInput({ email: 'ana@example.com' }))).resolves.toMatchObject({
      success: false,
      error: 'Customer with this email already exists',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('creates a business customer with all fields', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ max_number: 1 }])

    const result = await customerService.createCustomer(
      customerInput({
        customerType: 'business',
        companyName: 'Acme',
        email: 'acme@example.com',
        phone: '555-0000',
        customerSegment: 'retail',
        taxExempt: true,
        taxId: 'TAX1',
        tags: ['a'],
        customFields: { k: 1 },
        createdBy: '2',
        notes: 'hi',
      }),
    )

    expect(result.success).toBe(true)
    expect(result.customer).toMatchObject({ id: '7', customerNumber: 'CUST-00002', companyName: 'Acme' })
    const [, params] = execute.mock.calls[0]
    expect(params).toContain('Acme')
    expect(params).toContain(1)
  })

  it('creates a minimal customer with defaults', async () => {
    query.mockResolvedValueOnce([{ max_number: 0 }])

    const result = await customerService.createCustomer(customerInput())

    expect(result.success).toBe(true)
    expect(result.customer).toMatchObject({ country: 'MX', creditLimit: 1000, taxExempt: false })
    const [, params] = execute.mock.calls[0]
    expect(params).toContain(null)
  })

  it('returns an error when creation fails', async () => {
    query.mockResolvedValueOnce([{ max_number: 0 }])
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(customerService.createCustomer(customerInput())).resolves.toMatchObject({
      success: false,
      error: 'Failed to create customer',
    })
  })
})

describe('CustomerService.updateCustomer', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('validates email format', async () => {
    await expect(customerService.updateCustomer('1', { email: 'bad' })).resolves.toMatchObject({
      success: false,
      error: 'Invalid email format',
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('returns not found for missing customers', async () => {
    query.mockResolvedValueOnce([])

    await expect(customerService.updateCustomer('99', { firstName: 'X' })).resolves.toMatchObject({
      success: false,
      error: 'Customer not found',
    })
  })

  it('validates identity changes and duplicate emails', async () => {
    query.mockResolvedValueOnce([dbCustomer()])

    await expect(customerService.updateCustomer('1', { customerType: 'business' })).resolves.toMatchObject({
      success: false,
      error: 'Company name is required',
    })

    query.mockReset()
    query.mockResolvedValueOnce([dbCustomer()]).mockResolvedValueOnce([{ id: 2 }])

    await expect(customerService.updateCustomer('1', { email: 'dup@example.com' })).resolves.toMatchObject({
      success: false,
      error: 'Customer with this email already exists',
    })
  })

  it('updates every field', async () => {
    query.mockResolvedValueOnce([dbCustomer()]).mockResolvedValueOnce([]).mockResolvedValueOnce([dbCustomer()])

    const result = await customerService.updateCustomer('1', {
      firstName: 'Beto',
      lastName: 'Ruiz',
      companyName: 'NewCo',
      email: 'beto@example.com',
      phone: '555-0001',
      phoneSecondary: '555-0002',
      addressLine1: 'A1',
      addressLine2: 'A2',
      city: 'GDL',
      state: 'JAL',
      postalCode: '44100',
      country: 'MX',
      customerType: 'business',
      customerSegment: 'seg',
      creditLimit: 500,
      currentBalance: 50,
      taxExempt: true,
      taxId: 'T2',
      loyaltyPoints: 5,
      totalPurchases: 60,
      totalOrders: 2,
      firstPurchaseDate: '2026-01-01',
      lastPurchaseDate: '2026-02-02',
      isActive: false,
      notes: 'n',
      tags: ['x'],
      customFields: { y: 2 },
    })

    expect(result.success).toBe(true)
    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain('UPDATE customers SET')
    expect(params).toContain('Beto')
    expect(params).toContain(1)
  })

  it('stores null for cleared fields', async () => {
    query.mockResolvedValueOnce([dbCustomer()]).mockResolvedValueOnce([dbCustomer()])

    const result = await customerService.updateCustomer('1', {
      companyName: '',
      email: '',
      phone: '',
      phoneSecondary: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postalCode: '',
      customerSegment: '',
      taxExempt: false,
      taxId: '',
      isActive: true,
      notes: '',
      tags: null as unknown as string[],
      customFields: null as unknown as Record<string, unknown>,
      firstPurchaseDate: '',
      lastPurchaseDate: '',
    })

    expect(result.success).toBe(true)
    const [, params] = execute.mock.calls[0]
    expect(params).toContain(null)
    expect(params).toContain(0)
  })

  it('applies a minimal update', async () => {
    query.mockResolvedValueOnce([dbCustomer()]).mockResolvedValueOnce([dbCustomer()])

    const result = await customerService.updateCustomer('1', { firstName: 'Solo' })

    expect(result.success).toBe(true)
    const [sql] = execute.mock.calls[0]
    expect(sql).toContain('first_name = ?')
  })

  it('returns an error when the update fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(customerService.updateCustomer('1', { firstName: 'X' })).resolves.toMatchObject({
      success: false,
      error: 'Failed to update customer',
    })
  })
})

describe('CustomerService deletion, search, and loyalty', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    query.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('soft deletes customers', async () => {
    await expect(customerService.deleteCustomer('1')).resolves.toEqual({ success: true })

    execute.mockReset()
    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })

    await expect(customerService.deleteCustomer('99')).resolves.toMatchObject({
      success: false,
      error: 'Customer not found',
    })
  })

  it('returns an error when deletion fails', async () => {
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(customerService.deleteCustomer('1')).resolves.toMatchObject({
      success: false,
      error: 'Failed to delete customer',
    })
  })

  it('searches customers', async () => {
    query.mockResolvedValueOnce([dbCustomer()])

    const results = await customerService.searchCustomers('ana')

    expect(results).toHaveLength(1)
    expect(query.mock.calls[0][1]).toHaveLength(9)

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(customerService.searchCustomers('ana')).rejects.toThrow('Failed to search customers')
  })

  it('searches customers with pagination', async () => {
    query.mockResolvedValueOnce([{ count: 3 }]).mockResolvedValueOnce([dbCustomer()])

    const page = await customerService.searchCustomersPaginated('ana', 1, 10)

    expect(page).toMatchObject({ totalCount: 3, totalPages: 1, currentPage: 1 })
    expect(query.mock.calls[1][1]).toHaveLength(11)

    query.mockReset()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const empty = await customerService.searchCustomersPaginated('zzz')

    expect(empty).toMatchObject({ totalCount: 0, customers: [] })

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(customerService.searchCustomersPaginated('ana')).rejects.toThrow(
      'Failed to search customers with pagination',
    )
  })

  it('updates loyalty points', async () => {
    await expect(customerService.updateLoyaltyPoints('1', 5)).resolves.toEqual({ success: true })

    execute.mockReset()
    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })

    await expect(customerService.updateLoyaltyPoints('99', 5)).resolves.toMatchObject({
      success: false,
      error: 'Customer not found',
    })

    execute.mockReset()
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(customerService.updateLoyaltyPoints('1', 5)).resolves.toMatchObject({
      success: false,
      error: 'Failed to update loyalty points',
    })
  })

  it('gets top customers', async () => {
    query.mockResolvedValueOnce([dbCustomer()])

    const top = await customerService.getTopCustomers(5)

    expect(top).toHaveLength(1)
    expect(query.mock.calls[0][1]).toEqual([5])

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(customerService.getTopCustomers()).rejects.toThrow('Failed to fetch top customers')
  })

  it('exposes a shared service instance', () => {
    expect(customerService).toBeInstanceOf(CustomerService)
  })
})

describe('CustomerService branch coverage', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    execute.mockResolvedValue({ lastInsertId: 7, rowsAffected: 1 })
    query.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('maps rows without tags or custom fields', async () => {
    query.mockResolvedValueOnce([dbCustomer({ tags: null, custom_fields: null })])

    const customers = await customerService.getCustomers()

    expect(customers[0]?.tags).toEqual([])
    expect(customers[0]?.customFields).toEqual({})
  })

  it('creates customers with falsy optional values', async () => {
    query.mockResolvedValueOnce([{ max_number: 0 }])

    const result = await customerService.createCustomer(customerInput({ country: '', creditLimit: 0, isActive: false }))

    expect(result.success).toBe(true)
    expect(result.customer).toMatchObject({ country: 'US', creditLimit: 0, isActive: false })
  })

  it('skips the update statement when nothing changed', async () => {
    query.mockResolvedValueOnce([dbCustomer()]).mockResolvedValueOnce([dbCustomer()])

    const result = await customerService.updateCustomer('1', {})

    expect(result.success).toBe(true)
    expect(execute).not.toHaveBeenCalled()
  })
})
