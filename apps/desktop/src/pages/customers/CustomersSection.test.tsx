// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Customer } from '../../services/customers-turso'

const mocks = vi.hoisted(() => ({
  getCustomers: vi.fn(),
  searchCustomers: vi.fn(),
  getCustomer: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  permissions: ['users.view', 'users.create', 'users.edit', 'users.delete'] as string[],
}))

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Ana', role: 'manager' },
    hasPermission: (permission: string) => mocks.permissions.includes(permission),
    hasRole: () => false,
  }),
}))
vi.mock('../../lib/router', () => ({ hrefFor: (path: string) => `#/${path}`, navigate: mocks.navigate }))
vi.mock('../../lib/toast', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: vi.fn(), warning: vi.fn() },
}))
vi.mock('../../services/customers-turso', () => ({
  customerService: {
    getCustomers: mocks.getCustomers,
    searchCustomers: mocks.searchCustomers,
    getCustomer: mocks.getCustomer,
    createCustomer: mocks.createCustomer,
    updateCustomer: mocks.updateCustomer,
    deleteCustomer: mocks.deleteCustomer,
  },
}))
vi.mock('../../services/company-settings-turso', () => ({
  companySettingsService: { getSettings: vi.fn(async () => ({ currencySymbol: '$' })) },
}))

// happy-dom rejects `finished` when Astryx cancels a segmented-control animation on unmount.
const animate = Element.prototype.animate
Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
  const animation = animate.apply(this, args)
  animation.finished.catch(() => undefined)
  return animation
}

const { default: CustomersSection } = await import('./CustomersSection')

const customer: Customer = {
  id: '7',
  customerNumber: 'CUST-00007',
  firstName: 'Lucia',
  lastName: 'Perez',
  email: 'lucia@example.com',
  phone: '555-0100',
  country: 'US',
  customerType: 'individual',
  creditLimit: 100,
  currentBalance: 0,
  taxExempt: false,
  loyaltyPoints: 40,
  totalPurchases: 250,
  totalOrders: 5,
  isActive: true,
  tags: ['vip'],
  customFields: { businessProfile: 'general', legacy: 'keep' },
  createdAt: '2026-01-02T10:00:00.000Z',
  updatedAt: '2026-01-02T10:00:00.000Z',
}

const business: Customer = {
  ...customer,
  id: '8',
  customerNumber: 'CUST-00008',
  firstName: '',
  lastName: '',
  companyName: 'Acme Clinic',
  customerType: 'business',
}

const noEmoji = () => expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)

beforeEach(() => {
  mocks.permissions = ['users.view', 'users.create', 'users.edit', 'users.delete']
  mocks.getCustomers.mockResolvedValue([customer, business])
  mocks.searchCustomers.mockResolvedValue([business])
  mocks.getCustomer.mockResolvedValue(customer)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CustomersSection', () => {
  it('lists customers with links to their pages and no emoji', async () => {
    render(<CustomersSection params={[]} />)
    const link = await screen.findByRole('link', { name: 'Lucia Perez' })
    expect(link.getAttribute('href')).toBe('#/customers/7')
    expect(screen.getByRole('link', { name: 'Acme Clinic' }).getAttribute('href')).toBe('#/customers/8')
    expect(screen.getByRole('link', { name: 'customers.newCustomer' }).getAttribute('href')).toBe('#/customers/new')
    expect(screen.queryByRole('dialog')).toBeNull()
    noEmoji()
  })

  it('filters by customer type', async () => {
    render(<CustomersSection params={[]} />)
    await screen.findByRole('link', { name: 'Lucia Perez' })
    fireEvent.click(screen.getByRole('radio', { name: 'customers.business' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Lucia Perez' })).toBeNull())
    expect(screen.getByRole('link', { name: 'Acme Clinic' })).toBeTruthy()
  })

  it('searches through the customer service', async () => {
    render(<CustomersSection params={[]} />)
    await screen.findByRole('link', { name: 'Lucia Perez' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'common.search' }), { target: { value: 'acme' } })
    await waitFor(() => expect(mocks.searchCustomers).toHaveBeenCalledWith('acme'))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Lucia Perez' })).toBeNull())
  })

  it('hides create when the member lacks users.create', async () => {
    mocks.permissions = ['users.view']
    render(<CustomersSection params={[]} />)
    await screen.findByRole('link', { name: 'Lucia Perez' })
    expect(screen.queryByRole('link', { name: 'customers.newCustomer' })).toBeNull()
  })

  it('denies access without users.view', () => {
    mocks.permissions = []
    render(<CustomersSection params={[]} />)
    expect(screen.getByText('customers.accessDenied')).toBeTruthy()
    expect(mocks.getCustomers).not.toHaveBeenCalled()
  })

  it('creates a customer from the full-page form and opens it', async () => {
    mocks.createCustomer.mockResolvedValue({ success: true, customer: { ...customer, id: '99' } })
    render(<CustomersSection params={['new']} />)
    fireEvent.change(screen.getByRole('textbox', { name: /customers\.firstName/ }), { target: { value: ' Mario ' } })
    fireEvent.change(screen.getByRole('textbox', { name: /customers\.lastName/ }), { target: { value: 'Rossi' } })
    fireEvent.change(screen.getByRole('textbox', { name: /customers\.tags/ }), {
      target: { value: 'vip, weekly, vip' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'customers.createCustomer' })[0] as HTMLElement)
    await waitFor(() => expect(mocks.createCustomer).toHaveBeenCalled())
    expect(mocks.createCustomer.mock.calls[0]?.[0]).toMatchObject({
      firstName: 'Mario',
      lastName: 'Rossi',
      customerType: 'individual',
      country: 'US',
      creditLimit: 0,
      isActive: true,
      tags: ['vip', 'weekly'],
      customFields: { businessProfile: 'general' },
      currentBalance: 0,
      loyaltyPoints: 0,
      totalPurchases: 0,
      totalOrders: 0,
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('customers.customerCreated')
    expect(mocks.navigate).toHaveBeenCalledWith('customers/99')
    noEmoji()
  })

  it('requires a company name for business customers', async () => {
    render(<CustomersSection params={['new']} />)
    fireEvent.click(screen.getByRole('radio', { name: 'customers.business' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'customers.createCustomer' })[0] as HTMLElement)
    expect((await screen.findAllByText('customers.companyNameRequired')).length).toBeGreaterThan(0)
    expect(mocks.createCustomer).not.toHaveBeenCalled()
  })

  it('edits a customer and keeps unrelated custom fields', async () => {
    mocks.updateCustomer.mockResolvedValue({ success: true, customer })
    render(<CustomersSection params={['7', 'edit']} />)
    const email = await screen.findByRole('textbox', { name: /customers\.email/ })
    fireEvent.change(email, { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'customers.saveChanges' })[0] as HTMLElement)
    await waitFor(() => expect(mocks.updateCustomer).toHaveBeenCalled())
    const [id, payload] = mocks.updateCustomer.mock.calls[0] ?? []
    expect(id).toBe('7')
    expect(payload).toMatchObject({
      email: 'new@example.com',
      customFields: { legacy: 'keep', businessProfile: 'general' },
    })
    expect(mocks.navigate).toHaveBeenCalledWith('customers/7')
  })

  it('asks before leaving a form with unsaved changes', async () => {
    render(<CustomersSection params={['new']} />)
    fireEvent.change(screen.getByRole('textbox', { name: /customers\.firstName/ }), { target: { value: 'Mario' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'common.cancel' })[0] as HTMLElement)
    expect(mocks.navigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'customers.discardChanges' }))
    expect(mocks.navigate).toHaveBeenCalledWith('customers')
  })

  it('shows the customer page with purchase stats and an edit link', async () => {
    render(<CustomersSection params={['7']} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Lucia Perez' })).toBeTruthy()
    expect(screen.getByText('$250.00')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'common.edit' }).getAttribute('href')).toBe('#/customers/7/edit')
    noEmoji()
  })

  it('deactivates a customer after an in-page confirmation', async () => {
    mocks.updateCustomer.mockResolvedValue({ success: true, customer: { ...customer, isActive: false } })
    render(<CustomersSection params={['7']} />)
    fireEvent.click(await screen.findByRole('button', { name: 'customers.deactivate' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.updateCustomer).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'customers.deactivate' }))
    await waitFor(() => expect(mocks.updateCustomer).toHaveBeenCalledWith('7', { isActive: false }))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('customers.customerDeactivated')
  })

  it('deletes a customer after an in-page confirmation', async () => {
    mocks.deleteCustomer.mockResolvedValue({ success: true })
    render(<CustomersSection params={['7']} />)
    fireEvent.click(await screen.findByRole('button', { name: 'customers.deleteCustomer' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }))
    await waitFor(() => expect(mocks.deleteCustomer).toHaveBeenCalledWith('7'))
    expect(mocks.navigate).toHaveBeenCalledWith('customers')
  })

  it('hides edit and delete without the matching permissions', async () => {
    mocks.permissions = ['users.view']
    render(<CustomersSection params={['7']} />)
    await screen.findByRole('heading', { level: 1, name: 'Lucia Perez' })
    expect(screen.queryByRole('link', { name: 'common.edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'customers.deleteCustomer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'customers.deactivate' })).toBeNull()
  })
})
