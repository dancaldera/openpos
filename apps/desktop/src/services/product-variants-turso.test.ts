import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductAttributeInput, ProductVariantInput } from './product-variants-turso'

const { execute, query } = vi.hoisted(() => ({
  execute: vi.fn(async (_sql: string, _params: unknown[] = []) => ({ lastInsertId: 0, rowsAffected: 1 })),
  query: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<Array<Record<string, unknown>>> => []),
}))

vi.mock('../lib/db-adapter', () => ({
  execute,
  query,
}))

const { productVariantsService } = await import('./product-variants-turso')

function dbAttribute(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Size',
    slug: 'size',
    values: JSON.stringify(['S', 'M', 'L']),
    is_active: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function dbVariant(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    parent_product_id: 1,
    sku: 'SKU-1',
    barcode: 'V100',
    barcode_normalized: 'V100',
    price: 60,
    cost: 35,
    stock: 5,
    attributes: JSON.stringify({ size: 'M' }),
    image: 'v.jpg',
    is_active: 1,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function dbVariantSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    product_id: 1,
    has_variants: 1,
    attribute_ids: JSON.stringify(['1']),
    variant_name_template: 'T-{size}',
    pricing_strategy: 'individual',
    price_adjustment_formula: null,
    stock_strategy: 'individual',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function attributeInput(overrides: Partial<ProductAttributeInput> = {}): ProductAttributeInput {
  return { name: 'Size', slug: 'size', values: ['S', 'M'], isActive: true, ...overrides }
}

function variantInput(overrides: Partial<ProductVariantInput> = {}): ProductVariantInput {
  return {
    parentProductId: '1',
    price: 60,
    cost: 35,
    stock: 5,
    attributes: { size: 'M' },
    isActive: true,
    position: 0,
    ...overrides,
  }
}

describe('ProductVariantsService attributes', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    query.mockResolvedValue([])
    execute.mockResolvedValue({ lastInsertId: 3, rowsAffected: 1 })
    productVariantsService.clearCache()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('caches attributes until the TTL expires', async () => {
    vi.useFakeTimers()
    try {
      query.mockResolvedValue([dbAttribute()])

      const first = await productVariantsService.getAttributes()
      const second = await productVariantsService.getAttributes()

      expect(first).toHaveLength(1)
      expect(second).toHaveLength(1)
      expect(query).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1)

      await productVariantsService.getAttributes()

      expect(query).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('bypasses the cache on demand', async () => {
    query.mockResolvedValue([dbAttribute()])

    await productVariantsService.getAttributes(false)
    await productVariantsService.getAttributes(false)

    expect(query).toHaveBeenCalledTimes(2)

    await productVariantsService.getAttributes()

    expect(query).toHaveBeenCalledTimes(3)
  })

  it('throws when fetching attributes fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.getAttributes()).rejects.toThrow('Failed to fetch product attributes')
  })

  it('gets an attribute by id or returns null', async () => {
    query.mockResolvedValueOnce([dbAttribute()])

    await expect(productVariantsService.getAttribute('1')).resolves.toMatchObject({ id: '1', slug: 'size' })

    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(productVariantsService.getAttribute('99')).resolves.toBeNull()

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.getAttribute('1')).rejects.toThrow('Failed to fetch product attribute')
  })

  it('gets an attribute by slug or returns null', async () => {
    query.mockResolvedValueOnce([dbAttribute()])

    await expect(productVariantsService.getAttributeBySlug('size')).resolves.toMatchObject({ slug: 'size' })

    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(productVariantsService.getAttributeBySlug('nope')).resolves.toBeNull()

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.getAttributeBySlug('size')).rejects.toThrow('Failed to fetch product attribute')
  })

  it('validates attribute input', async () => {
    await expect(productVariantsService.createAttribute(attributeInput({ name: '  ' }))).resolves.toMatchObject({
      success: false,
      error: 'Attribute name is required',
    })
    await expect(productVariantsService.createAttribute(attributeInput({ slug: '  ' }))).resolves.toMatchObject({
      success: false,
      error: 'Attribute slug is required',
    })
    await expect(productVariantsService.createAttribute(attributeInput({ values: [] }))).resolves.toMatchObject({
      success: false,
      error: 'Attribute values are required',
    })
    await expect(productVariantsService.createAttribute(attributeInput({ slug: 'Bad Slug!' }))).resolves.toMatchObject({
      success: false,
      error: 'Slug must contain only lowercase letters, numbers, and hyphens',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects duplicate attribute names and slugs', async () => {
    query.mockResolvedValueOnce([{ id: 1 }])

    await expect(productVariantsService.createAttribute(attributeInput())).resolves.toMatchObject({
      success: false,
      error: 'Attribute with this name already exists',
    })

    query.mockReset()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 2 }])

    await expect(productVariantsService.createAttribute(attributeInput())).resolves.toMatchObject({
      success: false,
      error: 'Attribute with this slug already exists',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('creates attributes and clears the cache', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const result = await productVariantsService.createAttribute(attributeInput())

    expect(result).toMatchObject({ success: true, attribute: { id: '3', name: 'Size' } })
    expect(execute).toHaveBeenCalled()

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.createAttribute(attributeInput())).resolves.toMatchObject({
      success: false,
      error: 'Failed to create product attribute',
    })
  })

  it('validates attribute updates', async () => {
    await expect(productVariantsService.updateAttribute('1', { name: ' ' })).resolves.toMatchObject({
      success: false,
      error: 'Attribute name is required',
    })
    await expect(productVariantsService.updateAttribute('1', { slug: ' ' })).resolves.toMatchObject({
      success: false,
      error: 'Attribute slug is required',
    })
    await expect(productVariantsService.updateAttribute('1', { slug: 'Bad!' })).resolves.toMatchObject({
      success: false,
      error: 'Slug must contain only lowercase letters, numbers, and hyphens',
    })
    await expect(productVariantsService.updateAttribute('1', { values: [] })).resolves.toMatchObject({
      success: false,
      error: 'Attribute values are required',
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('returns not found for missing attributes', async () => {
    query.mockResolvedValueOnce([])

    await expect(productVariantsService.updateAttribute('99', { name: 'X' })).resolves.toMatchObject({
      success: false,
      error: 'Attribute not found',
    })
  })

  it('rejects duplicate names and slugs on update', async () => {
    query.mockResolvedValueOnce([dbAttribute()]).mockResolvedValueOnce([{ id: 2 }])

    await expect(productVariantsService.updateAttribute('1', { name: 'Taken' })).resolves.toMatchObject({
      success: false,
      error: 'Attribute with this name already exists',
    })

    query.mockReset()
    query.mockResolvedValueOnce([dbAttribute()]).mockResolvedValueOnce([{ id: 2 }])

    await expect(productVariantsService.updateAttribute('1', { slug: 'taken' })).resolves.toMatchObject({
      success: false,
      error: 'Attribute with this slug already exists',
    })
  })

  it('updates every attribute field', async () => {
    query
      .mockResolvedValueOnce([dbAttribute()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([dbAttribute({ name: 'Talla' })])

    const result = await productVariantsService.updateAttribute('1', {
      name: 'Talla',
      slug: 'talla',
      values: ['XS'],
      isActive: false,
    })

    expect(result).toMatchObject({ success: true, attribute: { name: 'Talla' } })
    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain('UPDATE product_attributes SET')
    expect(params).toContain(0)
  })

  it('skips the update statement when nothing changed', async () => {
    query.mockResolvedValueOnce([dbAttribute()]).mockResolvedValueOnce([dbAttribute()])

    const result = await productVariantsService.updateAttribute('1', {})

    expect(result.success).toBe(true)
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns an error when the attribute update fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.updateAttribute('1', { name: 'X' })).resolves.toMatchObject({
      success: false,
      error: 'Failed to update product attribute',
    })
  })

  it('deletes attributes unless in use', async () => {
    query.mockResolvedValueOnce([])

    await expect(productVariantsService.deleteAttribute('1')).resolves.toEqual({ success: true })

    query.mockReset()
    query.mockResolvedValueOnce([{ id: 1 }])

    await expect(productVariantsService.deleteAttribute('1')).resolves.toMatchObject({
      success: false,
      error: 'Cannot delete attribute that is in use by product variants',
    })

    query.mockReset()
    query.mockResolvedValueOnce([])
    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })

    await expect(productVariantsService.deleteAttribute('99')).resolves.toMatchObject({
      success: false,
      error: 'Attribute not found',
    })

    query.mockReset()
    query.mockResolvedValueOnce([])
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.deleteAttribute('1')).resolves.toMatchObject({
      success: false,
      error: 'Failed to delete product attribute',
    })
  })
})

describe('ProductVariantsService variants', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    query.mockResolvedValue([])
    execute.mockResolvedValue({ lastInsertId: 11, rowsAffected: 1 })
    productVariantsService.clearCache()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('lists variants', async () => {
    query.mockResolvedValueOnce([dbVariant()])

    const variants = await productVariantsService.getVariants('1')

    expect(variants).toHaveLength(1)
    expect(variants[0]).toMatchObject({ id: '10', parentProductId: '1', sku: 'SKU-1' })
    expect(query.mock.calls[0][1]).toEqual([1])
  })

  it('throws when listing variants fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.getVariants('1')).rejects.toThrow('Failed to fetch product variants')
  })

  it('gets a variant by id or returns null', async () => {
    query.mockResolvedValueOnce([dbVariant()])

    await expect(productVariantsService.getVariant('10')).resolves.toMatchObject({ id: '10' })

    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(productVariantsService.getVariant('99')).resolves.toBeNull()

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.getVariant('10')).rejects.toThrow('Failed to fetch product variant')
  })

  it('gets a variant by sku or returns null', async () => {
    query.mockResolvedValueOnce([dbVariant()])

    await expect(productVariantsService.getVariantBySku('SKU-1')).resolves.toMatchObject({ sku: 'SKU-1' })

    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(productVariantsService.getVariantBySku('NOPE')).resolves.toBeNull()

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.getVariantBySku('SKU-1')).rejects.toThrow('Failed to fetch product variant')
  })

  it('gets a variant by barcode', async () => {
    query.mockResolvedValueOnce([dbVariant()])

    await expect(productVariantsService.getVariantByBarcode('V100')).resolves.toMatchObject({ barcode: 'V100' })

    await expect(productVariantsService.getVariantByBarcode('')).resolves.toBeNull()
    await expect(productVariantsService.getVariantByBarcode('   ')).resolves.toBeNull()

    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(productVariantsService.getVariantByBarcode('NOPE')).resolves.toBeNull()

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.getVariantByBarcode('V100')).rejects.toThrow('Failed to fetch product variant')
  })

  it('converts legacy variant rows', async () => {
    query.mockResolvedValueOnce([dbVariant({ sku: null, barcode: null, image: null })])

    const variant = await productVariantsService.getVariant('10')

    expect(variant?.sku).toBeUndefined()
    expect(variant?.barcode).toBeUndefined()
    expect(variant?.image).toBeUndefined()
  })

  it('validates variant input', async () => {
    await expect(productVariantsService.createVariant(variantInput({ parentProductId: '' }))).resolves.toMatchObject({
      success: false,
      error: 'Parent product ID is required',
    })
    await expect(productVariantsService.createVariant(variantInput({ price: 0 }))).resolves.toMatchObject({
      success: false,
      error: 'Price must be greater than 0',
    })
    await expect(productVariantsService.createVariant(variantInput({ cost: -1 }))).resolves.toMatchObject({
      success: false,
      error: 'Cost cannot be negative',
    })
    await expect(productVariantsService.createVariant(variantInput({ stock: -1 }))).resolves.toMatchObject({
      success: false,
      error: 'Stock cannot be negative',
    })
    await expect(productVariantsService.createVariant(variantInput({ attributes: {} }))).resolves.toMatchObject({
      success: false,
      error: 'Variant must have at least one attribute',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects duplicate skus and barcodes', async () => {
    query.mockResolvedValueOnce([{ id: 9 }])

    await expect(
      productVariantsService.createVariant(variantInput({ sku: 'SKU-1', barcode: 'V200' })),
    ).resolves.toMatchObject({ success: false, error: 'Variant with this SKU already exists' })

    query.mockReset()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 9 }])

    await expect(
      productVariantsService.createVariant(variantInput({ sku: 'SKU-2', barcode: 'V200' })),
    ).resolves.toMatchObject({
      success: false,
      error: 'Barcode is already assigned to another product or variant',
    })

    query.mockReset()
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 3 }])

    await expect(
      productVariantsService.createVariant(variantInput({ sku: 'SKU-3', barcode: '750123' })),
    ).resolves.toMatchObject({
      success: false,
      error: 'Barcode is already assigned to another product or variant',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('creates variants with and without sku or barcode', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const result = await productVariantsService.createVariant(variantInput({ sku: 'SKU-9', barcode: ' V900 ' }))

    expect(result).toMatchObject({ success: true, variant: { id: '11', barcode: 'V900' } })
    expect(execute).toHaveBeenCalled()

    query.mockReset()

    const minimal = await productVariantsService.createVariant(variantInput())

    expect(minimal.success).toBe(true)
    expect(query).not.toHaveBeenCalled()
  })

  it('returns an error when variant creation fails', async () => {
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.createVariant(variantInput())).resolves.toMatchObject({
      success: false,
      error: 'Failed to create product variant',
    })
  })

  it('validates variant updates', async () => {
    await expect(productVariantsService.updateVariant('10', { price: 0 })).resolves.toMatchObject({
      success: false,
      error: 'Price must be greater than 0',
    })
    await expect(productVariantsService.updateVariant('10', { cost: -1 })).resolves.toMatchObject({
      success: false,
      error: 'Cost cannot be negative',
    })
    await expect(productVariantsService.updateVariant('10', { stock: -1 })).resolves.toMatchObject({
      success: false,
      error: 'Stock cannot be negative',
    })
    await expect(productVariantsService.updateVariant('10', { attributes: {} })).resolves.toMatchObject({
      success: false,
      error: 'Variant must have at least one attribute',
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('returns not found for missing variants', async () => {
    query.mockResolvedValueOnce([])

    await expect(productVariantsService.updateVariant('99', { price: 10 })).resolves.toMatchObject({
      success: false,
      error: 'Variant not found',
    })
  })

  it('rejects duplicate sku and barcode on update', async () => {
    query.mockResolvedValueOnce([dbVariant()]).mockResolvedValueOnce([{ id: 9 }])

    await expect(productVariantsService.updateVariant('10', { sku: 'SKU-9' })).resolves.toMatchObject({
      success: false,
      error: 'Variant with this SKU already exists',
    })

    query.mockReset()
    query
      .mockResolvedValueOnce([dbVariant()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 9 }])

    await expect(productVariantsService.updateVariant('10', { barcode: 'V999' })).resolves.toMatchObject({
      success: false,
      error: 'Barcode is already assigned to another product or variant',
    })
  })

  it('updates every variant field', async () => {
    query
      .mockResolvedValueOnce([dbVariant()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([dbVariant({ price: 99 })])

    const result = await productVariantsService.updateVariant('10', {
      parentProductId: '2',
      sku: 'SKU-X',
      barcode: 'VX',
      price: 99,
      cost: 40,
      stock: 8,
      attributes: { size: 'L' },
      image: 'new.jpg',
      isActive: false,
      position: 2,
    })

    expect(result).toMatchObject({ success: true, variant: { price: 99 } })
    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain('UPDATE product_variants SET')
    expect(params).toContain(2)
  })

  it('stores null for cleared variant fields', async () => {
    query.mockResolvedValueOnce([dbVariant()]).mockResolvedValueOnce([]).mockResolvedValueOnce([dbVariant()])

    const result = await productVariantsService.updateVariant('10', { sku: '', barcode: '', image: '' })

    expect(result.success).toBe(true)
    const [, params] = execute.mock.calls[0]
    expect(params).toContain(null)
  })

  it('skips the update statement when nothing changed', async () => {
    query.mockResolvedValueOnce([dbVariant()]).mockResolvedValueOnce([dbVariant()])

    const result = await productVariantsService.updateVariant('10', {})

    expect(result.success).toBe(true)
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns an error when the variant update fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.updateVariant('10', { price: 10 })).resolves.toMatchObject({
      success: false,
      error: 'Failed to update product variant',
    })
  })

  it('deletes variants', async () => {
    await expect(productVariantsService.deleteVariant('10')).resolves.toEqual({ success: true })

    execute.mockReset()
    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })

    await expect(productVariantsService.deleteVariant('99')).resolves.toMatchObject({
      success: false,
      error: 'Variant not found',
    })

    execute.mockReset()
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.deleteVariant('10')).resolves.toMatchObject({
      success: false,
      error: 'Failed to delete product variant',
    })
  })

  it('updates variant stock relatively', async () => {
    await expect(productVariantsService.updateVariantStock('10', -2)).resolves.toEqual({ success: true })
    expect(execute.mock.calls[0][1]).toEqual([expect.any(Number), expect.any(String), 10])

    execute.mockReset()
    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })

    await expect(productVariantsService.updateVariantStock('99', 1)).resolves.toMatchObject({
      success: false,
      error: 'Variant not found',
    })

    execute.mockReset()
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.updateVariantStock('10', 1)).resolves.toMatchObject({
      success: false,
      error: 'Failed to update variant stock',
    })
  })
})

describe('ProductVariantsService variant generation', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    query.mockResolvedValue([])
    execute.mockResolvedValue({ lastInsertId: 11, rowsAffected: 1 })
    productVariantsService.clearCache()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('requires at least one attribute', async () => {
    await expect(
      productVariantsService.generateVariants('1', {}, { price: 10, cost: 5, stock: 2 }),
    ).resolves.toMatchObject({ success: false, error: 'At least one attribute must be selected' })
    expect(query).not.toHaveBeenCalled()
  })

  it('generates every combination', async () => {
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM product_attributes WHERE id')) {
        return params[0] === 1 ? [dbAttribute({ id: 1, slug: 'size' })] : [dbAttribute({ id: 2, slug: 'color' })]
      }
      return []
    })

    const result = await productVariantsService.generateVariants(
      '1',
      { '1': ['S', 'M'], '2': ['Red'] },
      { price: 10, cost: 5, stock: 2 },
    )

    expect(result.success).toBe(true)
    expect(result.variants).toHaveLength(2)
    expect(result.variants?.[0]?.sku).toBe('1-s-red')
    expect(result.variants?.[1]?.sku).toBe('1-m-red')
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('skips missing attributes', async () => {
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM product_attributes WHERE id')) {
        return params[0] === 1 ? [dbAttribute({ id: 1, slug: 'size' })] : []
      }
      return []
    })

    const result = await productVariantsService.generateVariants(
      '1',
      { '1': ['S'], '2': ['Red'] },
      { price: 10, cost: 5, stock: 2 },
    )

    expect(result.success).toBe(true)
    expect(result.variants).toHaveLength(1)
    expect(result.variants?.[0]?.attributes).toEqual({ size: 'S' })
  })

  it('skips combinations that do not map to an attribute', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM product_attributes WHERE id')) {
        return [{ ...dbAttribute(), id: 999, slug: 'size' }]
      }
      return []
    })

    const result = await productVariantsService.generateVariants('1', { '1': ['S'] }, { price: 10, cost: 5, stock: 2 })

    expect(result.success).toBe(true)
    expect(result.variants).toHaveLength(0)
  })

  it('reports empty value selections', async () => {
    query.mockResolvedValue([dbAttribute({ id: 1 })])

    await expect(
      productVariantsService.generateVariants('1', { '1': [] }, { price: 10, cost: 5, stock: 2 }),
    ).resolves.toMatchObject({ success: false, error: 'No valid combinations could be generated' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('reports generation failures', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(
      productVariantsService.generateVariants('1', { '1': ['S'] }, { price: 10, cost: 5, stock: 2 }),
    ).resolves.toMatchObject({ success: false, error: 'Failed to generate product variants' })
  })
})

describe('ProductVariantsService variant settings', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    query.mockResolvedValue([])
    execute.mockResolvedValue({ lastInsertId: 4, rowsAffected: 1 })
    productVariantsService.clearCache()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('gets variant settings or returns null', async () => {
    query.mockResolvedValueOnce([dbVariantSettings()])

    const settings = await productVariantsService.getVariantSettings('1')

    expect(settings).toMatchObject({
      id: '1',
      productId: '1',
      hasVariants: true,
      attributeIds: ['1'],
      variantNameTemplate: 'T-{size}',
      pricingStrategy: 'individual',
      stockStrategy: 'individual',
    })

    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(productVariantsService.getVariantSettings('99')).resolves.toBeNull()

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.getVariantSettings('1')).rejects.toThrow(
      'Failed to fetch product variant settings',
    )
  })

  it('defaults missing template and formula', async () => {
    query.mockResolvedValueOnce([dbVariantSettings({ variant_name_template: null, price_adjustment_formula: '' })])

    const settings = await productVariantsService.getVariantSettings('1')

    expect(settings?.variantNameTemplate).toBeUndefined()
    expect(settings?.priceAdjustmentFormula).toBeUndefined()
  })

  it('validates settings input', async () => {
    await expect(
      productVariantsService.createVariantSettings({
        productId: '',
        hasVariants: false,
        attributeIds: [],
        pricingStrategy: 'individual',
        stockStrategy: 'individual',
      }),
    ).resolves.toMatchObject({ success: false, error: 'Product ID is required' })
    await expect(
      productVariantsService.createVariantSettings({
        productId: '1',
        hasVariants: false,
        attributeIds: '1' as unknown as string[],
        pricingStrategy: 'individual',
        stockStrategy: 'individual',
      }),
    ).resolves.toMatchObject({ success: false, error: 'Attribute IDs must be an array' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects duplicate settings', async () => {
    query.mockResolvedValueOnce([{ id: 1 }])

    await expect(
      productVariantsService.createVariantSettings({
        productId: '1',
        hasVariants: false,
        attributeIds: [],
        pricingStrategy: 'individual',
        stockStrategy: 'individual',
      }),
    ).resolves.toMatchObject({ success: false, error: 'Variant settings already exist for this product' })
  })

  it('creates variant settings', async () => {
    query.mockResolvedValueOnce([])

    const result = await productVariantsService.createVariantSettings({
      productId: '1',
      hasVariants: true,
      attributeIds: ['1'],
      pricingStrategy: 'individual',
      stockStrategy: 'sum',
    })

    expect(result).toMatchObject({ success: true, settings: { id: '4', productId: '1' } })

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(
      productVariantsService.createVariantSettings({
        productId: '1',
        hasVariants: true,
        attributeIds: ['1'],
        pricingStrategy: 'individual',
        stockStrategy: 'sum',
      }),
    ).resolves.toMatchObject({ success: false, error: 'Failed to create product variant settings' })
  })

  it('returns not found for missing settings updates', async () => {
    query.mockResolvedValueOnce([])

    await expect(productVariantsService.updateVariantSettings('99', { hasVariants: true })).resolves.toMatchObject({
      success: false,
      error: 'Variant settings not found for this product',
    })
  })

  it('updates every settings field', async () => {
    query.mockResolvedValueOnce([dbVariantSettings()]).mockResolvedValueOnce([dbVariantSettings()])

    const result = await productVariantsService.updateVariantSettings('1', {
      hasVariants: false,
      attributeIds: ['2'],
      variantNameTemplate: 'N',
      pricingStrategy: 'parent',
      priceAdjustmentFormula: 'x+1',
      stockStrategy: 'parent',
    })

    expect(result.success).toBe(true)
    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain('UPDATE product_variant_settings SET')
    expect(params).toContain(0)
  })

  it('stores null for cleared template and formula', async () => {
    query.mockResolvedValueOnce([dbVariantSettings()]).mockResolvedValueOnce([dbVariantSettings()])

    const result = await productVariantsService.updateVariantSettings('1', {
      variantNameTemplate: '',
      priceAdjustmentFormula: '',
    })

    expect(result.success).toBe(true)
    const [, params] = execute.mock.calls[0]
    expect(params).toContain(null)
  })

  it('skips the update statement when nothing changed', async () => {
    query.mockResolvedValueOnce([dbVariantSettings()]).mockResolvedValueOnce([dbVariantSettings()])

    const result = await productVariantsService.updateVariantSettings('1', {})

    expect(result.success).toBe(true)
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns an error when the settings update fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.updateVariantSettings('1', { hasVariants: true })).resolves.toMatchObject({
      success: false,
      error: 'Failed to update product variant settings',
    })
  })

  it('deletes variant settings', async () => {
    await expect(productVariantsService.deleteVariantSettings('1')).resolves.toEqual({ success: true })

    execute.mockReset()
    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })

    await expect(productVariantsService.deleteVariantSettings('99')).resolves.toMatchObject({
      success: false,
      error: 'Variant settings not found',
    })

    execute.mockReset()
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(productVariantsService.deleteVariantSettings('1')).resolves.toMatchObject({
      success: false,
      error: 'Failed to delete product variant settings',
    })
  })
})

describe('ProductVariantsService branch coverage', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    query.mockResolvedValue([])
    execute.mockResolvedValue({ lastInsertId: 11, rowsAffected: 1 })
    productVariantsService.clearCache()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('creates inactive attributes', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const result = await productVariantsService.createAttribute(attributeInput({ isActive: false }))

    expect(result).toMatchObject({ success: true, attribute: { isActive: false } })
  })

  it('activates attributes on update', async () => {
    query.mockResolvedValueOnce([dbAttribute()]).mockResolvedValueOnce([dbAttribute()])

    const result = await productVariantsService.updateAttribute('1', { isActive: true })

    expect(result.success).toBe(true)
    expect(execute.mock.calls[0][1]).toContain(1)
  })

  it('creates inactive variants', async () => {
    const result = await productVariantsService.createVariant(variantInput({ isActive: false }))

    expect(result).toMatchObject({ success: true, variant: { isActive: false } })
  })

  it('activates variants on update', async () => {
    query.mockResolvedValueOnce([dbVariant()]).mockResolvedValueOnce([dbVariant({ is_active: 1 })])

    const result = await productVariantsService.updateVariant('10', { isActive: true })

    expect(result.success).toBe(true)
    expect(execute.mock.calls[0][1]).toContain(1)
  })

  it('creates settings without variants', async () => {
    query.mockResolvedValueOnce([])

    const result = await productVariantsService.createVariantSettings({
      productId: '1',
      hasVariants: false,
      attributeIds: [],
      pricingStrategy: 'individual',
      stockStrategy: 'individual',
    })

    expect(result).toMatchObject({ success: true })
  })

  it('enables variants in settings updates', async () => {
    query.mockResolvedValueOnce([dbVariantSettings()]).mockResolvedValueOnce([dbVariantSettings()])

    const result = await productVariantsService.updateVariantSettings('1', { hasVariants: true })

    expect(result.success).toBe(true)
    expect(execute.mock.calls[0][1]).toContain(1)
  })

  it('checks product barcode conflicts directly', async () => {
    const internals = productVariantsService as unknown as {
      isBarcodeInUse(
        barcode: string,
        options?: { excludeVariantId?: string; excludeProductId?: string },
      ): Promise<boolean>
    }

    query.mockResolvedValue([])

    await expect(internals.isBarcodeInUse('750123', { excludeProductId: '3' })).resolves.toBe(false)
    expect(query.mock.calls[1][1]).toEqual(['750123', 3, 3])
  })

  it('generates no combinations without attributes', () => {
    const internals = productVariantsService as unknown as {
      generateAttributeCombinations(selections: Record<string, string[]>): Array<Record<string, string>>
    }

    expect(internals.generateAttributeCombinations({})).toEqual([])
    expect(internals.generateAttributeCombinations({ '1': ['S', 'M'], '2': ['Red'] })).toEqual([
      { '1': 'S', '2': 'Red' },
      { '1': 'M', '2': 'Red' },
    ])
  })
})
