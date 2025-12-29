import Database from '@tauri-apps/plugin-sql'

export interface Customer {
  id: string
  customerNumber: string
  firstName: string
  lastName: string
  companyName?: string
  email?: string
  phone?: string
  phoneSecondary?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country: string
  customerType: 'individual' | 'business'
  customerSegment?: string
  creditLimit: number
  currentBalance: number
  taxExempt: boolean
  taxId?: string
  loyaltyPoints: number
  totalPurchases: number
  totalOrders: number
  firstPurchaseDate?: string
  lastPurchaseDate?: string
  isActive: boolean
  notes?: string
  tags?: string[]
  customFields?: Record<string, any>
  createdAt: string
  updatedAt: string
  createdBy?: string
  deletedAt?: string
}

interface DatabaseCustomer {
  id: number
  customer_number: string
  first_name: string
  last_name: string
  company_name?: string
  email?: string
  phone?: string
  phone_secondary?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  postal_code?: string
  country: string
  customer_type: 'individual' | 'business'
  customer_segment?: string
  credit_limit: number
  current_balance: number
  tax_exempt: number
  tax_id?: string
  loyalty_points: number
  total_purchases: number
  total_orders: number
  first_purchase_date?: string
  last_purchase_date?: string
  is_active: number
  notes?: string
  tags?: string
  custom_fields?: string
  created_at: string
  updated_at: string
  created_by?: number
  deleted_at?: string
}

export class CustomerService {
  private static instance: CustomerService
  private db: Database | null = null

  static getInstance(): CustomerService {
    if (!CustomerService.instance) {
      CustomerService.instance = new CustomerService()
    }
    return CustomerService.instance
  }

  private async getDatabase(): Promise<Database> {
    if (!this.db) {
      this.db = await Database.load('sqlite:postpos.db')
    }
    return this.db
  }

  private convertDbCustomer(dbCustomer: DatabaseCustomer): Customer {
    let tags: string[] = []
    let customFields: Record<string, any> = {}

    try {
      if (dbCustomer.tags) {
        tags = JSON.parse(dbCustomer.tags)
      }
    } catch (error) {
      console.error('Error parsing tags:', error)
    }

    try {
      if (dbCustomer.custom_fields) {
        customFields = JSON.parse(dbCustomer.custom_fields)
      }
    } catch (error) {
      console.error('Error parsing custom fields:', error)
    }

    return {
      id: dbCustomer.id.toString(),
      customerNumber: dbCustomer.customer_number,
      firstName: dbCustomer.first_name,
      lastName: dbCustomer.last_name,
      companyName: dbCustomer.company_name,
      email: dbCustomer.email,
      phone: dbCustomer.phone,
      phoneSecondary: dbCustomer.phone_secondary,
      addressLine1: dbCustomer.address_line1,
      addressLine2: dbCustomer.address_line2,
      city: dbCustomer.city,
      state: dbCustomer.state,
      postalCode: dbCustomer.postal_code,
      country: dbCustomer.country,
      customerType: dbCustomer.customer_type,
      customerSegment: dbCustomer.customer_segment,
      creditLimit: dbCustomer.credit_limit,
      currentBalance: dbCustomer.current_balance,
      taxExempt: Boolean(dbCustomer.tax_exempt),
      taxId: dbCustomer.tax_id,
      loyaltyPoints: dbCustomer.loyalty_points,
      totalPurchases: dbCustomer.total_purchases,
      totalOrders: dbCustomer.total_orders,
      firstPurchaseDate: dbCustomer.first_purchase_date,
      lastPurchaseDate: dbCustomer.last_purchase_date,
      isActive: Boolean(dbCustomer.is_active),
      notes: dbCustomer.notes,
      tags,
      customFields,
      createdAt: dbCustomer.created_at,
      updatedAt: dbCustomer.updated_at,
      createdBy: dbCustomer.created_by?.toString(),
      deletedAt: dbCustomer.deleted_at,
    }
  }

  async getCustomers(): Promise<Customer[]> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const customers = await db.select<DatabaseCustomer[]>(
        'SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY customer_number DESC',
      )

      return customers.map((customer) => this.convertDbCustomer(customer))
    } catch (error) {
      console.error('Get customers error:', error)
      throw new Error('Failed to fetch customers')
    }
  }

  async getCustomersPaginated(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    customers: Customer[]
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
      const countResult = await db.select<{ count: number }[]>(
        'SELECT COUNT(*) as count FROM customers WHERE deleted_at IS NULL',
      )
      const totalCount = countResult[0]?.count || 0
      const totalPages = Math.ceil(totalCount / limit)

      // Get paginated customers
      const customers = await db.select<DatabaseCustomer[]>(
        'SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY customer_number DESC LIMIT ? OFFSET ?',
        [limit, offset],
      )

      return {
        customers: customers.map((customer) => this.convertDbCustomer(customer)),
        totalCount,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    } catch (error) {
      console.error('Get paginated customers error:', error)
      throw new Error('Failed to fetch paginated customers')
    }
  }

  async getCustomer(id: string): Promise<Customer | null> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 150))

      const customers = await db.select<DatabaseCustomer[]>(
        'SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [parseInt(id, 10)],
      )

      if (customers.length === 0) {
        return null
      }

      return this.convertDbCustomer(customers[0])
    } catch (error) {
      console.error('Get customer error:', error)
      throw new Error('Failed to fetch customer')
    }
  }

  async generateCustomerNumber(): Promise<string> {
    try {
      const db = await this.getDatabase()

      // Get the highest customer number
      const result = await db.select<{ max_number: number }[]>(
        "SELECT MAX(CAST(SUBSTR(customer_number, 6) AS INTEGER)) as max_number FROM customers WHERE customer_number LIKE 'CUST-%'",
      )

      const maxNumber = result[0]?.max_number || 0
      const nextNumber = maxNumber + 1

      return `CUST-${nextNumber.toString().padStart(5, '0')}`
    } catch (error) {
      console.error('Generate customer number error:', error)
      // Fallback to timestamp-based number
      return `CUST-${Date.now().toString().slice(-5)}`
    }
  }

  async createCustomer(
    customerData: Omit<Customer, 'id' | 'customerNumber' | 'createdAt' | 'updatedAt'>,
  ): Promise<{ success: boolean; customer?: Customer; error?: string }> {
    if (!customerData.firstName.trim()) {
      return { success: false, error: 'First name is required' }
    }

    if (!customerData.lastName.trim()) {
      return { success: false, error: 'Last name is required' }
    }

    if (customerData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(customerData.email)) {
        return { success: false, error: 'Invalid email format' }
      }
    }

    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 400))

      // Check for duplicate email
      if (customerData.email) {
        const existingEmail = await db.select<DatabaseCustomer[]>(
          'SELECT id FROM customers WHERE email = ? AND deleted_at IS NULL LIMIT 1',
          [customerData.email],
        )

        if (existingEmail.length > 0) {
          return {
            success: false,
            error: 'Customer with this email already exists',
          }
        }
      }

      // Generate customer number
      const customerNumber = await this.generateCustomerNumber()

      const now = new Date().toISOString()
      const result = await db.execute(
        `INSERT INTO customers (
          customer_number, first_name, last_name, company_name, email, phone, phone_secondary,
          address_line1, address_line2, city, state, postal_code, country, customer_type,
          customer_segment, credit_limit, current_balance, tax_exempt, tax_id,
          loyalty_points, total_purchases, total_orders, is_active, notes, tags, custom_fields,
          created_at, updated_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerNumber,
          customerData.firstName,
          customerData.lastName,
          customerData.companyName || null,
          customerData.email || null,
          customerData.phone || null,
          customerData.phoneSecondary || null,
          customerData.addressLine1 || null,
          customerData.addressLine2 || null,
          customerData.city || null,
          customerData.state || null,
          customerData.postalCode || null,
          customerData.country || 'US',
          customerData.customerType,
          customerData.customerSegment || null,
          customerData.creditLimit || 0,
          customerData.currentBalance || 0,
          customerData.taxExempt ? 1 : 0,
          customerData.taxId || null,
          customerData.loyaltyPoints || 0,
          customerData.totalPurchases || 0,
          customerData.totalOrders || 0,
          customerData.isActive ? 1 : 0,
          customerData.notes || null,
          customerData.tags ? JSON.stringify(customerData.tags) : null,
          customerData.customFields ? JSON.stringify(customerData.customFields) : null,
          now,
          now,
          customerData.createdBy ? parseInt(customerData.createdBy, 10) : null,
        ],
      )

      const newCustomer: Customer = {
        id: (result.lastInsertId ?? 0).toString(),
        customerNumber,
        firstName: customerData.firstName,
        lastName: customerData.lastName,
        companyName: customerData.companyName,
        email: customerData.email,
        phone: customerData.phone,
        phoneSecondary: customerData.phoneSecondary,
        addressLine1: customerData.addressLine1,
        addressLine2: customerData.addressLine2,
        city: customerData.city,
        state: customerData.state,
        postalCode: customerData.postalCode,
        country: customerData.country || 'US',
        customerType: customerData.customerType,
        customerSegment: customerData.customerSegment,
        creditLimit: customerData.creditLimit || 0,
        currentBalance: customerData.currentBalance || 0,
        taxExempt: customerData.taxExempt,
        taxId: customerData.taxId,
        loyaltyPoints: customerData.loyaltyPoints || 0,
        totalPurchases: customerData.totalPurchases || 0,
        totalOrders: customerData.totalOrders || 0,
        isActive: customerData.isActive,
        notes: customerData.notes,
        tags: customerData.tags,
        customFields: customerData.customFields,
        createdAt: now,
        updatedAt: now,
        createdBy: customerData.createdBy,
      }

      return { success: true, customer: newCustomer }
    } catch (error) {
      console.error('Create customer error:', error)
      return { success: false, error: 'Failed to create customer' }
    }
  }

  async updateCustomer(
    id: string,
    updates: Partial<Omit<Customer, 'id' | 'customerNumber' | 'createdAt'>>,
  ): Promise<{ success: boolean; customer?: Customer; error?: string }> {
    if (updates.firstName !== undefined && !updates.firstName.trim()) {
      return { success: false, error: 'First name is required' }
    }

    if (updates.lastName !== undefined && !updates.lastName.trim()) {
      return { success: false, error: 'Last name is required' }
    }

    if (updates.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(updates.email)) {
        return { success: false, error: 'Invalid email format' }
      }
    }

    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 350))

      const existingCustomer = await db.select<DatabaseCustomer[]>(
        'SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [parseInt(id, 10)],
      )

      if (existingCustomer.length === 0) {
        return { success: false, error: 'Customer not found' }
      }

      // Check for duplicate email
      if (updates.email) {
        const existingEmail = await db.select<DatabaseCustomer[]>(
          'SELECT id FROM customers WHERE email = ? AND id != ? AND deleted_at IS NULL LIMIT 1',
          [updates.email, parseInt(id, 10)],
        )

        if (existingEmail.length > 0) {
          return {
            success: false,
            error: 'Customer with this email already exists',
          }
        }
      }

      const updateFields = []
      const updateValues = []

      if (updates.firstName !== undefined) {
        updateFields.push('first_name = ?')
        updateValues.push(updates.firstName)
      }

      if (updates.lastName !== undefined) {
        updateFields.push('last_name = ?')
        updateValues.push(updates.lastName)
      }

      if (updates.companyName !== undefined) {
        updateFields.push('company_name = ?')
        updateValues.push(updates.companyName || null)
      }

      if (updates.email !== undefined) {
        updateFields.push('email = ?')
        updateValues.push(updates.email || null)
      }

      if (updates.phone !== undefined) {
        updateFields.push('phone = ?')
        updateValues.push(updates.phone || null)
      }

      if (updates.phoneSecondary !== undefined) {
        updateFields.push('phone_secondary = ?')
        updateValues.push(updates.phoneSecondary || null)
      }

      if (updates.addressLine1 !== undefined) {
        updateFields.push('address_line1 = ?')
        updateValues.push(updates.addressLine1 || null)
      }

      if (updates.addressLine2 !== undefined) {
        updateFields.push('address_line2 = ?')
        updateValues.push(updates.addressLine2 || null)
      }

      if (updates.city !== undefined) {
        updateFields.push('city = ?')
        updateValues.push(updates.city || null)
      }

      if (updates.state !== undefined) {
        updateFields.push('state = ?')
        updateValues.push(updates.state || null)
      }

      if (updates.postalCode !== undefined) {
        updateFields.push('postal_code = ?')
        updateValues.push(updates.postalCode || null)
      }

      if (updates.country !== undefined) {
        updateFields.push('country = ?')
        updateValues.push(updates.country)
      }

      if (updates.customerType !== undefined) {
        updateFields.push('customer_type = ?')
        updateValues.push(updates.customerType)
      }

      if (updates.customerSegment !== undefined) {
        updateFields.push('customer_segment = ?')
        updateValues.push(updates.customerSegment || null)
      }

      if (updates.creditLimit !== undefined) {
        updateFields.push('credit_limit = ?')
        updateValues.push(updates.creditLimit)
      }

      if (updates.currentBalance !== undefined) {
        updateFields.push('current_balance = ?')
        updateValues.push(updates.currentBalance)
      }

      if (updates.taxExempt !== undefined) {
        updateFields.push('tax_exempt = ?')
        updateValues.push(updates.taxExempt ? 1 : 0)
      }

      if (updates.taxId !== undefined) {
        updateFields.push('tax_id = ?')
        updateValues.push(updates.taxId || null)
      }

      if (updates.loyaltyPoints !== undefined) {
        updateFields.push('loyalty_points = ?')
        updateValues.push(updates.loyaltyPoints)
      }

      if (updates.totalPurchases !== undefined) {
        updateFields.push('total_purchases = ?')
        updateValues.push(updates.totalPurchases)
      }

      if (updates.totalOrders !== undefined) {
        updateFields.push('total_orders = ?')
        updateValues.push(updates.totalOrders)
      }

      if (updates.firstPurchaseDate !== undefined) {
        updateFields.push('first_purchase_date = ?')
        updateValues.push(updates.firstPurchaseDate || null)
      }

      if (updates.lastPurchaseDate !== undefined) {
        updateFields.push('last_purchase_date = ?')
        updateValues.push(updates.lastPurchaseDate || null)
      }

      if (updates.isActive !== undefined) {
        updateFields.push('is_active = ?')
        updateValues.push(updates.isActive ? 1 : 0)
      }

      if (updates.notes !== undefined) {
        updateFields.push('notes = ?')
        updateValues.push(updates.notes || null)
      }

      if (updates.tags !== undefined) {
        updateFields.push('tags = ?')
        updateValues.push(updates.tags ? JSON.stringify(updates.tags) : null)
      }

      if (updates.customFields !== undefined) {
        updateFields.push('custom_fields = ?')
        updateValues.push(updates.customFields ? JSON.stringify(updates.customFields) : null)
      }

      updateFields.push('updated_at = ?')
      updateValues.push(new Date().toISOString())
      updateValues.push(parseInt(id, 10))

      if (updateFields.length > 1) {
        await db.execute(`UPDATE customers SET ${updateFields.join(', ')} WHERE id = ?`, updateValues)
      }

      const updatedCustomer = await db.select<DatabaseCustomer[]>(
        'SELECT * FROM customers WHERE id = ? LIMIT 1',
        [parseInt(id, 10)],
      )

      return {
        success: true,
        customer: this.convertDbCustomer(updatedCustomer[0]),
      }
    } catch (error) {
      console.error('Update customer error:', error)
      return { success: false, error: 'Failed to update customer' }
    }
  }

  async deleteCustomer(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Soft delete
      const now = new Date().toISOString()
      const result = await db.execute('UPDATE customers SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [
        now,
        parseInt(id, 10),
      ])

      if (result.rowsAffected === 0) {
        return { success: false, error: 'Customer not found' }
      }

      return { success: true }
    } catch (error) {
      console.error('Delete customer error:', error)
      return { success: false, error: 'Failed to delete customer' }
    }
  }

  async searchCustomers(query: string): Promise<Customer[]> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const searchTerm = `%${query.toLowerCase()}%`
      const customers = await db.select<DatabaseCustomer[]>(
        `SELECT * FROM customers
         WHERE deleted_at IS NULL
           AND (LOWER(first_name) LIKE ?
            OR LOWER(last_name) LIKE ?
            OR LOWER(company_name) LIKE ?
            OR LOWER(email) LIKE ?
            OR (phone IS NOT NULL AND phone LIKE ?)
            OR (customer_number IS NOT NULL AND customer_number LIKE ?))
         ORDER BY customer_number DESC`,
        [searchTerm, searchTerm, searchTerm, searchTerm, `%${query}%`, `%${query}%`],
      )

      return customers.map((customer) => this.convertDbCustomer(customer))
    } catch (error) {
      console.error('Search customers error:', error)
      throw new Error('Failed to search customers')
    }
  }

  async searchCustomersPaginated(
    query: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    customers: Customer[]
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
      const searchTerm = `%${query.toLowerCase()}%`

      // Get total count for search
      const countResult = await db.select<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM customers
         WHERE deleted_at IS NULL
           AND (LOWER(first_name) LIKE ?
            OR LOWER(last_name) LIKE ?
            OR LOWER(company_name) LIKE ?
            OR LOWER(email) LIKE ?
            OR (phone IS NOT NULL AND phone LIKE ?)
            OR (customer_number IS NOT NULL AND customer_number LIKE ?))`,
        [searchTerm, searchTerm, searchTerm, searchTerm, `%${query}%`, `%${query}%`],
      )
      const totalCount = countResult[0]?.count || 0
      const totalPages = Math.ceil(totalCount / limit)

      // Get paginated search results
      const customers = await db.select<DatabaseCustomer[]>(
        `SELECT * FROM customers
         WHERE deleted_at IS NULL
           AND (LOWER(first_name) LIKE ?
            OR LOWER(last_name) LIKE ?
            OR LOWER(company_name) LIKE ?
            OR LOWER(email) LIKE ?
            OR (phone IS NOT NULL AND phone LIKE ?)
            OR (customer_number IS NOT NULL AND customer_number LIKE ?))
         ORDER BY customer_number DESC LIMIT ? OFFSET ?`,
        [searchTerm, searchTerm, searchTerm, searchTerm, `%${query}%`, `%${query}%`, limit, offset],
      )

      return {
        customers: customers.map((customer) => this.convertDbCustomer(customer)),
        totalCount,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    } catch (error) {
      console.error('Search customers paginated error:', error)
      throw new Error('Failed to search customers with pagination')
    }
  }

  async updateLoyaltyPoints(customerId: string, points: number): Promise<{ success: boolean; error?: string }> {
    try {
      const db = await this.getDatabase()

      const result = await db.execute(
        'UPDATE customers SET loyalty_points = loyalty_points + ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [points, new Date().toISOString(), parseInt(customerId, 10)],
      )

      if (result.rowsAffected === 0) {
        return { success: false, error: 'Customer not found' }
      }

      return { success: true }
    } catch (error) {
      console.error('Update loyalty points error:', error)
      return { success: false, error: 'Failed to update loyalty points' }
    }
  }

  async getTopCustomers(limit: number = 10): Promise<Customer[]> {
    try {
      const db = await this.getDatabase()
      await new Promise((resolve) => setTimeout(resolve, 200))

      const customers = await db.select<DatabaseCustomer[]>(
        'SELECT * FROM customers WHERE deleted_at IS NULL AND is_active = 1 ORDER BY total_purchases DESC, total_orders DESC LIMIT ?',
        [limit],
      )

      return customers.map((customer) => this.convertDbCustomer(customer))
    } catch (error) {
      console.error('Get top customers error:', error)
      throw new Error('Failed to fetch top customers')
    }
  }
}

export const customerService = CustomerService.getInstance()
