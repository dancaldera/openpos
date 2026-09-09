import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from './products-turso'

const { execute, query, getVariants, getVariant, getVariantByBarcode } = vi.hoisted(() => ({
  execute: vi.fn(async (_sql: string, _params: unknown[] = []) => ({ lastInsertId: 0, rowsAffected: 1 })),
  query: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<Array<Record<string, unknown>>> => []),
  getVariants: vi.fn(async (_productId: string): Promise<Array<Record<string, unknown>>> => []),
  getVariant: vi.fn(async (_id: string): Promise<Record<string, unknown> | null> => null),
  getVariantByBarcode: vi.fn(async (_barcode: string): Promise<Record<string, unknown> | null> => null),
}))

vi.mock('../lib/db-adapter', () => ({
  execute,
  query,
}))

vi.mock('./product-variants-turso', () => ({
  productVariantsService: { getVariants, getVariant, getVariantByBarcode },
}))

const { productService } = await import('./products-turso')

function dbProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Cafe',
    description: 'Molido',
    price: 50,
    cost: 30,
    stock: 20,
    category: 'Beverages',
    barcode: '750123',
    barcode_normalized: '750123',
    image: 'cafe.jpg',
    is_active: 1,
    variant_type: 'simple',
    default_variant_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function productInput(overrides: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>> = {}) {
  return {
    name: 'Cafe',
    description: 'Molido',
    price: 50,
    cost: 30,
    stock: 20,
    category: 'Beverages',
    isActive: true,
    variantType: 'simple' as const,
    ...overrides,
  }
}

describe('ProductService getters', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    query.mockResolvedValue([])
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('lists products', async () => {
    query.mockResolvedValueOnce([dbProduct(), dbProduct({ id: 2, name: 'Pan' })])

    const products = await productService.getProducts()

    expect(products).toHaveLength(2)
    expect(products[0]).toMatchObject({ id: '1', isActive: true, variantType: 'simple' })
  })

  it('throws when listing fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.getProducts()).rejects.toThrow('Failed to fetch products')
  })

  it('paginates products', async () => {
    query.mockResolvedValueOnce([{ count: 21 }]).mockResolvedValueOnce([dbProduct()])

    const page = await productService.getProductsPaginated(3, 10)

    expect(page).toMatchObject({
      totalCount: 21,
      totalPages: 3,
      currentPage: 3,
      hasNextPage: false,
      hasPreviousPage: true,
    })
  })

  it('handles an empty count when paginating', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const page = await productService.getProductsPaginated()

    expect(page).toMatchObject({ totalCount: 0, totalPages: 0 })
  })

  it('throws when pagination fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.getProductsPaginated()).rejects.toThrow('Failed to fetch paginated products')
  })

  it('gets a product by id or returns null', async () => {
    query.mockResolvedValueOnce([dbProduct()])

    await expect(productService.getProduct('1')).resolves.toMatchObject({ id: '1' })

    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(productService.getProduct('99')).resolves.toBeNull()
  })

  it('throws when getting a product fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.getProduct('1')).rejects.toThrow('Failed to fetch product')
  })

  it('defaults variant type for legacy rows', async () => {
    query.mockResolvedValueOnce([dbProduct({ variant_type: null, default_variant_id: 4 })])

    const product = await productService.getProduct('1')

    expect(product).toMatchObject({ variantType: 'simple', defaultVariantId: '4' })
  })
})

describe('ProductService.createProduct', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    execute.mockResolvedValue({ lastInsertId: 9, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('validates input', async () => {
    await expect(productService.createProduct(productInput({ name: '  ' }))).resolves.toMatchObject({
      success: false,
      error: 'Product name is required',
    })
    await expect(productService.createProduct(productInput({ price: 0 }))).resolves.toMatchObject({
      success: false,
      error: 'Price must be greater than 0',
    })
    await expect(productService.createProduct(productInput({ cost: -1 }))).resolves.toMatchObject({
      success: false,
      error: 'Cost cannot be negative',
    })
    await expect(productService.createProduct(productInput({ stock: -1 }))).resolves.toMatchObject({
      success: false,
      error: 'Stock cannot be negative',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects barcodes used by another product', async () => {
    query.mockResolvedValueOnce([{ id: 2 }])

    await expect(productService.createProduct(productInput({ barcode: '750123' }))).resolves.toMatchObject({
      success: false,
      error: 'Barcode is already assigned to another product or variant',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects barcodes used by a variant', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 5 }])

    await expect(productService.createProduct(productInput({ barcode: '750123' }))).resolves.toMatchObject({
      success: false,
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('creates a product with barcode and default variant', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const result = await productService.createProduct(
      productInput({ barcode: ' 750123 ', image: 'cafe.jpg', defaultVariantId: '4' }),
    )

    expect(result.success).toBe(true)
    expect(result.product).toMatchObject({ id: '9', barcode: '750123', defaultVariantId: '4' })
  })

  it('creates a product without a barcode', async () => {
    const result = await productService.createProduct(productInput({ barcode: '   ' }))

    expect(result.success).toBe(true)
    expect(query).not.toHaveBeenCalled()
  })

  it('returns an error when creation fails', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.createProduct(productInput())).resolves.toMatchObject({
      success: false,
      error: 'Failed to create product',
    })
  })
})

describe('ProductService.updateProduct', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('validates input', async () => {
    await expect(productService.updateProduct('1', { name: ' ' })).resolves.toMatchObject({
      success: false,
      error: 'Product name is required',
    })
    await expect(productService.updateProduct('1', { price: 0 })).resolves.toMatchObject({
      success: false,
      error: 'Price must be greater than 0',
    })
    await expect(productService.updateProduct('1', { cost: -2 })).resolves.toMatchObject({
      success: false,
      error: 'Cost cannot be negative',
    })
    await expect(productService.updateProduct('1', { stock: -2 })).resolves.toMatchObject({
      success: false,
      error: 'Stock cannot be negative',
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('returns not found for missing products', async () => {
    query.mockResolvedValueOnce([])

    await expect(productService.updateProduct('99', { name: 'X' })).resolves.toMatchObject({
      success: false,
      error: 'Product not found',
    })
  })

  it('rejects a barcode used elsewhere', async () => {
    query.mockResolvedValueOnce([dbProduct()]).mockResolvedValueOnce([{ id: 2 }])

    await expect(productService.updateProduct('1', { barcode: '750999' })).resolves.toMatchObject({
      success: false,
      error: 'Barcode is already assigned to another product or variant',
    })
  })

  it('updates every field', async () => {
    query
      .mockResolvedValueOnce([dbProduct()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([dbProduct({ name: 'Cafe Premium' })])

    const result = await productService.updateProduct('1', {
      name: 'Cafe Premium',
      description: 'D',
      price: 60,
      cost: 35,
      stock: 15,
      category: 'Coffee & Tea',
      barcode: '750999',
      image: 'new.jpg',
      isActive: false,
    })

    expect(result.success).toBe(true)
    expect(result.product?.name).toBe('Cafe Premium')
    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain('UPDATE products SET')
    expect(params).toContain(0)
  })

  it('updates without touching the barcode', async () => {
    query.mockResolvedValueOnce([dbProduct()]).mockResolvedValueOnce([dbProduct({ price: 60 })])

    const result = await productService.updateProduct('1', { price: 60 })

    expect(result.success).toBe(true)
    expect(result.product?.price).toBe(60)
  })

  it('skips the update statement when nothing changed', async () => {
    query.mockResolvedValueOnce([dbProduct()]).mockResolvedValueOnce([dbProduct()])

    const result = await productService.updateProduct('1', {})

    expect(result.success).toBe(true)
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns an error when the update fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.updateProduct('1', { name: 'X' })).resolves.toMatchObject({
      success: false,
      error: 'Failed to update product',
    })
  })
})

describe('ProductService deletion and search', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    query.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('deletes products', async () => {
    await expect(productService.deleteProduct('1')).resolves.toEqual({ success: true })

    execute.mockReset()
    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })

    await expect(productService.deleteProduct('99')).resolves.toMatchObject({
      success: false,
      error: 'Product not found',
    })

    execute.mockReset()
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.deleteProduct('1')).resolves.toMatchObject({
      success: false,
      error: 'Failed to delete product',
    })
  })

  it('searches products', async () => {
    query.mockResolvedValueOnce([dbProduct()])

    const results = await productService.searchProducts('cafe')

    expect(results).toHaveLength(1)
    expect(query.mock.calls[0][1]).toHaveLength(6)

    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(productService.searchProducts('')).resolves.toEqual([])

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.searchProducts('cafe')).rejects.toThrow('Failed to search products')
  })

  it('searches products with pagination', async () => {
    query.mockResolvedValueOnce([{ count: 2 }]).mockResolvedValueOnce([dbProduct()])

    const page = await productService.searchProductsPaginated('cafe', 1, 10)

    expect(page).toMatchObject({ totalCount: 2, totalPages: 1 })
    expect(query.mock.calls[1][1]).toHaveLength(8)

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.searchProductsPaginated('cafe')).rejects.toThrow(
      'Failed to search products with pagination',
    )
  })

  it('lists categories with a fallback', async () => {
    query.mockResolvedValueOnce([{ category: 'Beverages' }, { category: 'Snacks' }])

    await expect(productService.getCategories()).resolves.toEqual(['Beverages', 'Snacks'])

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    const fallback = await productService.getCategories()

    expect(fallback).toContain('Beverages')
    expect(fallback).toContain('Other')
  })

  it('gets products by category', async () => {
    query.mockResolvedValueOnce([dbProduct()])

    const results = await productService.getProductsByCategory('Beverages')

    expect(results).toHaveLength(1)
    expect(query.mock.calls[0][1]).toEqual(['Beverages'])

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.getProductsByCategory('Beverages')).rejects.toThrow(
      'Failed to fetch products by category',
    )
  })

  it('gets low stock products', async () => {
    query.mockResolvedValueOnce([dbProduct({ stock: 2 })])

    const results = await productService.getLowStockProducts(5)

    expect(results).toHaveLength(1)
    expect(query.mock.calls[0][1]).toEqual([5])

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.getLowStockProducts()).rejects.toThrow('Failed to fetch low stock products')
  })
})

describe('ProductService variant support', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    query.mockResolvedValue([])
    getVariants.mockReset()
    getVariant.mockReset()
    getVariantByBarcode.mockReset()
    getVariants.mockResolvedValue([])
    getVariant.mockResolvedValue(null)
    getVariantByBarcode.mockResolvedValue(null)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns null when the product is missing', async () => {
    query.mockResolvedValueOnce([])

    await expect(productService.getProductWithVariants('99')).resolves.toBeNull()
  })

  it('returns simple products without variants', async () => {
    query.mockResolvedValueOnce([dbProduct()])

    const result = await productService.getProductWithVariants('1')

    expect(result?.variants).toBeUndefined()
    expect(getVariants).not.toHaveBeenCalled()
  })

  it('returns configurable products with price ranges and stock totals', async () => {
    query.mockResolvedValueOnce([dbProduct({ variant_type: 'configurable' })])
    getVariants.mockResolvedValueOnce([
      { id: '10', price: 60, stock: 5 },
      { id: '11', price: 0, stock: 3 },
      { id: '12', price: 80, stock: 2 },
    ])

    const result = await productService.getProductWithVariants('1')

    expect(result?.variantCount).toBe(3)
    expect(result?.minPrice).toBe(60)
    expect(result?.maxPrice).toBe(80)
    expect(result?.totalStock).toBe(10)
  })

  it('handles configurable products without variants', async () => {
    query.mockResolvedValueOnce([dbProduct({ variant_type: 'configurable' })])
    getVariants.mockResolvedValueOnce([])

    const result = await productService.getProductWithVariants('1')

    expect(result?.variantCount).toBe(0)
    expect(result?.minPrice).toBeUndefined()
  })

  it('throws when fetching with variants fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.getProductWithVariants('1')).rejects.toThrow('Failed to fetch product with variants')
  })

  it('returns null for blank barcodes', async () => {
    await expect(productService.findSellableByBarcode('')).resolves.toBeNull()
    await expect(productService.findSellableByBarcode('   ')).resolves.toBeNull()
    expect(getVariantByBarcode).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })

  it('resolves variant barcodes', async () => {
    getVariantByBarcode.mockResolvedValueOnce({
      id: '10',
      parentProductId: '1',
      barcode: 'V1',
      price: 60,
      stock: 5,
      isActive: true,
      attributes: { size: 'L' },
    })
    query.mockResolvedValueOnce([dbProduct()])

    const found = await productService.findSellableByBarcode('V1')

    expect(found).toMatchObject({ type: 'variant', productId: '1', variantId: '10', price: 60 })
  })

  it('rejects variant barcodes for inactive or missing products', async () => {
    getVariantByBarcode.mockResolvedValueOnce({ id: '10', parentProductId: '1', isActive: true })
    query.mockResolvedValueOnce([dbProduct({ is_active: 0 })])

    await expect(productService.findSellableByBarcode('V1')).resolves.toBeNull()

    getVariantByBarcode.mockReset()
    getVariantByBarcode.mockResolvedValueOnce({ id: '10', parentProductId: '1', isActive: true })
    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(productService.findSellableByBarcode('V1')).resolves.toBeNull()
  })

  it('resolves simple product barcodes', async () => {
    query.mockResolvedValueOnce([dbProduct()])

    const found = await productService.findSellableByBarcode('750123')

    expect(found).toMatchObject({ type: 'product', productId: '1', price: 50 })

    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(productService.findSellableByBarcode('750123')).resolves.toBeNull()
  })

  it('converts products to configurable', async () => {
    query.mockResolvedValueOnce([dbProduct()]).mockResolvedValueOnce([dbProduct({ variant_type: 'configurable' })])

    const result = await productService.convertToConfigurable('1', ['size'])

    expect(result.success).toBe(true)
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid configurable conversions', async () => {
    query.mockResolvedValueOnce([])

    await expect(productService.convertToConfigurable('99', [])).resolves.toMatchObject({
      success: false,
      error: 'Product not found',
    })

    query.mockReset()
    query.mockResolvedValueOnce([dbProduct({ variant_type: 'configurable' })])

    await expect(productService.convertToConfigurable('1', [])).resolves.toMatchObject({
      success: false,
      error: 'Product is already configurable',
    })

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.convertToConfigurable('1', [])).resolves.toMatchObject({
      success: false,
      error: 'Failed to convert product to configurable',
    })
  })

  it('converts products back to simple', async () => {
    query
      .mockResolvedValueOnce([dbProduct({ variant_type: 'configurable' })])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([dbProduct()])

    const result = await productService.convertToSimple('1')

    expect(result.success).toBe(true)
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid simple conversions', async () => {
    query.mockResolvedValueOnce([])

    await expect(productService.convertToSimple('99')).resolves.toMatchObject({
      success: false,
      error: 'Product not found',
    })

    query.mockReset()
    query.mockResolvedValueOnce([dbProduct()])

    await expect(productService.convertToSimple('1')).resolves.toMatchObject({
      success: false,
      error: 'Product is already simple',
    })

    query.mockReset()
    query.mockResolvedValueOnce([dbProduct({ variant_type: 'configurable' })]).mockResolvedValueOnce([{ count: 2 }])

    await expect(productService.convertToSimple('1')).resolves.toMatchObject({
      success: false,
      error: 'Cannot convert product with variants. Please delete all variants first.',
    })

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.convertToSimple('1')).resolves.toMatchObject({
      success: false,
      error: 'Failed to convert product to simple',
    })
  })

  it('gets the default variant explicitly or by fallback', async () => {
    query.mockResolvedValueOnce([{ default_variant_id: 10 }])
    getVariant.mockResolvedValueOnce({ id: '10' })

    await expect(productService.getDefaultVariant('1')).resolves.toMatchObject({ id: '10' })
    expect(getVariant).toHaveBeenCalledWith('10')

    query.mockReset()
    getVariant.mockReset()
    query.mockResolvedValueOnce([{ default_variant_id: null }])
    getVariants.mockResolvedValueOnce([
      { id: '10', isActive: false },
      { id: '11', isActive: true },
    ])

    await expect(productService.getDefaultVariant('1')).resolves.toMatchObject({ id: '11' })

    query.mockReset()
    query.mockResolvedValueOnce([{ default_variant_id: null }])
    getVariants.mockReset()
    getVariants.mockResolvedValueOnce([{ id: '10', isActive: false }])

    await expect(productService.getDefaultVariant('1')).resolves.toBeNull()
  })

  it('returns null when the default variant product is missing', async () => {
    query.mockResolvedValueOnce([])

    await expect(productService.getDefaultVariant('99')).resolves.toBeNull()
  })

  it('throws when getting the default variant fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.getDefaultVariant('1')).rejects.toThrow('Failed to fetch default variant')
  })

  it('sets the default variant', async () => {
    query.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([{ id: 10, parent_product_id: 1 }])

    await expect(productService.setDefaultVariant('1', '10')).resolves.toEqual({ success: true })
    expect(execute).toHaveBeenCalled()
  })

  it('rejects invalid default variant assignments', async () => {
    query.mockResolvedValueOnce([])

    await expect(productService.setDefaultVariant('99', '10')).resolves.toMatchObject({
      success: false,
      error: 'Product not found',
    })

    query.mockReset()
    query.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([])

    await expect(productService.setDefaultVariant('1', '99')).resolves.toMatchObject({
      success: false,
      error: 'Variant not found',
    })

    query.mockReset()
    query.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([{ id: 10, parent_product_id: 2 }])

    await expect(productService.setDefaultVariant('1', '10')).resolves.toMatchObject({
      success: false,
      error: 'Variant does not belong to this product',
    })

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(productService.setDefaultVariant('1', '10')).resolves.toMatchObject({
      success: false,
      error: 'Failed to set default variant',
    })
  })
})

describe('ProductService branch coverage', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    execute.mockResolvedValue({ lastInsertId: 9, rowsAffected: 1 })
    query.mockResolvedValue([])
    getVariants.mockReset()
    getVariant.mockReset()
    getVariantByBarcode.mockReset()
    getVariants.mockResolvedValue([])
    getVariant.mockResolvedValue(null)
    getVariantByBarcode.mockResolvedValue(null)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('creates inactive products without a variant type', async () => {
    const result = await productService.createProduct(productInput({ isActive: false, variantType: undefined }))

    expect(result.success).toBe(true)
    expect(result.product).toMatchObject({ isActive: false, variantType: 'simple' })
    const [, params] = execute.mock.calls[0]
    expect(params).toContain(0)
  })

  it('clears barcode and image fields on update', async () => {
    query.mockResolvedValueOnce([dbProduct()]).mockResolvedValueOnce([dbProduct({ barcode: null, image: null })])

    const result = await productService.updateProduct('1', { barcode: '', image: '', isActive: true })

    expect(result.success).toBe(true)
    const [, params] = execute.mock.calls[0]
    expect(params).toContain(null)
    expect(params).toContain(1)
  })

  it('searches with pagination without a normalized barcode', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const page = await productService.searchProductsPaginated('', 1, 10)

    expect(page).toMatchObject({ totalCount: 0, totalPages: 0, products: [] })
    expect(query.mock.calls[0][1]).toContain(null)
  })

  it('checks variant barcode conflicts directly', async () => {
    const internals = productService as unknown as {
      isBarcodeInUse(
        barcode: string,
        options?: { excludeProductId?: string; excludeVariantId?: string },
      ): Promise<boolean>
    }

    query.mockResolvedValue([])

    await expect(internals.isBarcodeInUse('750123', { excludeVariantId: '5' })).resolves.toBe(false)
    expect(query.mock.calls[1][1]).toEqual(['750123', 5, 5])

    query.mockReset()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 5 }])

    await expect(internals.isBarcodeInUse('750123', { excludeVariantId: '5' })).resolves.toBe(true)
  })
})
