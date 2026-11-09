// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductVariant } from '../../services/product-variants-turso'
import type { Product, ProductWithVariants } from '../../services/products-turso'

const mocks = vi.hoisted(() => ({
  getProducts: vi.fn(),
  getProduct: vi.fn(),
  getProductWithVariants: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  convertToConfigurable: vi.fn(),
  convertToSimple: vi.fn(),
  setDefaultVariant: vi.fn(),
  getAttributes: vi.fn(),
  getVariantSettings: vi.fn(),
  createVariant: vi.fn(),
  updateVariant: vi.fn(),
  deleteVariant: vi.fn(),
  generateVariants: vi.fn(),
  resolveProductImageUrls: vi.fn(),
  deleteProductImage: vi.fn(),
  uploadProductImage: vi.fn(),
  getSettings: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  role: 'admin' as 'admin' | 'manager' | 'user',
  permissions: [] as string[],
}))

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Ana', role: mocks.role },
    hasRole: (role: string) => role === mocks.role,
    hasPermission: (permission: string) => mocks.role === 'admin' || mocks.permissions.includes(permission),
  }),
}))
vi.mock('../../lib/router', () => ({ hrefFor: (path: string) => `#/${path}`, navigate: mocks.navigate }))
vi.mock('../../lib/toast', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, warning: mocks.toastWarning, info: vi.fn() },
}))
vi.mock('../../services/products-turso', () => ({
  PRODUCT_CATEGORIES: ['Beverages', 'Bakery', 'Other'],
  productService: {
    getProducts: mocks.getProducts,
    getProduct: mocks.getProduct,
    getProductWithVariants: mocks.getProductWithVariants,
    createProduct: mocks.createProduct,
    updateProduct: mocks.updateProduct,
    deleteProduct: mocks.deleteProduct,
    convertToConfigurable: mocks.convertToConfigurable,
    convertToSimple: mocks.convertToSimple,
    setDefaultVariant: mocks.setDefaultVariant,
  },
}))
vi.mock('../../services/product-variants-turso', () => ({
  productVariantsService: {
    getAttributes: mocks.getAttributes,
    getVariantSettings: mocks.getVariantSettings,
    createVariant: mocks.createVariant,
    updateVariant: mocks.updateVariant,
    deleteVariant: mocks.deleteVariant,
    generateVariants: mocks.generateVariants,
  },
}))
vi.mock('../../services/product-images', () => ({
  DESKTOP_REMOTE_SESSION_UNAVAILABLE_MESSAGE: 'Remote session is unavailable.',
  extractDesktopApiConfigPath: () => null,
  extractDesktopRemoteSessionDetails: () => null,
  validateProductImageFile: () => null,
  resolveProductImageUrls: mocks.resolveProductImageUrls,
  deleteProductImage: mocks.deleteProductImage,
  uploadProductImage: mocks.uploadProductImage,
}))
vi.mock('../../services/company-settings-turso', () => ({
  companySettingsService: { getSettings: mocks.getSettings },
}))

const { default: ProductsSection } = await import('./ProductsSection')

const latte: Product = {
  id: 'p1',
  name: 'Latte',
  description: 'Espresso with steamed milk',
  price: 4,
  cost: 1.5,
  stock: 3,
  category: 'Beverages',
  barcode: '0123456789',
  image: 'products/latte.png',
  isActive: true,
  variantType: 'simple',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
}

const variant: ProductVariant = {
  id: 'v1',
  parentProductId: 'p2',
  sku: 'TEE-RED',
  price: 20,
  cost: 8,
  stock: 12,
  attributes: { color: 'Red' },
  isActive: true,
  position: 0,
  createdAt: '',
  updatedAt: '',
}

const tee: ProductWithVariants = {
  ...latte,
  id: 'p2',
  name: 'T-shirt',
  image: undefined,
  barcode: undefined,
  category: 'Other',
  variantType: 'configurable',
  variants: [variant],
  variantCount: 1,
  minPrice: 20,
  maxPrice: 20,
  totalStock: 12,
}

const colorAttribute = {
  id: 'attr-color',
  name: 'Color',
  slug: 'color',
  values: ['Red', 'Blue'],
  isActive: true,
  createdAt: '',
  updatedAt: '',
}

const noEmoji = () => expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)

beforeEach(() => {
  mocks.role = 'admin'
  mocks.permissions = []
  mocks.getSettings.mockResolvedValue({ currencySymbol: '$' })
  mocks.getProducts.mockResolvedValue([latte, tee])
  mocks.getProduct.mockImplementation(async (id: string) => (id === 'p1' ? latte : id === 'p2' ? tee : null))
  mocks.getProductWithVariants.mockImplementation(async (id: string) =>
    id === 'p1' ? latte : id === 'p2' ? tee : null,
  )
  mocks.resolveProductImageUrls.mockResolvedValue({ 'products/latte.png': 'https://img.test/latte.png' })
  mocks.deleteProductImage.mockResolvedValue(undefined)
  mocks.getAttributes.mockResolvedValue([colorAttribute])
  mocks.getVariantSettings.mockResolvedValue({ attributeIds: ['attr-color'] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProductsSection', () => {
  it('lists products with links to their pages, stock and price range, and no emoji', async () => {
    render(<ProductsSection params={[]} />)
    const link = await screen.findByRole('link', { name: 'Latte' })
    expect(link.getAttribute('href')).toBe('#/products/p1')
    expect(screen.getByRole('link', { name: 'T-shirt' }).getAttribute('href')).toBe('#/products/p2')
    expect(screen.getByRole('link', { name: 'products.newProduct' }).getAttribute('href')).toBe('#/products/new')
    expect(screen.getByText('$4.00')).toBeTruthy()
    expect(screen.getByText('products.variantCount {"count":1}')).toBeTruthy()
    noEmoji()
  })

  it('filters the list by search', async () => {
    render(<ProductsSection params={[]} />)
    await screen.findByRole('link', { name: 'Latte' })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '0123456789' } })
    await waitFor(() => expect(screen.queryByRole('link', { name: 'T-shirt' })).toBeNull())
    expect(screen.getByRole('link', { name: 'Latte' })).toBeTruthy()
  })

  it('hides create and edit for staff who can only view products', async () => {
    mocks.role = 'user'
    mocks.permissions = ['products.view']
    render(<ProductsSection params={[]} />)
    await screen.findByRole('link', { name: 'Latte' })
    expect(screen.queryByRole('link', { name: 'products.newProduct' })).toBeNull()
    cleanup()

    render(<ProductsSection params={['new']} />)
    expect(screen.getByText('products.accessDenied')).toBeTruthy()
    expect(mocks.createProduct).not.toHaveBeenCalled()
    cleanup()

    render(<ProductsSection params={['p1']} />)
    await screen.findByRole('heading', { name: 'Latte', level: 1 })
    expect(screen.queryByRole('link', { name: 'common.edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'products.deleteProduct' })).toBeNull()
  })

  it('denies the whole section without the view permission', () => {
    mocks.role = 'user'
    render(<ProductsSection params={[]} />)
    expect(screen.getByText('products.accessDenied')).toBeTruthy()
    expect(mocks.getProducts).not.toHaveBeenCalled()
  })

  it('shows the product page and deletes it after an in-page confirmation', async () => {
    mocks.deleteProduct.mockResolvedValue({ success: true })
    render(<ProductsSection params={['p1']} />)
    await screen.findByRole('heading', { name: 'Latte', level: 1 })
    expect(screen.getByRole('link', { name: 'common.edit' }).getAttribute('href')).toBe('#/products/p1/edit')
    expect(screen.getByRole('link', { name: 'products.enableVariants' }).getAttribute('href')).toBe(
      '#/products/p1/variants/enable',
    )
    noEmoji()

    fireEvent.click(screen.getByRole('button', { name: 'products.deleteProduct' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }))
    await waitFor(() => expect(mocks.deleteProduct).toHaveBeenCalledWith('p1'))
    expect(mocks.deleteProductImage).toHaveBeenCalledWith('products/latte.png')
    expect(mocks.navigate).toHaveBeenCalledWith('products')
  })

  it('saves edits with the full product payload and opens the product', async () => {
    mocks.updateProduct.mockResolvedValue({ success: true, product: { ...latte, name: 'Oat latte' } })
    render(<ProductsSection params={['p1', 'edit']} />)
    const name = await screen.findByRole('textbox', { name: /products\.name/ })
    fireEvent.change(name, { target: { value: 'Oat latte' } })
    const [saveButton] = screen.getAllByRole('button', { name: 'products.saveChanges' })
    fireEvent.click(saveButton as HTMLElement)
    await waitFor(() =>
      expect(mocks.updateProduct).toHaveBeenCalledWith('p1', {
        name: 'Oat latte',
        description: 'Espresso with steamed milk',
        price: 4,
        cost: 1.5,
        stock: 3,
        category: 'Beverages',
        barcode: '0123456789',
        isActive: true,
        image: undefined,
        variantType: 'simple',
      }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('products.productUpdated')
    expect(mocks.navigate).toHaveBeenCalledWith('products/p1')
  })

  it('asks before discarding unsaved changes', async () => {
    render(<ProductsSection params={['p1', 'edit']} />)
    const name = await screen.findByRole('textbox', { name: /products\.name/ })
    fireEvent.change(name, { target: { value: 'Changed' } })
    const [cancelButton] = screen.getAllByRole('button', { name: 'common.cancel' })
    fireEvent.click(cancelButton as HTMLElement)
    expect(mocks.navigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'products.discardChanges' }))
    expect(mocks.navigate).toHaveBeenCalledWith('products/p1')
  })

  it('validates a new product before calling the service', async () => {
    render(<ProductsSection params={['new']} />)
    const [createButton] = await screen.findAllByRole('button', { name: 'products.createProduct' })
    fireEvent.click(createButton as HTMLElement)
    expect(await screen.findByText('products.nameRequired')).toBeTruthy()
    expect(screen.getByText('products.categoryRequired')).toBeTruthy()
    expect(mocks.createProduct).not.toHaveBeenCalled()
    noEmoji()
  })

  it('enables variants with the chosen attributes', async () => {
    mocks.convertToConfigurable.mockResolvedValue({ success: true })
    render(<ProductsSection params={['p1', 'variants', 'enable']} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Color/ }))
    fireEvent.click(screen.getByRole('button', { name: 'products.enableVariants' }))
    await waitFor(() => expect(mocks.convertToConfigurable).toHaveBeenCalledWith('p1', ['attr-color']))
    expect(mocks.navigate).toHaveBeenCalledWith('products/p1')
  })

  it('lists variants on a configurable product with links to edit them', async () => {
    render(<ProductsSection params={['p2']} />)
    const link = await screen.findByRole('link', { name: 'color: Red' })
    expect(link.getAttribute('href')).toBe('#/products/p2/variants/v1')
    expect(screen.getByRole('link', { name: 'products.addVariant' }).getAttribute('href')).toBe(
      '#/products/p2/variants/new',
    )
    expect((screen.getByRole('button', { name: 'products.disableVariants' }) as HTMLButtonElement).disabled).toBe(true)
    noEmoji()
  })

  it('updates a variant on its own page and deletes it after confirmation', async () => {
    mocks.updateVariant.mockResolvedValue({ success: true, variant })
    mocks.deleteVariant.mockResolvedValue({ success: true })
    render(<ProductsSection params={['p2', 'variants', 'v1']} />)
    const sku = await screen.findByRole('textbox', { name: /products\.sku/ })
    expect((sku as HTMLInputElement).value).toBe('TEE-RED')
    fireEvent.change(sku, { target: { value: 'TEE-RED-2' } })
    const [saveButton] = screen.getAllByRole('button', { name: 'products.saveChanges' })
    fireEvent.click(saveButton as HTMLElement)
    await waitFor(() =>
      expect(mocks.updateVariant).toHaveBeenCalledWith('v1', {
        parentProductId: 'p2',
        sku: 'TEE-RED-2',
        barcode: undefined,
        price: 20,
        cost: 8,
        stock: 12,
        attributes: { color: 'Red' },
        image: undefined,
        isActive: true,
        position: 0,
      }),
    )
    expect(mocks.navigate).toHaveBeenCalledWith('products/p2')

    fireEvent.click(screen.getByRole('button', { name: 'products.deleteVariant' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText(/products\.deleteVariantTitle/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }))
    await waitFor(() => expect(mocks.deleteVariant).toHaveBeenCalledWith('v1'))
  })

  it('generates variants from the chosen values', async () => {
    mocks.generateVariants.mockResolvedValue({ success: true, variants: [variant, variant] })
    render(<ProductsSection params={['p2', 'variants', 'generate']} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Red' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Blue' }))
    const price = screen.getByRole('spinbutton', { name: /products\.price/ })
    fireEvent.change(price, { target: { value: '25' } })
    fireEvent.blur(price)
    const button = await screen.findByRole('button', { name: 'products.generateCount {"count":2}' })
    fireEvent.click(button)
    await waitFor(() =>
      expect(mocks.generateVariants).toHaveBeenCalledWith(
        'p2',
        { 'attr-color': ['Red', 'Blue'] },
        {
          price: 25,
          cost: 0,
          stock: 0,
        },
      ),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('products.variantsGenerated {"count":2}')
  })
})
