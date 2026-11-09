// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getOverallMetrics: vi.fn(),
  getSalesByMembers: vi.fn(),
  getTopProducts: vi.fn(),
  getSalesByPeriod: vi.fn(),
  getRecentActivity: vi.fn(),
  getSettings: vi.fn(),
  toastError: vi.fn(),
  role: 'admin' as 'admin' | 'manager' | 'user',
}))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key),
    getCurrentLocale: () => 'en',
  }),
}))
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ hasRole: (role: string) => role === mocks.role }),
}))
vi.mock('../lib/router', () => ({ hrefFor: (path: string) => `#/${path}`, navigate: vi.fn() }))
vi.mock('../lib/toast', () => ({
  toast: { success: vi.fn(), error: mocks.toastError, info: vi.fn(), warning: vi.fn() },
}))
vi.mock('../services/analytics-turso', () => ({
  analyticsService: {
    getOverallMetrics: mocks.getOverallMetrics,
    getSalesByMembers: mocks.getSalesByMembers,
    getTopProducts: mocks.getTopProducts,
    getSalesByPeriod: mocks.getSalesByPeriod,
    getRecentActivity: mocks.getRecentActivity,
  },
}))
vi.mock('../services/company-settings-turso', () => ({
  companySettingsService: { getSettings: mocks.getSettings },
}))

const { default: Analytics } = await import('./Analytics')

const DAY_MS = 24 * 60 * 60 * 1000

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

beforeEach(() => {
  mocks.role = 'admin'
  mocks.getSettings.mockResolvedValue({ currencySymbol: '$' })
  mocks.getOverallMetrics.mockResolvedValue({
    totalSales: 4,
    totalOrders: 6,
    completedOrders: 4,
    pendingOrders: 1,
    cancelledOrders: 1,
    averageOrderValue: 25,
    totalRevenue: 100,
    totalProfit: 40,
  })
  mocks.getSalesByMembers.mockResolvedValue([
    { userId: 'u1', userName: 'Ana', totalSales: 4, totalOrders: 4, totalRevenue: 100 },
  ])
  mocks.getTopProducts.mockResolvedValue([
    { productId: 'p1', productName: 'Latte', totalSold: 12, totalRevenue: 48, averagePrice: 4 },
  ])
  mocks.getSalesByPeriod.mockResolvedValue([{ period: today(), sales: 4, orders: 4, revenue: 100 }])
  mocks.getRecentActivity.mockResolvedValue([
    {
      id: 'order-0000abcd1234',
      type: 'order_completed',
      description: 'Order #order-0000abcd1234 completed',
      amount: 30,
      timestamp: '2026-11-09T10:00:00.000Z',
      userName: 'Ana',
    },
  ])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Analytics', () => {
  it('loads the last 30 days and shows figures, rankings and activity with links', async () => {
    render(<Analytics />)

    expect(await screen.findByText('insights.marginDetail {"value":"40.0"}')).toBeTruthy()
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0)

    const [start, end] = mocks.getOverallMetrics.mock.calls[0] as [string, string]
    expect(Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS)).toBe(30)
    expect(mocks.getTopProducts).toHaveBeenCalledWith(10, start, end)
    expect(mocks.getSalesByPeriod).toHaveBeenCalledWith('day', start, end)

    expect(screen.getByRole('link', { name: 'Latte' }).getAttribute('href')).toBe('#/products/p1')
    expect(screen.getByText('Ana')).toBeTruthy()
    const activity = screen.getByRole('link', { name: /insights\.activityCompleted/ })
    expect(activity.getAttribute('href')).toBe('#/orders/order-0000abcd1234')
    expect(screen.getAllByTestId('trend-bar').length).toBeGreaterThanOrEqual(30)

    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('reloads when the period changes and on refresh', async () => {
    render(<Analytics />)
    await screen.findByText('insights.marginDetail {"value":"40.0"}')

    fireEvent.click(screen.getByRole('radio', { name: 'insights.last7Days' }))
    await waitFor(() => expect(mocks.getOverallMetrics).toHaveBeenCalledTimes(2))
    const [start, end] = mocks.getOverallMetrics.mock.calls[1] as [string, string]
    expect(Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS)).toBe(7)

    fireEvent.click(screen.getByRole('button', { name: 'insights.refresh' }))
    await waitFor(() => expect(mocks.getOverallMetrics).toHaveBeenCalledTimes(3))
  })

  it('shows empty states when the period has no sales', async () => {
    mocks.getOverallMetrics.mockResolvedValue({
      totalSales: null,
      totalOrders: 0,
      completedOrders: null,
      pendingOrders: null,
      cancelledOrders: null,
      averageOrderValue: 0,
      totalRevenue: 0,
      totalProfit: 0,
    })
    mocks.getSalesByMembers.mockResolvedValue([])
    mocks.getTopProducts.mockResolvedValue([])
    mocks.getSalesByPeriod.mockResolvedValue([])
    mocks.getRecentActivity.mockResolvedValue([])
    render(<Analytics />)

    expect(await screen.findByText('insights.noSalesInPeriod')).toBeTruthy()
    expect(screen.getByText('insights.noMemberSales')).toBeTruthy()
    expect(screen.getByText('insights.noProductSales')).toBeTruthy()
    expect(screen.getByText('insights.noRecentActivity')).toBeTruthy()
    expect(screen.getAllByText('0')).toHaveLength(3)
  })

  it('is limited to administrators', async () => {
    mocks.role = 'manager'
    render(<Analytics />)

    expect(await screen.findByText('insights.adminOnlyTitle')).toBeTruthy()
    expect(mocks.getOverallMetrics).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
