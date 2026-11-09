// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Order } from '../services/orders-turso'
import type { Product } from '../services/products-turso'

const mocks = vi.hoisted(() => ({
  getDashboardStats: vi.fn(),
  getRecentOrders: vi.fn(),
  getTopProducts: vi.fn(),
  getProducts: vi.fn(),
  getSettings: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key),
    getCurrentLocale: () => 'en',
  }),
}))
vi.mock('../lib/router', () => ({ hrefFor: (path: string) => `#/${path}`, navigate: vi.fn() }))
vi.mock('../lib/toast', () => ({
  toast: { success: vi.fn(), error: mocks.toastError, info: vi.fn(), warning: vi.fn() },
}))
vi.mock('../services/dashboard-turso', () => ({
  dashboardService: {
    getDashboardStats: mocks.getDashboardStats,
    getRecentOrders: mocks.getRecentOrders,
    getTopProducts: mocks.getTopProducts,
  },
}))
vi.mock('../services/products-turso', () => ({ productService: { getProducts: mocks.getProducts } }))
vi.mock('../services/company-settings-turso', () => ({
  companySettingsService: { getSettings: mocks.getSettings },
}))
vi.mock('../services/product-images', () => ({ resolveProductImageUrls: vi.fn(async () => ({})) }))

const { default: Dashboard } = await import('./Dashboard')

const order: Order = {
  id: 'order-0000abcd1234',
  items: [{ productId: 'p1', productName: 'Latte', quantity: 2, unitPrice: 4, totalPrice: 8 }],
  subtotal: 8,
  tax: 0.8,
  total: 8.8,
  status: 'pending',
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
}

function product(overrides: Partial<Product>): Product {
  return {
    id: 'p',
    name: 'Product',
    description: '',
    price: 1,
    cost: 0,
    stock: 50,
    category: 'Coffee',
    isActive: true,
    variantType: 'simple',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

beforeEach(() => {
  mocks.getSettings.mockResolvedValue({ currencySymbol: '$', taxEnabled: true })
  mocks.getDashboardStats.mockResolvedValue({
    totalSales: 120.5,
    ordersToday: 7,
    averageOrderValue: 17.21,
    lowStockProducts: 1,
    pendingOrders: 2,
  })
  mocks.getRecentOrders.mockResolvedValue([order])
  mocks.getTopProducts.mockResolvedValue([{ id: 'p1', name: 'Latte', sales: 40, revenue: 160 }])
  mocks.getProducts.mockResolvedValue([
    product({ id: 'p2', name: 'Croissant', stock: 3 }),
    product({ id: 'p3', name: 'Muffin', stock: 0 }),
    product({ id: 'p4', name: 'Bagel', stock: 4, isActive: false }),
    product({ id: 'p5', name: 'Scone', stock: 25 }),
  ])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Dashboard', () => {
  it('shows the day figures with links to orders, products and a new order', async () => {
    render(<Dashboard />)

    expect(await screen.findByText('$120.50')).toBeTruthy()
    expect(screen.getByText('$17.21')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'orders.newOrder' }).getAttribute('href')).toBe('#/orders/new')

    const [[options]] = mocks.getDashboardStats.mock.calls as [[{ referenceDate: Date }]]
    const referenceDate = options.referenceDate
    const now = new Date()
    expect(referenceDate.toDateString()).toBe(new Date(now.getFullYear(), now.getMonth(), now.getDate()).toDateString())
  })

  it('lists recent orders, low stock and top products with links to their pages', async () => {
    render(<Dashboard />)

    const orderLink = await screen.findByRole('link', { name: '#ABCD1234' })
    expect(orderLink.getAttribute('href')).toBe('#/orders/order-0000abcd1234')
    expect(screen.getByText('$8.80')).toBeTruthy()

    const lowStockLink = screen.getByRole('link', { name: /Croissant/ })
    expect(lowStockLink.getAttribute('href')).toBe('#/products/p2')
    expect(screen.queryByText('Muffin')).toBeNull()
    expect(screen.queryByText('Bagel')).toBeNull()
    expect(screen.queryByText('Scone')).toBeNull()

    const topLink = screen.getByRole('link', { name: /Latte/ })
    expect(topLink.getAttribute('href')).toBe('#/products/p1')
    expect(screen.getByText('$160.00')).toBeTruthy()

    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('shows empty states when there is nothing to report', async () => {
    mocks.getRecentOrders.mockResolvedValue([])
    mocks.getTopProducts.mockResolvedValue([])
    mocks.getProducts.mockResolvedValue([])
    render(<Dashboard />)

    expect(await screen.findByText('insights.noRecentOrders')).toBeTruthy()
    expect(screen.getByText('insights.noLowStock')).toBeTruthy()
    expect(screen.getByText('insights.noTopProducts')).toBeTruthy()
  })

  it('reports a failed load', async () => {
    mocks.getDashboardStats.mockRejectedValue(new Error('Failed to fetch dashboard statistics'))
    render(<Dashboard />)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Failed to fetch dashboard statistics'))
  })
})
