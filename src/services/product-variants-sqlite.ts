import Database from '@tauri-apps/plugin-sql'

// Types
export interface ProductAttribute {
  id: string
  name: string
  slug: string
  values: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ProductVariant {
  id: string
  parentProductId: string
  sku?: string
  barcode?: string
  price: number
  cost: number
  stock: number
  attributes: Record<string, string>
  image?: string
  isActive: boolean
  position: number
  createdAt: string
  updatedAt: string
}

export interface ProductVariantSettings {
  id: string
  productId: string
  hasVariants: boolean
  attributeIds: string[]
  variantNameTemplate?: string
  pricingStrategy: 'individual' | 'parent' | 'formula'
  priceAdjustmentFormula?: string
  stockStrategy: 'individual' | 'sum' | 'parent'
  createdAt: string
  updatedAt: string
}

// Input types (without auto-generated fields)
export type ProductAttributeInput = Omit<ProductAttribute, 'id' | 'createdAt' | 'updatedAt'>
export type ProductVariantInput = Omit<ProductVariant, 'id' | 'createdAt' | 'updatedAt'>
export type ProductVariantSettingsInput = Omit<ProductVariantSettings, 'id' | 'createdAt' | 'updatedAt'>

// Database types
interface DatabaseProductAttribute {
  id: number
  name: string
  slug: string
  values: string
  is_active: number
  created_at: string
  updated_at: string
}

interface DatabaseProductVariant {
  id: number
  parent_product_id: number
  sku: string | null
  barcode: string | null
  price: number
  cost: number
  stock: number
  attributes: string
  image: string | null
  is_active: number
  position: number
  created_at: string
  updated_at: string
}

interface DatabaseProductVariantSettings {
  id: number
  product_id: number
  has_variants: number
  attribute_ids: string
  variant_name_template: string | null
  pricing_strategy: string
  price_adjustment_formula: string | null
  stock_strategy: string
  created_at: string
  updated_at: string
}

// Service class
export class ProductVariantsService {
  private static instance: ProductVariantsService
  private db: Database | null = null
  private attributesCache: ProductAttribute[] | null = null
  private cacheExpiry: number = 0
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  static getInstance(): ProductVariantsService {
    if (!ProductVariantsService.instance) {
      ProductVariantsService.instance = new ProductVariantsService()
    }
    return ProductVariantsService.instance
  }

  private async getDatabase(): Promise<Database> {
    if (!this.db) {
      this.db = await Database.load('sqlite:postpos.db')
    }
    return this.db
  }

  // Converters
  private convertDbAttribute(dbAttr: DatabaseProductAttribute): ProductAttribute {
    return {
      id: dbAttr.id.toString(),
      name: dbAttr.name,
      slug: dbAttr.slug,
      values: JSON.parse(dbAttr.values),
      isActive: Boolean(dbAttr.is_active),
      createdAt: dbAttr.created_at,
      updatedAt: dbAttr.updated_at,
    }
  }

  private convertDbVariant(dbVariant: DatabaseProductVariant): ProductVariant {
    return {
      id: dbVariant.id.toString(),
      parentProductId: dbVariant.parent_product_id.toString(),
      sku: dbVariant.sku || undefined,
      barcode: dbVariant.barcode || undefined,
      price: dbVariant.price,
      cost: dbVariant.cost,
      stock: dbVariant.stock,
      attributes: JSON.parse(dbVariant.attributes),
      image: dbVariant.image || undefined,
      isActive: Boolean(dbVariant.is_active),
      position: dbVariant.position,
      createdAt: dbVariant.created_at,
      updatedAt: dbVariant.updated_at,
    }
  }

  private convertDbVariantSettings(
    dbSettings: DatabaseProductVariantSettings,
  ): ProductVariantSettings {
    return {
      id: dbSettings.id.toString(),
      productId: dbSettings.product_id.toString(),
      hasVariants: Boolean(dbSettings.has_variants),
      attributeIds: JSON.parse(dbSettings.attribute_ids),
      variantNameTemplate: dbSettings.variant_name_template || undefined,
      pricingStrategy: dbSettings.pricing_strategy as ProductVariantSettings['pricingStrategy'],
      priceAdjustmentFormula: dbSettings.price_adjustment_formula || undefined,
      stockStrategy: dbSettings.stock_strategy as ProductVariantSettings['stockStrategy'],
      createdAt: dbSettings.created_at,
      updatedAt: dbSettings.updated_at,
    }
  }

  // Clear cache
  clearCache(): void {
    this.attributesCache = null
    this.cacheExpiry = 0
  }

  // ==================== ProductAttribute Methods ====================

  async getAttributes(useCache = true): Promise<ProductAttribute[]> {
    try {
      // Check cache first
      if (useCache && this.attributesCache && Date.now() < this.cacheExpiry) {
        return this.attributesCache
      }

      const db = await this.getDatabase()
      const attributes = await db.select<DatabaseProductAttribute[]>(
        'SELECT * FROM product_attributes WHERE is_active = 1 ORDER BY name',
      )

      const result = attributes.map((attr) => this.convertDbAttribute(attr))

      // Update cache
      if (useCache) {
        this.attributesCache = result
        this.cacheExpiry = Date.now() + this.CACHE_TTL
      }

      return result
    } catch (error) {
      console.error('Get attributes error:', error)
      throw new Error('Failed to fetch product attributes')
    }
  }

  async getAttribute(id: string): Promise<ProductAttribute | null> {
    try {
      const db = await this.getDatabase()
      const attributes = await db.select<DatabaseProductAttribute[]>(
        'SELECT * FROM product_attributes WHERE id = ? LIMIT 1',
        [parseInt(id, 10)],
      )

      if (attributes.length === 0) {
        return null
      }

      return this.convertDbAttribute(attributes[0])
    } catch (error) {
      console.error('Get attribute error:', error)
      throw new Error('Failed to fetch product attribute')
    }
  }

  async getAttributeBySlug(slug: string): Promise<ProductAttribute | null> {
    try {
      const db = await this.getDatabase()
      const attributes = await db.select<DatabaseProductAttribute[]>(
        'SELECT * FROM product_attributes WHERE slug = ? LIMIT 1',
        [slug],
      )

      if (attributes.length === 0) {
        return null
      }

      return this.convertDbAttribute(attributes[0])
    } catch (error) {
      console.error('Get attribute by slug error:', error)
      throw new Error('Failed to fetch product attribute')
    }
  }

  async createAttribute(
    attributeData: ProductAttributeInput,
  ): Promise<{ success: boolean; attribute?: ProductAttribute; error?: string }> {
    if (!attributeData.name.trim()) {
      return { success: false, error: 'Attribute name is required' }
    }

    if (!attributeData.slug.trim()) {
      return { success: false, error: 'Attribute slug is required' }
    }

    if (!attributeData.values || attributeData.values.length === 0) {
      return { success: false, error: 'Attribute values are required' }
    }

    // Validate slug format (alphanumeric and hyphens only)
    if (!/^[a-z0-9-]+$/.test(attributeData.slug)) {
      return { success: false, error: 'Slug must contain only lowercase letters, numbers, and hyphens' }
    }

    try {
      const db = await this.getDatabase()

      // Check for duplicate name
      const existingName = await db.select<DatabaseProductAttribute[]>(
        'SELECT id FROM product_attributes WHERE name = ? LIMIT 1',
        [attributeData.name],
      )

      if (existingName.length > 0) {
        return { success: false, error: 'Attribute with this name already exists' }
      }

      // Check for duplicate slug
      const existingSlug = await db.select<DatabaseProductAttribute[]>(
        'SELECT id FROM product_attributes WHERE slug = ? LIMIT 1',
        [attributeData.slug],
      )

      if (existingSlug.length > 0) {
        return { success: false, error: 'Attribute with this slug already exists' }
      }

      const now = new Date().toISOString()
      const result = await db.execute(
        `INSERT INTO product_attributes (name, slug, values, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          attributeData.name,
          attributeData.slug,
          JSON.stringify(attributeData.values),
          attributeData.isActive ? 1 : 0,
          now,
          now,
        ],
      )

      const newAttribute: ProductAttribute = {
        id: (result.lastInsertId ?? 0).toString(),
        name: attributeData.name,
        slug: attributeData.slug,
        values: attributeData.values,
        isActive: attributeData.isActive,
        createdAt: now,
        updatedAt: now,
      }

      // Clear cache
      this.clearCache()

      return { success: true, attribute: newAttribute }
    } catch (error) {
      console.error('Create attribute error:', error)
      return { success: false, error: 'Failed to create product attribute' }
    }
  }

  async updateAttribute(
    id: string,
    updates: Partial<ProductAttributeInput>,
  ): Promise<{ success: boolean; attribute?: ProductAttribute; error?: string }> {
    if (updates.name !== undefined && !updates.name.trim()) {
      return { success: false, error: 'Attribute name is required' }
    }

    if (updates.slug !== undefined && !updates.slug.trim()) {
      return { success: false, error: 'Attribute slug is required' }
    }

    if (updates.slug !== undefined && !/^[a-z0-9-]+$/.test(updates.slug)) {
      return { success: false, error: 'Slug must contain only lowercase letters, numbers, and hyphens' }
    }

    if (updates.values !== undefined && updates.values.length === 0) {
      return { success: false, error: 'Attribute values are required' }
    }

    try {
      const db = await this.getDatabase()

      const existingAttribute = await db.select<DatabaseProductAttribute[]>(
        'SELECT * FROM product_attributes WHERE id = ? LIMIT 1',
        [parseInt(id, 10)],
      )

      if (existingAttribute.length === 0) {
        return { success: false, error: 'Attribute not found' }
      }

      // Check for duplicate name
      if (updates.name !== undefined) {
        const existingName = await db.select<DatabaseProductAttribute[]>(
          'SELECT id FROM product_attributes WHERE name = ? AND id != ? LIMIT 1',
          [updates.name, parseInt(id, 10)],
        )

        if (existingName.length > 0) {
          return { success: false, error: 'Attribute with this name already exists' }
        }
      }

      // Check for duplicate slug
      if (updates.slug !== undefined) {
        const existingSlug = await db.select<DatabaseProductAttribute[]>(
          'SELECT id FROM product_attributes WHERE slug = ? AND id != ? LIMIT 1',
          [updates.slug, parseInt(id, 10)],
        )

        if (existingSlug.length > 0) {
          return { success: false, error: 'Attribute with this slug already exists' }
        }
      }

      const updateFields = []
      const updateValues = []

      if (updates.name !== undefined) {
        updateFields.push('name = ?')
        updateValues.push(updates.name)
      }

      if (updates.slug !== undefined) {
        updateFields.push('slug = ?')
        updateValues.push(updates.slug)
      }

      if (updates.values !== undefined) {
        updateFields.push('values = ?')
        updateValues.push(JSON.stringify(updates.values))
      }

      if (updates.isActive !== undefined) {
        updateFields.push('is_active = ?')
        updateValues.push(updates.isActive ? 1 : 0)
      }

      updateFields.push('updated_at = ?')
      updateValues.push(new Date().toISOString())
      updateValues.push(parseInt(id, 10))

      if (updateFields.length > 1) {
        await db.execute(
          `UPDATE product_attributes SET ${updateFields.join(', ')} WHERE id = ?`,
          updateValues,
        )
      }

      const updatedAttribute = await db.select<DatabaseProductAttribute[]>(
        'SELECT * FROM product_attributes WHERE id = ? LIMIT 1',
        [parseInt(id, 10)],
      )

      // Clear cache
      this.clearCache()

      return {
        success: true,
        attribute: this.convertDbAttribute(updatedAttribute[0]),
      }
    } catch (error) {
      console.error('Update attribute error:', error)
      return { success: false, error: 'Failed to update product attribute' }
    }
  }

  async deleteAttribute(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = await this.getDatabase()

      // Check if attribute is used in any variant settings
      const settings = await db.select<DatabaseProductVariantSettings[]>(
        "SELECT * FROM product_variant_settings WHERE attribute_ids LIKE '%\"' || ? || '\"%'",
        [id],
      )

      if (settings.length > 0) {
        return {
          success: false,
          error: 'Cannot delete attribute that is in use by product variants',
        }
      }

      const result = await db.execute('DELETE FROM product_attributes WHERE id = ?', [
        parseInt(id, 10),
      ])

      if (result.rowsAffected === 0) {
        return { success: false, error: 'Attribute not found' }
      }

      // Clear cache
      this.clearCache()

      return { success: true }
    } catch (error) {
      console.error('Delete attribute error:', error)
      return { success: false, error: 'Failed to delete product attribute' }
    }
  }

  // ==================== ProductVariant Methods ====================

  async getVariants(parentProductId: string): Promise<ProductVariant[]> {
    try {
      const db = await this.getDatabase()
      const variants = await db.select<DatabaseProductVariant[]>(
        'SELECT * FROM product_variants WHERE parent_product_id = ? ORDER BY position, id',
        [parseInt(parentProductId, 10)],
      )

      return variants.map((variant) => this.convertDbVariant(variant))
    } catch (error) {
      console.error('Get variants error:', error)
      throw new Error('Failed to fetch product variants')
    }
  }

  async getVariant(id: string): Promise<ProductVariant | null> {
    try {
      const db = await this.getDatabase()
      const variants = await db.select<DatabaseProductVariant[]>(
        'SELECT * FROM product_variants WHERE id = ? LIMIT 1',
        [parseInt(id, 10)],
      )

      if (variants.length === 0) {
        return null
      }

      return this.convertDbVariant(variants[0])
    } catch (error) {
      console.error('Get variant error:', error)
      throw new Error('Failed to fetch product variant')
    }
  }

  async getVariantBySku(sku: string): Promise<ProductVariant | null> {
    try {
      const db = await this.getDatabase()
      const variants = await db.select<DatabaseProductVariant[]>(
        'SELECT * FROM product_variants WHERE sku = ? LIMIT 1',
        [sku],
      )

      if (variants.length === 0) {
        return null
      }

      return this.convertDbVariant(variants[0])
    } catch (error) {
      console.error('Get variant by SKU error:', error)
      throw new Error('Failed to fetch product variant')
    }
  }

  async getVariantByBarcode(barcode: string): Promise<ProductVariant | null> {
    try {
      const db = await this.getDatabase()
      const variants = await db.select<DatabaseProductVariant[]>(
        'SELECT * FROM product_variants WHERE barcode = ? LIMIT 1',
        [barcode],
      )

      if (variants.length === 0) {
        return null
      }

      return this.convertDbVariant(variants[0])
    } catch (error) {
      console.error('Get variant by barcode error:', error)
      throw new Error('Failed to fetch product variant')
    }
  }

  async createVariant(
    variantData: ProductVariantInput,
  ): Promise<{ success: boolean; variant?: ProductVariant; error?: string }> {
    if (!variantData.parentProductId) {
      return { success: false, error: 'Parent product ID is required' }
    }

    if (variantData.price <= 0) {
      return { success: false, error: 'Price must be greater than 0' }
    }

    if (variantData.cost < 0) {
      return { success: false, error: 'Cost cannot be negative' }
    }

    if (variantData.stock < 0) {
      return { success: false, error: 'Stock cannot be negative' }
    }

    if (Object.keys(variantData.attributes).length === 0) {
      return { success: false, error: 'Variant must have at least one attribute' }
    }

    try {
      const db = await this.getDatabase()

      // Check for duplicate SKU
      if (variantData.sku) {
        const existingSku = await db.select<DatabaseProductVariant[]>(
          'SELECT id FROM product_variants WHERE sku = ? LIMIT 1',
          [variantData.sku],
        )

        if (existingSku.length > 0) {
          return { success: false, error: 'Variant with this SKU already exists' }
        }
      }

      // Check for duplicate barcode
      if (variantData.barcode) {
        const existingBarcode = await db.select<DatabaseProductVariant[]>(
          'SELECT id FROM product_variants WHERE barcode = ? LIMIT 1',
          [variantData.barcode],
        )

        if (existingBarcode.length > 0) {
          return { success: false, error: 'Variant with this barcode already exists' }
        }
      }

      const now = new Date().toISOString()
      const result = await db.execute(
        `INSERT INTO product_variants (
          parent_product_id, sku, barcode, price, cost, stock, attributes,
          image, is_active, position, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parseInt(variantData.parentProductId, 10),
          variantData.sku || null,
          variantData.barcode || null,
          variantData.price,
          variantData.cost,
          variantData.stock,
          JSON.stringify(variantData.attributes),
          variantData.image || null,
          variantData.isActive ? 1 : 0,
          variantData.position,
          now,
          now,
        ],
      )

      const newVariant: ProductVariant = {
        id: (result.lastInsertId ?? 0).toString(),
        ...variantData,
        createdAt: now,
        updatedAt: now,
      }

      return { success: true, variant: newVariant }
    } catch (error) {
      console.error('Create variant error:', error)
      return { success: false, error: 'Failed to create product variant' }
    }
  }

  async updateVariant(
    id: string,
    updates: Partial<ProductVariantInput>,
  ): Promise<{ success: boolean; variant?: ProductVariant; error?: string }> {
    if (updates.price !== undefined && updates.price <= 0) {
      return { success: false, error: 'Price must be greater than 0' }
    }

    if (updates.cost !== undefined && updates.cost < 0) {
      return { success: false, error: 'Cost cannot be negative' }
    }

    if (updates.stock !== undefined && updates.stock < 0) {
      return { success: false, error: 'Stock cannot be negative' }
    }

    if (updates.attributes !== undefined && Object.keys(updates.attributes).length === 0) {
      return { success: false, error: 'Variant must have at least one attribute' }
    }

    try {
      const db = await this.getDatabase()

      const existingVariant = await db.select<DatabaseProductVariant[]>(
        'SELECT * FROM product_variants WHERE id = ? LIMIT 1',
        [parseInt(id, 10)],
      )

      if (existingVariant.length === 0) {
        return { success: false, error: 'Variant not found' }
      }

      // Check for duplicate SKU
      if (updates.sku !== undefined) {
        const existingSku = await db.select<DatabaseProductVariant[]>(
          'SELECT id FROM product_variants WHERE sku = ? AND id != ? LIMIT 1',
          [updates.sku, parseInt(id, 10)],
        )

        if (existingSku.length > 0) {
          return { success: false, error: 'Variant with this SKU already exists' }
        }
      }

      // Check for duplicate barcode
      if (updates.barcode !== undefined) {
        const existingBarcode = await db.select<DatabaseProductVariant[]>(
          'SELECT id FROM product_variants WHERE barcode = ? AND id != ? LIMIT 1',
          [updates.barcode, parseInt(id, 10)],
        )

        if (existingBarcode.length > 0) {
          return { success: false, error: 'Variant with this barcode already exists' }
        }
      }

      const updateFields = []
      const updateValues = []

      if (updates.parentProductId !== undefined) {
        updateFields.push('parent_product_id = ?')
        updateValues.push(parseInt(updates.parentProductId, 10))
      }

      if (updates.sku !== undefined) {
        updateFields.push('sku = ?')
        updateValues.push(updates.sku || null)
      }

      if (updates.barcode !== undefined) {
        updateFields.push('barcode = ?')
        updateValues.push(updates.barcode || null)
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

      if (updates.attributes !== undefined) {
        updateFields.push('attributes = ?')
        updateValues.push(JSON.stringify(updates.attributes))
      }

      if (updates.image !== undefined) {
        updateFields.push('image = ?')
        updateValues.push(updates.image || null)
      }

      if (updates.isActive !== undefined) {
        updateFields.push('is_active = ?')
        updateValues.push(updates.isActive ? 1 : 0)
      }

      if (updates.position !== undefined) {
        updateFields.push('position = ?')
        updateValues.push(updates.position)
      }

      updateFields.push('updated_at = ?')
      updateValues.push(new Date().toISOString())
      updateValues.push(parseInt(id, 10))

      if (updateFields.length > 1) {
        await db.execute(`UPDATE product_variants SET ${updateFields.join(', ')} WHERE id = ?`, updateValues)
      }

      const updatedVariant = await db.select<DatabaseProductVariant[]>(
        'SELECT * FROM product_variants WHERE id = ? LIMIT 1',
        [parseInt(id, 10)],
      )

      return {
        success: true,
        variant: this.convertDbVariant(updatedVariant[0]),
      }
    } catch (error) {
      console.error('Update variant error:', error)
      return { success: false, error: 'Failed to update product variant' }
    }
  }

  async deleteVariant(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = await this.getDatabase()

      const result = await db.execute('DELETE FROM product_variants WHERE id = ?', [parseInt(id, 10)])

      if (result.rowsAffected === 0) {
        return { success: false, error: 'Variant not found' }
      }

      return { success: true }
    } catch (error) {
      console.error('Delete variant error:', error)
      return { success: false, error: 'Failed to delete product variant' }
    }
  }

  async updateVariantStock(id: string, quantity: number): Promise<{ success: boolean; error?: string }> {
    try {
      const db = await this.getDatabase()

      const result = await db.execute(
        'UPDATE product_variants SET stock = stock + ?, updated_at = ? WHERE id = ?',
        [quantity, new Date().toISOString(), parseInt(id, 10)],
      )

      if (result.rowsAffected === 0) {
        return { success: false, error: 'Variant not found' }
      }

      return { success: true }
    } catch (error) {
      console.error('Update variant stock error:', error)
      return { success: false, error: 'Failed to update variant stock' }
    }
  }

  /**
   * Generate all variant combinations from attribute selections
   * @param productId Parent product ID
   * @param attributeCombinations Object mapping attribute IDs to selected values
   * @param baseVariant Base variant data for pricing and stock
   */
  async generateVariants(
    productId: string,
    attributeCombinations: Record<string, string[]>,
    baseVariant: {
      price: number
      cost: number
      stock: number
    },
  ): Promise<{ success: boolean; variants?: ProductVariant[]; error?: string }> {
    if (Object.keys(attributeCombinations).length === 0) {
      return { success: false, error: 'At least one attribute must be selected' }
    }

    try {
      const db = await this.getDatabase()

      // Get attribute details for building variant attributes
      const attributeIds = Object.keys(attributeCombinations)
      const attributes: ProductAttribute[] = []

      for (const attrId of attributeIds) {
        const attr = await this.getAttribute(attrId)
        if (attr) {
          attributes.push(attr)
        }
      }

      // Generate all combinations
      const combinations = this.generateAttributeCombinations(attributeCombinations)

      if (combinations.length === 0) {
        return { success: false, error: 'No valid combinations could be generated' }
      }

      const createdVariants: ProductVariant[] = []
      const now = new Date().toISOString()

      for (const combination of combinations) {
        // Build attributes object
        const attributesObj: Record<string, string> = {}
        for (const attr of attributes) {
          const valueId = combination[attr.id]
          if (valueId) {
            // Find value by index in attribute values array
            const valueIndex = attributeCombinations[attr.id].indexOf(valueId)
            if (valueIndex !== -1) {
              attributesObj[attr.slug] = valueId
            }
          }
        }

        // Generate SKU from attributes
        const skuSuffix = Object.values(attributesObj).join('-')
        const sku = `${productId}-${skuSuffix.toLowerCase().replace(/\s+/g, '-')}`

        // Create variant
        const result = await this.createVariant({
          parentProductId: productId,
          sku,
          price: baseVariant.price,
          cost: baseVariant.cost,
          stock: baseVariant.stock,
          attributes: attributesObj,
          isActive: true,
          position: createdVariants.length,
        })

        if (result.success && result.variant) {
          createdVariants.push(result.variant)
        }
      }

      return { success: true, variants: createdVariants }
    } catch (error) {
      console.error('Generate variants error:', error)
      return { success: false, error: 'Failed to generate product variants' }
    }
  }

  /**
   * Generate all combinations of attribute values
   * @param selections Object mapping attribute IDs to arrays of selected values
   * @returns Array of combination objects
   */
  private generateAttributeCombinations(selections: Record<string, string[]>): Record<string, string>[] {
    const attributeIds = Object.keys(selections)
    if (attributeIds.length === 0) return []

    const combinations: Record<string, string>[] = []

    const generate = (index: number, current: Record<string, string>) => {
      if (index === attributeIds.length) {
        combinations.push({ ...current })
        return
      }

      const attrId = attributeIds[index]
      const values = selections[attrId]

      for (const value of values) {
        current[attrId] = value
        generate(index + 1, current)
        delete current[attrId]
      }
    }

    generate(0, {})

    return combinations
  }

  // ==================== ProductVariantSettings Methods ====================

  async getVariantSettings(productId: string): Promise<ProductVariantSettings | null> {
    try {
      const db = await this.getDatabase()
      const settings = await db.select<DatabaseProductVariantSettings[]>(
        'SELECT * FROM product_variant_settings WHERE product_id = ? LIMIT 1',
        [parseInt(productId, 10)],
      )

      if (settings.length === 0) {
        return null
      }

      return this.convertDbVariantSettings(settings[0])
    } catch (error) {
      console.error('Get variant settings error:', error)
      throw new Error('Failed to fetch product variant settings')
    }
  }

  async createVariantSettings(
    settingsData: ProductVariantSettingsInput,
  ): Promise<{ success: boolean; settings?: ProductVariantSettings; error?: string }> {
    if (!settingsData.productId) {
      return { success: false, error: 'Product ID is required' }
    }

    if (!Array.isArray(settingsData.attributeIds)) {
      return { success: false, error: 'Attribute IDs must be an array' }
    }

    try {
      const db = await this.getDatabase()

      // Check if settings already exist
      const existing = await db.select<DatabaseProductVariantSettings[]>(
        'SELECT id FROM product_variant_settings WHERE product_id = ? LIMIT 1',
        [parseInt(settingsData.productId, 10)],
      )

      if (existing.length > 0) {
        return { success: false, error: 'Variant settings already exist for this product' }
      }

      const now = new Date().toISOString()
      const result = await db.execute(
        `INSERT INTO product_variant_settings (
          product_id, has_variants, attribute_ids, variant_name_template,
          pricing_strategy, price_adjustment_formula, stock_strategy, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parseInt(settingsData.productId, 10),
          settingsData.hasVariants ? 1 : 0,
          JSON.stringify(settingsData.attributeIds),
          settingsData.variantNameTemplate || null,
          settingsData.pricingStrategy,
          settingsData.priceAdjustmentFormula || null,
          settingsData.stockStrategy,
          now,
          now,
        ],
      )

      const newSettings: ProductVariantSettings = {
        id: (result.lastInsertId ?? 0).toString(),
        ...settingsData,
        createdAt: now,
        updatedAt: now,
      }

      return { success: true, settings: newSettings }
    } catch (error) {
      console.error('Create variant settings error:', error)
      return { success: false, error: 'Failed to create product variant settings' }
    }
  }

  async updateVariantSettings(
    productId: string,
    updates: Partial<Omit<ProductVariantSettingsInput, 'productId'>>,
  ): Promise<{ success: boolean; settings?: ProductVariantSettings; error?: string }> {
    try {
      const db = await this.getDatabase()

      const existingSettings = await db.select<DatabaseProductVariantSettings[]>(
        'SELECT * FROM product_variant_settings WHERE product_id = ? LIMIT 1',
        [parseInt(productId, 10)],
      )

      if (existingSettings.length === 0) {
        return { success: false, error: 'Variant settings not found for this product' }
      }

      const updateFields = []
      const updateValues = []

      if (updates.hasVariants !== undefined) {
        updateFields.push('has_variants = ?')
        updateValues.push(updates.hasVariants ? 1 : 0)
      }

      if (updates.attributeIds !== undefined) {
        updateFields.push('attribute_ids = ?')
        updateValues.push(JSON.stringify(updates.attributeIds))
      }

      if (updates.variantNameTemplate !== undefined) {
        updateFields.push('variant_name_template = ?')
        updateValues.push(updates.variantNameTemplate || null)
      }

      if (updates.pricingStrategy !== undefined) {
        updateFields.push('pricing_strategy = ?')
        updateValues.push(updates.pricingStrategy)
      }

      if (updates.priceAdjustmentFormula !== undefined) {
        updateFields.push('price_adjustment_formula = ?')
        updateValues.push(updates.priceAdjustmentFormula || null)
      }

      if (updates.stockStrategy !== undefined) {
        updateFields.push('stock_strategy = ?')
        updateValues.push(updates.stockStrategy)
      }

      updateFields.push('updated_at = ?')
      updateValues.push(new Date().toISOString())
      updateValues.push(parseInt(productId, 10))

      if (updateFields.length > 1) {
        await db.execute(
          `UPDATE product_variant_settings SET ${updateFields.join(', ')} WHERE product_id = ?`,
          updateValues,
        )
      }

      const updatedSettings = await db.select<DatabaseProductVariantSettings[]>(
        'SELECT * FROM product_variant_settings WHERE product_id = ? LIMIT 1',
        [parseInt(productId, 10)],
      )

      return {
        success: true,
        settings: this.convertDbVariantSettings(updatedSettings[0]),
      }
    } catch (error) {
      console.error('Update variant settings error:', error)
      return { success: false, error: 'Failed to update product variant settings' }
    }
  }

  async deleteVariantSettings(productId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const db = await this.getDatabase()

      const result = await db.execute('DELETE FROM product_variant_settings WHERE product_id = ?', [
        parseInt(productId, 10),
      ])

      if (result.rowsAffected === 0) {
        return { success: false, error: 'Variant settings not found' }
      }

      return { success: true }
    } catch (error) {
      console.error('Delete variant settings error:', error)
      return { success: false, error: 'Failed to delete product variant settings' }
    }
  }
}

// Export singleton instance
export const productVariantsService = ProductVariantsService.getInstance()
