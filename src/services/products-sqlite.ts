import Database from '@tauri-apps/plugin-sql'

export interface Product {
  id: string
  name: string
  description: string
  price: number
  cost: number
  stock: number
  category: string
  barcode?: string
  image?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export const PRODUCT_CATEGORIES = [
  'Beverages',
  'Bakery',
  'Coffee & Tea',
  'Dairy',
  'Snacks',
  'Frozen Foods',
  'Fresh Produce',
  'Meat & Poultry',
  'Seafood',
  'Pantry Items',
  'Condiments & Sauces',
  'Breakfast Items',
  'Household Items',
  'Personal Care',
  'Electronics',
  'Other',
] as const

interface DatabaseProduct {
  id: number
  name: string
  description: string
  price: number
  cost: number
  stock: number
  category: string
  barcode?: string
  image?: string
  is_active: number
  created_at: string
  updated_at: string
}

export class ProductService {
  private static instance: ProductService
  private db: Database | null = null

  static getInstance(): ProductService {
    if (!ProductService.instance) {
      ProductService.instance = new ProductService()
    }
    return ProductService.instance
  }

  private async getDatabase(): Promise<Database> {
    if (!this.db) {
      this.db = await Database.load('sqlite:postpos.db')
    }
    return this.db
  }

  private convertDbProduct(dbProduct: DatabaseProduct): Product {
    return {
      id: dbProduct.id.toString(),
      name: dbProduct.name,
      description: dbProduct.description,
      price: dbProduct.price,
      cost: dbProduct.cost,
      stock: dbProduct.stock,
      category: dbProduct.category,
      barcode: dbProduct.barcode,
      image: dbProduct.image,
      isActive: Boolean(dbProduct.is_active),
      createdAt: dbProduct.created_at,
      updatedAt: dbProduct.updated_at,
    }
  }

  async getProducts(): Promise<Product[]> {
    try {
      const db = await this.getDatabase()

      const products = await db.select<DatabaseProduct[]>('SELECT * FROM products ORDER BY name')

      return products.map((product) => this.convertDbProduct(product))
    } catch (error) {
      console.error('Get products error:', error)
      throw new Error('Failed to fetch products')
    }
  }

  async getProductsPaginated(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    products: Product[]
    totalCount: number
    totalPages: number
    currentPage: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }> {
    try {
      const db = await this.getDatabase()

      const offset = (page - 1) * limit

      // Get total count
      const countResult = await db.select<{ count: number }[]>('SELECT COUNT(*) as count FROM products')
      const totalCount = countResult[0]?.count || 0
      const totalPages = Math.ceil(totalCount / limit)

      // Get paginated products
      const products = await db.select<DatabaseProduct[]>('SELECT * FROM products ORDER BY name LIMIT ? OFFSET ?', [
        limit,
        offset,
      ])

      return {
        products: products.map((product) => this.convertDbProduct(product)),
        totalCount,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    } catch (error) {
      console.error('Get paginated products error:', error)
      throw new Error('Failed to fetch paginated products')
    }
  }

  async getProduct(id: string): Promise<Product | null> {
    try {
      const db = await this.getDatabase()

      const products = await db.select<DatabaseProduct[]>('SELECT * FROM products WHERE id = ? LIMIT 1', [
        parseInt(id, 10),
      ])

      if (products.length === 0) {
        return null
      }

      return this.convertDbProduct(products[0])
    } catch (error) {
      console.error('Get product error:', error)
      throw new Error('Failed to fetch product')
    }
  }

  async createProduct(
    productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<{ success: boolean; product?: Product; error?: string }> {
    if (!productData.name.trim()) {
      return { success: false, error: 'Product name is required' }
    }

    if (productData.price <= 0) {
      return { success: false, error: 'Price must be greater than 0' }
    }

    if (productData.cost < 0) {
      return { success: false, error: 'Cost cannot be negative' }
    }

    if (productData.stock < 0) {
      return { success: false, error: 'Stock cannot be negative' }
    }

    try {
      const db = await this.getDatabase()

      if (productData.barcode) {
        const existingBarcode = await db.select<DatabaseProduct[]>(
          'SELECT id FROM products WHERE barcode = ? LIMIT 1',
          [productData.barcode],
        )

        if (existingBarcode.length > 0) {
          return {
            success: false,
            error: 'Product with this barcode already exists',
          }
        }
      }

      const now = new Date().toISOString()
      const result = await db.execute(
        `INSERT INTO products (
          name, description, price, cost, stock, category, barcode, image,
          is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productData.name,
          productData.description,
          productData.price,
          productData.cost,
          productData.stock,
          productData.category,
          productData.barcode || null,
          productData.image || null,
          productData.isActive ? 1 : 0,
          now,
          now,
        ],
      )

      const newProduct: Product = {
        id: (result.lastInsertId ?? 0).toString(),
        name: productData.name,
        description: productData.description,
        price: productData.price,
        cost: productData.cost,
        stock: productData.stock,
        category: productData.category,
        barcode: productData.barcode,
        image: productData.image,
        isActive: productData.isActive,
        createdAt: now,
        updatedAt: now,
      }

      return { success: true, product: newProduct }
    } catch (error) {
      console.error('Create product error:', error)
      return { success: false, error: 'Failed to create product' }
    }
  }

  async updateProduct(
    id: string,
    updates: Partial<Omit<Product, 'id' | 'createdAt'>>,
  ): Promise<{ success: boolean; product?: Product; error?: string }> {
    if (updates.name !== undefined && !updates.name.trim()) {
      return { success: false, error: 'Product name is required' }
    }

    if (updates.price !== undefined && updates.price <= 0) {
      return { success: false, error: 'Price must be greater than 0' }
    }

    if (updates.cost !== undefined && updates.cost < 0) {
      return { success: false, error: 'Cost cannot be negative' }
    }

    if (updates.stock !== undefined && updates.stock < 0) {
      return { success: false, error: 'Stock cannot be negative' }
    }

    try {
      const db = await this.getDatabase()

      const existingProduct = await db.select<DatabaseProduct[]>('SELECT * FROM products WHERE id = ? LIMIT 1', [
        parseInt(id, 10),
      ])

      if (existingProduct.length === 0) {
        return { success: false, error: 'Product not found' }
      }

      if (updates.barcode) {
        const existingBarcode = await db.select<DatabaseProduct[]>(
          'SELECT id FROM products WHERE barcode = ? AND id != ? LIMIT 1',
          [updates.barcode, parseInt(id, 10)],
        )

        if (existingBarcode.length > 0) {
          return {
            success: false,
            error: 'Product with this barcode already exists',
          }
        }
      }

      const updateFields = []
      const updateValues = []

      if (updates.name !== undefined) {
        updateFields.push('name = ?')
        updateValues.push(updates.name)
      }

      if (updates.description !== undefined) {
        updateFields.push('description = ?')
        updateValues.push(updates.description)
      }

      if (updates.price !== undefined) {
        updateFields.push('price = ?')
        updateValues.push(updates.price)
      }

      if (updates.cost !== undefined) {
        updateFields.push('cost = ?')
        updateValues.push(updates.cost)
      }

      if (updates.stock !== undefined) {
        updateFields.push('stock = ?')
        updateValues.push(updates.stock)
      }

      if (updates.category !== undefined) {
        updateFields.push('category = ?')
        updateValues.push(updates.category)
      }

      if (updates.barcode !== undefined) {
        updateFields.push('barcode = ?')
        updateValues.push(updates.barcode || null)
      }

      if (updates.image !== undefined) {
        updateFields.push('image = ?')
        updateValues.push(updates.image || null)
      }

      if (updates.isActive !== undefined) {
        updateFields.push('is_active = ?')
        updateValues.push(updates.isActive ? 1 : 0)
      }

      updateFields.push('updated_at = ?')
      updateValues.push(new Date().toISOString())
      updateValues.push(parseInt(id, 10))

      if (updateFields.length > 1) {
        // More than just updated_at
        await db.execute(`UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`, updateValues)
      }

      const updatedProduct = await db.select<DatabaseProduct[]>('SELECT * FROM products WHERE id = ? LIMIT 1', [
        parseInt(id, 10),
      ])

      return {
        success: true,
        product: this.convertDbProduct(updatedProduct[0]),
      }
    } catch (error) {
      console.error('Update product error:', error)
      return { success: false, error: 'Failed to update product' }
    }
  }

  async deleteProduct(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = await this.getDatabase()

      const result = await db.execute('DELETE FROM products WHERE id = ?', [parseInt(id, 10)])

      if (result.rowsAffected === 0) {
        return { success: false, error: 'Product not found' }
      }

      return { success: true }
    } catch (error) {
      console.error('Delete product error:', error)
      return { success: false, error: 'Failed to delete product' }
    }
  }

  async searchProducts(query: string): Promise<Product[]> {
    try {
      const db = await this.getDatabase()

      const searchTerm = `%${query.toLowerCase()}%`
      const products = await db.select<DatabaseProduct[]>(
        `SELECT * FROM products 
         WHERE LOWER(name) LIKE ? 
            OR LOWER(description) LIKE ? 
            OR LOWER(category) LIKE ?
            OR (barcode IS NOT NULL AND barcode LIKE ?)
         ORDER BY name`,
        [searchTerm, searchTerm, searchTerm, `%${query}%`],
      )

      return products.map((product) => this.convertDbProduct(product))
    } catch (error) {
      console.error('Search products error:', error)
      throw new Error('Failed to search products')
    }
  }

  async searchProductsPaginated(
    query: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    products: Product[]
    totalCount: number
    totalPages: number
    currentPage: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }> {
    try {
      const db = await this.getDatabase()

      const offset = (page - 1) * limit
      const searchTerm = `%${query.toLowerCase()}%`

      // Get total count for search
      const countResult = await db.select<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM products 
         WHERE LOWER(name) LIKE ? 
            OR LOWER(description) LIKE ? 
            OR LOWER(category) LIKE ?
            OR (barcode IS NOT NULL AND barcode LIKE ?)`,
        [searchTerm, searchTerm, searchTerm, `%${query}%`],
      )
      const totalCount = countResult[0]?.count || 0
      const totalPages = Math.ceil(totalCount / limit)

      // Get paginated search results
      const products = await db.select<DatabaseProduct[]>(
        `SELECT * FROM products 
         WHERE LOWER(name) LIKE ? 
            OR LOWER(description) LIKE ? 
            OR LOWER(category) LIKE ?
            OR (barcode IS NOT NULL AND barcode LIKE ?)
         ORDER BY name LIMIT ? OFFSET ?`,
        [searchTerm, searchTerm, searchTerm, `%${query}%`, limit, offset],
      )

      return {
        products: products.map((product) => this.convertDbProduct(product)),
        totalCount,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    } catch (error) {
      console.error('Search products paginated error:', error)
      throw new Error('Failed to search products with pagination')
    }
  }

  async getCategories(): Promise<string[]> {
    try {
      const db = await this.getDatabase()

      const categories = await db.select<{ category: string }[]>(
        'SELECT DISTINCT category FROM products ORDER BY category',
      )

      return categories.map((c) => c.category)
    } catch (error) {
      console.error('Get categories error:', error)
      // Return default categories if database query fails
      return PRODUCT_CATEGORIES.slice()
    }
  }

  async getProductsByCategory(category: string): Promise<Product[]> {
    try {
      const db = await this.getDatabase()

      const products = await db.select<DatabaseProduct[]>('SELECT * FROM products WHERE category = ? ORDER BY name', [
        category,
      ])

      return products.map((product) => this.convertDbProduct(product))
    } catch (error) {
      console.error('Get products by category error:', error)
      throw new Error('Failed to fetch products by category')
    }
  }

  async getLowStockProducts(threshold: number = 10): Promise<Product[]> {
    try {
      const db = await this.getDatabase()

      const products = await db.select<DatabaseProduct[]>(
        'SELECT * FROM products WHERE stock <= ? AND is_active = 1 ORDER BY stock ASC, name',
        [threshold],
      )

      return products.map((product) => this.convertDbProduct(product))
    } catch (error) {
      console.error('Get low stock products error:', error)
      throw new Error('Failed to fetch low stock products')
    }
  }
}

export const productService = ProductService.getInstance()
