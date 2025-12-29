import { useEffect, useState } from 'preact/hooks'
import {
  Button,
  Dialog,
  DialogConfirm,
  Input,
  Pagination,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { type Customer, customerService } from '../services/customers-sqlite'

interface EditCustomerModalProps {
  customer: Customer | null
  isOpen: boolean
  onClose: () => void
  onSave: (customer: Customer) => void
}

function EditCustomerModal({ customer, isOpen, onClose, onSave }: EditCustomerModalProps) {
  const { t } = useTranslation()

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    companyName: '',
    email: '',
    phone: '',
    phoneSecondary: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
    customerType: 'individual' as 'individual' | 'business',
    customerSegment: '',
    creditLimit: 0,
    taxExempt: false,
    taxId: '',
    notes: '',
    isActive: true,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (customer && isOpen) {
      setFormData({
        firstName: customer.firstName,
        lastName: customer.lastName,
        companyName: customer.companyName || '',
        email: customer.email || '',
        phone: customer.phone || '',
        phoneSecondary: customer.phoneSecondary || '',
        addressLine1: customer.addressLine1 || '',
        addressLine2: customer.addressLine2 || '',
        city: customer.city || '',
        state: customer.state || '',
        postalCode: customer.postalCode || '',
        country: customer.country || 'US',
        customerType: customer.customerType,
        customerSegment: customer.customerSegment || '',
        creditLimit: customer.creditLimit || 0,
        taxExempt: customer.taxExempt,
        taxId: customer.taxId || '',
        notes: customer.notes || '',
        isActive: customer.isActive,
      })
    } else if (isOpen) {
      setFormData({
        firstName: '',
        lastName: '',
        companyName: '',
        email: '',
        phone: '',
        phoneSecondary: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'US',
        customerType: 'individual',
        customerSegment: '',
        creditLimit: 0,
        taxExempt: false,
        taxId: '',
        notes: '',
        isActive: true,
      })
    }
    setError('')
  }, [customer, isOpen])

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      let result: { success: boolean; customer?: Customer; error?: string }
      if (customer) {
        result = await customerService.updateCustomer(customer.id, {
          firstName: formData.firstName,
          lastName: formData.lastName,
          companyName: formData.companyName || undefined,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          phoneSecondary: formData.phoneSecondary || undefined,
          addressLine1: formData.addressLine1 || undefined,
          addressLine2: formData.addressLine2 || undefined,
          city: formData.city || undefined,
          state: formData.state || undefined,
          postalCode: formData.postalCode || undefined,
          country: formData.country,
          customerType: formData.customerType,
          customerSegment: formData.customerSegment || undefined,
          creditLimit: formData.creditLimit,
          taxExempt: formData.taxExempt,
          taxId: formData.taxId || undefined,
          notes: formData.notes || undefined,
          isActive: formData.isActive,
        })
      } else {
        result = await customerService.createCustomer({
          firstName: formData.firstName,
          lastName: formData.lastName,
          companyName: formData.companyName || undefined,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          phoneSecondary: formData.phoneSecondary || undefined,
          addressLine1: formData.addressLine1 || undefined,
          addressLine2: formData.addressLine2 || undefined,
          city: formData.city || undefined,
          state: formData.state || undefined,
          postalCode: formData.postalCode || undefined,
          country: formData.country,
          customerType: formData.customerType,
          customerSegment: formData.customerSegment || undefined,
          creditLimit: formData.creditLimit,
          currentBalance: 0,
          taxExempt: formData.taxExempt,
          taxId: formData.taxId || undefined,
          loyaltyPoints: 0,
          totalPurchases: 0,
          totalOrders: 0,
          notes: formData.notes || undefined,
          isActive: formData.isActive,
        })
      }

      if (result.success && result.customer) {
        onSave(result.customer)
        onClose()
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={customer ? t('customers.editCustomer') : t('customers.addCustomer')}
      size="lg"
    >
      <div>
        {error && (
          <div class="bg-red-500/10 backdrop-blur-sm border border-red-400/20 text-red-700 px-4 py-3 rounded-xl mb-6">
            <div class="flex items-center">
              <span class="text-red-500 mr-2">⚠️</span>
              {error}
            </div>
          </div>
        )}

        <div class="backdrop-blur-lg bg-gradient-to-br from-indigo-50/60 to-purple-50/40 border border-indigo-200/50 rounded-2xl p-6 shadow-xl max-h-[70vh] overflow-y-auto">
          <form onSubmit={handleSubmit} class="space-y-6">
            {/* Basic Information */}
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-4">👤 {t('customers.basicInformation')}</h3>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <Input
                    label={t('customers.firstName')}
                    value={formData.firstName}
                    onInput={(e) =>
                      setFormData({
                        ...formData,
                        firstName: (e.target as HTMLInputElement).value,
                      })
                    }
                    required
                    class="bg-white/80 text-gray-900"
                    placeholder={t('customers.enterFirstName')}
                  />
                </div>

                <div>
                  <Input
                    label={t('customers.lastName')}
                    value={formData.lastName}
                    onInput={(e) =>
                      setFormData({
                        ...formData,
                        lastName: (e.target as HTMLInputElement).value,
                      })
                    }
                    required
                    class="bg-white/80 text-gray-900"
                    placeholder={t('customers.enterLastName')}
                  />
                </div>

                <div>
                  <Select
                    label={t('customers.customerType')}
                    value={formData.customerType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        customerType: (e.target as HTMLSelectElement).value as 'individual' | 'business',
                      })
                    }
                    options={[
                      { value: 'individual', label: t('customers.individual') },
                      { value: 'business', label: t('customers.business') },
                    ]}
                    class="bg-white/80"
                  />
                </div>

                {formData.customerType === 'business' && (
                  <div>
                    <Input
                      label={t('customers.companyName')}
                      value={formData.companyName}
                      onInput={(e) =>
                        setFormData({
                          ...formData,
                          companyName: (e.target as HTMLInputElement).value,
                        })
                      }
                      class="bg-white/80 text-gray-900"
                      placeholder={t('customers.enterCompanyName')}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Contact Information */}
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-4">📞 {t('customers.contactInformation')}</h3>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <Input
                    label={t('customers.email')}
                    type="email"
                    value={formData.email}
                    onInput={(e) =>
                      setFormData({
                        ...formData,
                        email: (e.target as HTMLInputElement).value,
                      })
                    }
                    class="bg-white/80 text-gray-900"
                    placeholder={t('customers.enterEmail')}
                  />
                </div>

                <div>
                  <Input
                    label={t('customers.phone')}
                    type="tel"
                    value={formData.phone}
                    onInput={(e) =>
                      setFormData({
                        ...formData,
                        phone: (e.target as HTMLInputElement).value,
                      })
                    }
                    class="bg-white/80 text-gray-900"
                    placeholder={t('customers.enterPhone')}
                  />
                </div>

                <div>
                  <Input
                    label={t('customers.phoneSecondary')}
                    type="tel"
                    value={formData.phoneSecondary}
                    onInput={(e) =>
                      setFormData({
                        ...formData,
                        phoneSecondary: (e.target as HTMLInputElement).value,
                      })
                    }
                    class="bg-white/80 text-gray-900"
                    placeholder={t('customers.enterPhone')}
                  />
                </div>
              </div>
            </div>

            {/* Address Information */}
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-4">📍 {t('customers.address')}</h3>
              <div class="grid grid-cols-1 gap-4">
                <div>
                  <Input
                    label={t('customers.addressLine1')}
                    value={formData.addressLine1}
                    onInput={(e) =>
                      setFormData({
                        ...formData,
                        addressLine1: (e.target as HTMLInputElement).value,
                      })
                    }
                    class="bg-white/80 text-gray-900"
                    placeholder={t('customers.enterAddress')}
                  />
                </div>

                <div>
                  <Input
                    label={t('customers.addressLine2')}
                    value={formData.addressLine2}
                    onInput={(e) =>
                      setFormData({
                        ...formData,
                        addressLine2: (e.target as HTMLInputElement).value,
                      })
                    }
                    class="bg-white/80 text-gray-900"
                    placeholder={t('customers.enterAddress')}
                  />
                </div>

                <div class="grid grid-cols-3 gap-4">
                  <div>
                    <Input
                      label={t('customers.city')}
                      value={formData.city}
                      onInput={(e) =>
                        setFormData({
                          ...formData,
                          city: (e.target as HTMLInputElement).value,
                        })
                      }
                      class="bg-white/80 text-gray-900"
                      placeholder={t('customers.enterCity')}
                    />
                  </div>

                  <div>
                    <Input
                      label={t('customers.state')}
                      value={formData.state}
                      onInput={(e) =>
                        setFormData({
                          ...formData,
                          state: (e.target as HTMLInputElement).value,
                        })
                      }
                      class="bg-white/80 text-gray-900"
                      placeholder={t('customers.enterState')}
                    />
                  </div>

                  <div>
                    <Input
                      label={t('customers.postalCode')}
                      value={formData.postalCode}
                      onInput={(e) =>
                        setFormData({
                          ...formData,
                          postalCode: (e.target as HTMLInputElement).value,
                        })
                      }
                      class="bg-white/80 text-gray-900"
                      placeholder={t('customers.enterPostalCode')}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Information */}
            <div>
              <h3 class="text-lg font-semibold text-gray-900 mb-4">💳 {t('customers.financialInformation')}</h3>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <Input
                    label={t('customers.creditLimit')}
                    type="number"
                    value={formData.creditLimit.toString()}
                    onInput={(e) =>
                      setFormData({
                        ...formData,
                        creditLimit: parseFloat((e.target as HTMLInputElement).value) || 0,
                      })
                    }
                    class="bg-white/80 text-gray-900"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div>
                  <Input
                    label={t('customers.taxId')}
                    value={formData.taxId}
                    onInput={(e) =>
                      setFormData({
                        ...formData,
                        taxId: (e.target as HTMLInputElement).value,
                      })
                    }
                    class="bg-white/80 text-gray-900"
                    placeholder={t('customers.enterTaxId')}
                  />
                </div>

                <div class="col-span-2">
                  <label class="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.taxExempt}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          taxExempt: (e.target as HTMLInputElement).checked,
                        })
                      }
                      class="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span class="text-sm font-medium text-gray-700">{t('customers.taxExempt')}</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Textarea
                label={`📝 ${t('customers.notes')}`}
                value={formData.notes}
                onInput={(e) =>
                  setFormData({
                    ...formData,
                    notes: (e.target as HTMLTextAreaElement).value,
                  })
                }
                rows={3}
                class="bg-white/80 text-gray-900"
                placeholder={t('customers.enterNotes')}
              />
            </div>

            {/* Status */}
            <div>
              <label class="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      isActive: (e.target as HTMLInputElement).checked,
                    })
                  }
                  class="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span class="text-sm font-medium text-gray-700">{t('customers.active')}</span>
                  <p class="text-xs text-gray-500">{formData.isActive ? t('customers.active') : t('customers.inactive')}</p>
                </div>
              </label>
            </div>

            {/* Action Buttons */}
            <div class="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <Button variant="secondary" onClick={onClose} disabled={isLoading}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? t('common.loading') : t('common.save')}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Dialog>
  )
}

export default function Customers() {
  const { user, hasPermission } = useAuth()
  const { t } = useTranslation()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 10

  // Check permissions
  if (!user || !hasPermission('users.view')) {
    return (
      <div class="flex items-center justify-center min-h-screen">
        <div class="text-center space-y-4 p-8 backdrop-blur-lg bg-white/50 border border-gray-200/50 rounded-2xl shadow-xl max-w-md">
          <div class="text-6xl">🔒</div>
          <h2 class="text-2xl font-bold text-gray-900">{t('customers.accessDenied')}</h2>
          <p class="text-gray-600">{t('customers.noPermission')}</p>
        </div>
      </div>
    )
  }

  const loadCustomers = async () => {
    setIsLoading(true)
    try {
      if (searchQuery.trim()) {
        const result = await customerService.searchCustomersPaginated(searchQuery, currentPage, itemsPerPage)
        setCustomers(result.customers)
        setTotalPages(result.totalPages)
        setTotalCount(result.totalCount)
      } else {
        const result = await customerService.getCustomersPaginated(currentPage, itemsPerPage)
        setCustomers(result.customers)
        setTotalPages(result.totalPages)
        setTotalCount(result.totalCount)
      }
    } catch (error) {
      console.error('Failed to load customers:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers()
  }, [currentPage, searchQuery])

  const handleAddCustomer = () => {
    setSelectedCustomer(null)
    setIsEditModalOpen(true)
  }

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer)
    setIsEditModalOpen(true)
  }

  const handleSaveCustomer = () => {
    loadCustomers()
  }

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return

    const result = await customerService.deleteCustomer(customerToDelete.id)
    if (result.success) {
      setCustomerToDelete(null)
      loadCustomers()
    }
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setCurrentPage(1)
  }

  const getCustomerDisplayName = (customer: Customer) => {
    if (customer.customerType === 'business' && customer.companyName) {
      return customer.companyName
    }
    return `${customer.firstName} ${customer.lastName}`
  }

  return (
    <div class="space-y-6 p-8">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">{t('customers.title')}</h1>
          <p class="text-gray-600 mt-1">{t('customers.subtitle')}</p>
        </div>
        {hasPermission('users.create') && (
          <Button onClick={handleAddCustomer}>
            <span class="flex items-center space-x-2">
              <span>➕</span>
              <span>{t('customers.addCustomer')}</span>
            </span>
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <div class="backdrop-blur-lg bg-white/50 border border-gray-200/50 rounded-2xl p-6 shadow-lg">
        <Input
          placeholder={t('customers.searchCustomers')}
          value={searchQuery}
          onInput={(e) => handleSearch((e.target as HTMLInputElement).value)}
          class="bg-white/80"
        />
      </div>

      {/* Customers Table */}
      {isLoading ? (
        <div class="flex items-center justify-center py-12">
          <div class="text-center space-y-3">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p class="text-gray-600">{t('customers.loadingCustomers')}</p>
          </div>
        </div>
      ) : customers.length === 0 ? (
        <div class="backdrop-blur-lg bg-white/50 border border-gray-200/50 rounded-2xl p-12 shadow-lg text-center">
          <div class="text-6xl mb-4">👥</div>
          <h3 class="text-xl font-semibold text-gray-900 mb-2">
            {searchQuery ? t('customers.noCustomersSearch', { query: searchQuery }) : t('customers.emptyCustomers')}
          </h3>
          {!searchQuery && hasPermission('users.create') && (
            <Button onClick={handleAddCustomer} class="mt-4">
              {t('customers.addFirstCustomer')}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div class="backdrop-blur-lg bg-white/50 border border-gray-200/50 rounded-2xl shadow-lg overflow-hidden">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('customers.customerNumber')}</TableHeader>
                  <TableHeader>{t('customers.firstName')}</TableHeader>
                  <TableHeader>{t('customers.customerType')}</TableHeader>
                  <TableHeader>{t('customers.email')}</TableHeader>
                  <TableHeader>{t('customers.phone')}</TableHeader>
                  <TableHeader>{t('customers.loyaltyPoints')}</TableHeader>
                  <TableHeader>{t('customers.totalOrders')}</TableHeader>
                  <TableHeader>{t('customers.status')}</TableHeader>
                  <TableHeader>{t('common.actions')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <span class="font-mono text-sm text-indigo-600">{customer.customerNumber}</span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div class="font-medium text-gray-900">{getCustomerDisplayName(customer)}</div>
                        {customer.customerType === 'business' && (
                          <div class="text-xs text-gray-500">
                            {customer.firstName} {customer.lastName}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          customer.customerType === 'business'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {customer.customerType === 'business' ? '🏢' : '👤'}{' '}
                        {t(`customers.${customer.customerType}`)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span class="text-gray-600">{customer.email || '-'}</span>
                    </TableCell>
                    <TableCell>
                      <span class="text-gray-600">{customer.phone || '-'}</span>
                    </TableCell>
                    <TableCell>
                      <span class="font-semibold text-indigo-600">{customer.loyaltyPoints}</span>
                    </TableCell>
                    <TableCell>
                      <span class="font-semibold text-gray-900">{customer.totalOrders}</span>
                    </TableCell>
                    <TableCell>
                      <span
                        class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          customer.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {customer.isActive ? '✓' : '✗'} {customer.isActive ? t('customers.active') : t('customers.inactive')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div class="flex items-center space-x-2">
                        {hasPermission('users.edit') && (
                          <button
                            onClick={() => handleEditCustomer(customer)}
                            class="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                          >
                            {t('common.edit')}
                          </button>
                        )}
                        {hasPermission('users.delete') && (
                          <button
                            onClick={() => setCustomerToDelete(customer)}
                            class="text-red-600 hover:text-red-800 font-medium text-sm"
                          >
                            {t('common.delete')}
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
            />
          )}

          {/* Summary */}
          <div class="text-center text-sm text-gray-600">
            {t('customers.customersTotal', {
              count: totalCount,
              unit: totalCount === 1 ? t('customers.customer') : t('customers.customers'),
            })}
          </div>
        </>
      )}

      {/* Edit/Add Modal */}
      <EditCustomerModal
        customer={selectedCustomer}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveCustomer}
      />

      {/* Delete Confirmation */}
      <DialogConfirm
        isOpen={!!customerToDelete}
        onClose={() => setCustomerToDelete(null)}
        onConfirm={handleDeleteCustomer}
        title={t('customers.deleteConfirm')}
        message={t('customers.deleteMessage')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />
    </div>
  )
}
