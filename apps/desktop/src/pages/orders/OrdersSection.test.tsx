// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Order } from '../../services/orders-turso'

const mocks = vi.hoisted(() => ({
  getOrders: vi.fn(),
  getOrdersByDateFilter: vi.fn(),
  getOrder: vi.fn(),
  createOrder: vi.fn(),
  updateOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
  deleteOrder: vi.fn(),
  getProducts: vi.fn(),
  getProductWithVariants: vi.fn(),
  findSellableByBarcode: vi.fn(),
  getCustomers: vi.fn(),
  getUsers: vi.fn(),
  getSettings: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  user: { id: 'u1', name: 'Ana', role: 'admin' as 'admin' | 'manager' | 'user' },
}))

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock('../../lib/router', () => ({ hrefFor: (path: string) => `#/${path}`, navigate: mocks.navigate }))
vi.mock('../../lib/toast', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: vi.fn(), warning: vi.fn() },
}))
vi.mock('../../services/orders-turso', () => ({
  orderService: {
    getOrders: mocks.getOrders,
    getOrdersByDateFilter: mocks.getOrdersByDateFilter,
    getOrder: mocks.getOrder,
    createOrder: mocks.createOrder,
    updateOrder: mocks.updateOrder,
    updateOrderStatus: mocks.updateOrderStatus,
    deleteOrder: mocks.deleteOrder,
  },
}))
vi.mock('../../services/products-turso', () => ({
  productService: {
    getProducts: mocks.getProducts,
    getProductWithVariants: mocks.getProductWithVariants,
    findSellableByBarcode: mocks.findSellableByBarcode,
  },
}))
vi.mock('../../services/customers-turso', () => ({ customerService: { getCustomers: mocks.getCustomers } }))
vi.mock('../../services/users-turso', () => ({ userService: { getUsers: mocks.getUsers } }))
vi.mock('../../services/company-settings-turso', () => ({
  companySettingsService: { getSettings: mocks.getSettings },
}))
vi.mock('../../services/product-images', () => ({ resolveProductImageUrls: vi.fn(async () => ({})) }))
vi.mock('../../services/print-service', () => ({ formatReceiptData: vi.fn(), printThermalReceipt: vi.fn() }))

const { default: OrdersSection } = await import('./OrdersSection')

const order: Order = {
  id: 'order-0000abcd1234',
  userId: 'u1',
  items: [{ productId: 'p1', productName: 'Latte', quantity: 2, unitPrice: 4, totalPrice: 8 }],
  subtotal: 8,
  tax: 0.8,
  total: 8.8,
  status: 'pending',
  paymentMethod: 'card',
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
}

const product = {
  id: 'p1',
  name: 'Latte',
  description: '',
  price: 4,
  cost: 1,
  stock: 10,
  category: 'Coffee',
  isActive: true,
  variantType: 'simple' as const,
  createdAt: '',
  updatedAt: '',
}

beforeEach(() => {
  mocks.getSettings.mockResolvedValue({ currencySymbol: '$', taxEnabled: true, taxPercentage: 10 })
  mocks.getProducts.mockResolvedValue([product])
  mocks.getCustomers.mockResolvedValue([])
  mocks.getUsers.mockResolvedValue([{ id: 'u1', name: 'Ana' }])
  mocks.getOrders.mockResolvedValue([order])
  mocks.getOrdersByDateFilter.mockResolvedValue([order])
  mocks.getOrder.mockResolvedValue(order)
  mocks.user = { id: 'u1', name: 'Ana', role: 'admin' }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('OrdersSection', () => {
  it('lists orders with a link to each order page and no emoji', async () => {
    render(<OrdersSection params={[]} />)
    const link = await screen.findByRole('link', { name: '#ABCD1234' })
    expect(link.getAttribute('href')).toBe('#/orders/order-0000abcd1234')
    expect(screen.getByRole('link', { name: 'orders.newOrder' }).getAttribute('href')).toBe('#/orders/new')
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('shows the order on its own page and marks it as paid', async () => {
    mocks.updateOrderStatus.mockResolvedValue({ success: true, order: { ...order, status: 'paid' } })
    render(<OrdersSection params={[order.id]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'orders.markAsPaid' }))
    await waitFor(() => expect(mocks.updateOrderStatus).toHaveBeenCalledWith(order.id, 'paid'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('orders.statusUpdated')
  })

  it('confirms deletion in place instead of a dialog', async () => {
    mocks.deleteOrder.mockResolvedValue({ success: true })
    render(<OrdersSection params={[order.id]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'orders.deleteOrder' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }))
    await waitFor(() => expect(mocks.deleteOrder).toHaveBeenCalledWith(order.id))
    expect(mocks.navigate).toHaveBeenCalledWith('orders')
  })

  it('creates an order from the catalog and opens it', async () => {
    mocks.createOrder.mockResolvedValue({ success: true, order: { ...order, id: 'new-1' } })
    render(<OrdersSection params={['new']} />)
    fireEvent.click(await screen.findByRole('button', { name: 'orders.addToOrder {"product":"Latte"}' }))
    const [createButton] = screen.getAllByRole('button', { name: 'orders.createOrder' })
    fireEvent.click(createButton as HTMLElement)
    await waitFor(() =>
      expect(mocks.createOrder).toHaveBeenCalledWith({
        items: [{ productId: 'p1', variantId: undefined, quantity: 1 }],
        customerId: undefined,
        paymentMethod: 'cash',
        notes: '',
      }),
    )
    expect(mocks.navigate).toHaveBeenCalledWith('orders/new-1')
  })
})
