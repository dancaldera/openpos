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
import { type Customer, customerService } from '../services/customers-turso'

type TranslateFn = (key: string, params?: Record<string, string | number | boolean>) => string
type BusinessProfile = 'general' | 'butcher' | 'optical' | 'medical' | 'grocery' | 'disposable' | 'other'
type PreferredContactMethod = 'phone' | 'email' | 'whatsapp' | 'sms' | 'inPerson'
type PreferredContactMethodValue = PreferredContactMethod | ''

interface CustomerContextFields {
  businessProfile: BusinessProfile
  preferredContactMethod: PreferredContactMethodValue
  referenceCode: string
  serviceNotes: string
}

interface CustomerFormData {
  firstName: string
  lastName: string
  companyName: string
  email: string
  phone: string
  phoneSecondary: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  customerType: 'individual' | 'business'
  customerSegment: string
  creditLimit: number
  taxExempt: boolean
  taxId: string
  notes: string
  isActive: boolean
  businessProfile: BusinessProfile
  preferredContactMethod: PreferredContactMethodValue
  referenceCode: string
  serviceNotes: string
  tagsInput: string
}

interface EditCustomerModalProps {
  customer: Customer | null
  isOpen: boolean
  onClose: () => void
  onSave: (customer: Customer) => void
}

const BUSINESS_PROFILES: BusinessProfile[] = [
  'general',
  'butcher',
  'optical',
  'medical',
  'grocery',
  'disposable',
  'other',
]

const PREFERRED_CONTACT_METHODS: PreferredContactMethod[] = ['phone', 'email', 'whatsapp', 'sms', 'inPerson']

const CUSTOMER_ERROR_TRANSLATIONS: Record<string, string> = {
  'First name is required': 'customers.firstNameRequired',
  'Last name is required': 'customers.lastNameRequired',
  'Company name is required': 'customers.companyNameRequired',
  'Invalid email format': 'customers.invalidEmail',
  'Customer with this email already exists': 'customers.duplicateEmail',
}

function createEmptyFormData(): CustomerFormData {
  return {
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
    businessProfile: 'general',
    preferredContactMethod: '',
    referenceCode: '',
    serviceNotes: '',
    tagsInput: '',
  }
}

function trimToUndefined(value: string) {
  const normalized = value.trim()
  return normalized || undefined
}

function getSafeCustomFields(customFields?: Record<string, unknown>): Record<string, unknown> {
  if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) {
    return {}
  }

  return customFields
}

function isBusinessProfile(value: unknown): value is BusinessProfile {
  return typeof value === 'string' && BUSINESS_PROFILES.includes(value as BusinessProfile)
}

function isPreferredContactMethod(value: unknown): value is PreferredContactMethod {
  return typeof value === 'string' && PREFERRED_CONTACT_METHODS.includes(value as PreferredContactMethod)
}

function parseCustomerContext(customFields?: Record<string, unknown>): CustomerContextFields {
  const safeCustomFields = getSafeCustomFields(customFields)

  return {
    businessProfile: isBusinessProfile(safeCustomFields.businessProfile) ? safeCustomFields.businessProfile : 'general',
    preferredContactMethod: isPreferredContactMethod(safeCustomFields.preferredContactMethod)
      ? safeCustomFields.preferredContactMethod
      : '',
    referenceCode: typeof safeCustomFields.referenceCode === 'string' ? safeCustomFields.referenceCode : '',
    serviceNotes: typeof safeCustomFields.serviceNotes === 'string' ? safeCustomFields.serviceNotes : '',
  }
}

function parseTagsInput(tagsInput: string) {
  const uniqueTags = new Set<string>()

  for (const tag of tagsInput.split(',')) {
    const normalizedTag = tag.trim()
    if (normalizedTag) {
      uniqueTags.add(normalizedTag)
    }
  }

  return [...uniqueTags]
}

function buildCustomerCustomFields(
  existingCustomFields: Record<string, unknown> | undefined,
  contextFields: CustomerContextFields,
) {
  const nextCustomFields = { ...getSafeCustomFields(existingCustomFields) }

  delete nextCustomFields.businessProfile
  delete nextCustomFields.preferredContactMethod
  delete nextCustomFields.referenceCode
  delete nextCustomFields.serviceNotes

  nextCustomFields.businessProfile = contextFields.businessProfile

  if (contextFields.preferredContactMethod) {
    nextCustomFields.preferredContactMethod = contextFields.preferredContactMethod
  }

  if (contextFields.referenceCode) {
    nextCustomFields.referenceCode = contextFields.referenceCode
  }

  if (contextFields.serviceNotes) {
    nextCustomFields.serviceNotes = contextFields.serviceNotes
  }

  return nextCustomFields
}

function getCustomerErrorMessage(error: string | undefined, t: TranslateFn) {
  if (!error) {
    return t('errors.generic')
  }

  return CUSTOMER_ERROR_TRANSLATIONS[error] ? t(CUSTOMER_ERROR_TRANSLATIONS[error]) : error
}

function getBusinessProfileContent(profile: BusinessProfile, t: TranslateFn) {
  return {
    helperText: t(`customers.businessProfiles.${profile}.helper`),
    referencePlaceholder: t(`customers.businessProfiles.${profile}.referencePlaceholder`),
    serviceNotesPlaceholder: t(`customers.businessProfiles.${profile}.serviceNotesPlaceholder`),
  }
}

function getCustomerDisplayName(customer: Customer, t: TranslateFn) {
  const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim()

  if (customer.customerType === 'business') {
    return customer.companyName || fullName || customer.customerNumber || t('customers.unnamedCustomer')
  }

  return fullName || customer.companyName || customer.customerNumber || t('customers.unnamedCustomer')
}

function getCustomerSecondaryInfo(customer: Customer) {
  const secondaryItems: string[] = []

  if (customer.customerSegment) {
    secondaryItems.push(customer.customerSegment)
  }

  if (customer.tags?.length) {
    secondaryItems.push(...customer.tags.slice(0, 2))
  }

  return secondaryItems.join(' • ')
}

function EditCustomerModal({ customer, isOpen, onClose, onSave }: EditCustomerModalProps) {
  const { t } = useTranslation()
  const panelClass = 'rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900'
  const sectionTitleClass = 'mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100'
  const [formData, setFormData] = useState<CustomerFormData>(createEmptyFormData())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (customer && isOpen) {
      const customerContext = parseCustomerContext(customer.customFields)

      setFormData({
        firstName: customer.firstName || '',
        lastName: customer.lastName || '',
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
        businessProfile: customerContext.businessProfile,
        preferredContactMethod: customerContext.preferredContactMethod,
        referenceCode: customerContext.referenceCode,
        serviceNotes: customerContext.serviceNotes,
        tagsInput: customer.tags?.join(', ') || '',
      })
    } else if (isOpen) {
      setFormData(createEmptyFormData())
    }

    setError('')
  }, [customer, isOpen])

  const isBusinessCustomer = formData.customerType === 'business'
  const profileContent = getBusinessProfileContent(formData.businessProfile, t)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    const firstName = formData.firstName.trim()
    const lastName = formData.lastName.trim()
    const companyName = formData.companyName.trim()

    if (isBusinessCustomer) {
      if (!companyName) {
        setError(t('customers.companyNameRequired'))
        setIsLoading(false)
        return
      }
    } else {
      if (!firstName) {
        setError(t('customers.firstNameRequired'))
        setIsLoading(false)
        return
      }

      if (!lastName) {
        setError(t('customers.lastNameRequired'))
        setIsLoading(false)
        return
      }
    }

    const tags = parseTagsInput(formData.tagsInput)
    const customFields = buildCustomerCustomFields(customer?.customFields, {
      businessProfile: formData.businessProfile,
      preferredContactMethod: formData.preferredContactMethod,
      referenceCode: formData.referenceCode.trim(),
      serviceNotes: formData.serviceNotes.trim(),
    })

    try {
      const customerPayload = {
        firstName,
        lastName,
        companyName: trimToUndefined(companyName),
        email: trimToUndefined(formData.email),
        phone: trimToUndefined(formData.phone),
        phoneSecondary: trimToUndefined(formData.phoneSecondary),
        addressLine1: trimToUndefined(formData.addressLine1),
        addressLine2: trimToUndefined(formData.addressLine2),
        city: trimToUndefined(formData.city),
        state: trimToUndefined(formData.state),
        postalCode: trimToUndefined(formData.postalCode),
        country: formData.country,
        customerType: formData.customerType,
        customerSegment: trimToUndefined(formData.customerSegment),
        creditLimit: formData.creditLimit,
        taxExempt: formData.taxExempt,
        taxId: trimToUndefined(formData.taxId),
        notes: trimToUndefined(formData.notes),
        isActive: formData.isActive,
        tags: tags.length > 0 ? tags : undefined,
        customFields,
      }

      let result: { success: boolean; customer?: Customer; error?: string }

      if (customer) {
        result = await customerService.updateCustomer(customer.id, customerPayload)
      } else {
        result = await customerService.createCustomer({
          ...customerPayload,
          currentBalance: 0,
          loyaltyPoints: 0,
          totalPurchases: 0,
          totalOrders: 0,
        })
      }

      if (result.success && result.customer) {
        onSave(result.customer)
        onClose()
      } else {
        setError(getCustomerErrorMessage(result.error, t))
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
          <div class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            <div class="flex items-center">
              <span class="text-red-500 mr-2">⚠️</span>
              {error}
            </div>
          </div>
        )}

        <div class={`${panelClass} max-h-[70vh] overflow-y-auto`}>
          <form onSubmit={handleSubmit} class="space-y-6">
            <div>
              <h3 class={sectionTitleClass}>{t('customers.basicInformation')}</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label={isBusinessCustomer ? t('customers.contactFirstName') : t('customers.firstName')}
                  value={formData.firstName}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      firstName: (e.target as HTMLInputElement).value,
                    })
                  }
                  required={!isBusinessCustomer}
                  helperText={isBusinessCustomer ? t('customers.contactPersonOptional') : undefined}
                  class="bg-white/80 text-gray-900"
                  placeholder={
                    isBusinessCustomer ? t('customers.enterContactFirstName') : t('customers.enterFirstName')
                  }
                />

                <Input
                  label={isBusinessCustomer ? t('customers.contactLastName') : t('customers.lastName')}
                  value={formData.lastName}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      lastName: (e.target as HTMLInputElement).value,
                    })
                  }
                  required={!isBusinessCustomer}
                  helperText={isBusinessCustomer ? t('customers.contactPersonOptional') : undefined}
                  class="bg-white/80 text-gray-900"
                  placeholder={isBusinessCustomer ? t('customers.enterContactLastName') : t('customers.enterLastName')}
                />

                <Input
                  label={t('customers.companyName')}
                  value={formData.companyName}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      companyName: (e.target as HTMLInputElement).value,
                    })
                  }
                  required={isBusinessCustomer}
                  helperText={
                    isBusinessCustomer ? t('customers.companyNameBusinessHelp') : t('customers.companyNameOptionalHelp')
                  }
                  class="bg-white/80 text-gray-900"
                  placeholder={t('customers.enterCompanyName')}
                />

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
            </div>

            <div>
              <h3 class={sectionTitleClass}>{t('customers.contactInformation')}</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  placeholder={t('customers.enterSecondaryPhone')}
                />
              </div>
            </div>

            <div>
              <h3 class={sectionTitleClass}>{t('customers.address')}</h3>
              <div class="grid grid-cols-1 gap-4">
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
                  placeholder={t('customers.enterAddressLine2')}
                />

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            <div>
              <h3 class={sectionTitleClass}>{t('customers.businessContext')}</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label={t('customers.businessProfile')}
                  value={formData.businessProfile}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      businessProfile: (e.target as HTMLSelectElement).value as BusinessProfile,
                    })
                  }
                  helperText={profileContent.helperText}
                  options={BUSINESS_PROFILES.map((profile) => ({
                    value: profile,
                    label: t(`customers.businessProfiles.${profile}.label`),
                  }))}
                  class="bg-white/80"
                />

                <Select
                  label={t('customers.preferredContactMethod')}
                  value={formData.preferredContactMethod}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      preferredContactMethod: (e.target as HTMLSelectElement).value as PreferredContactMethodValue,
                    })
                  }
                  helperText={t('customers.preferredContactMethodHelp')}
                  placeholder={t('customers.selectPreferredContactMethod')}
                  options={PREFERRED_CONTACT_METHODS.map((method) => ({
                    value: method,
                    label: t(`customers.contactMethods.${method}`),
                  }))}
                  class="bg-white/80"
                />

                <Input
                  label={t('customers.customerSegment')}
                  value={formData.customerSegment}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      customerSegment: (e.target as HTMLInputElement).value,
                    })
                  }
                  helperText={t('customers.customerSegmentHelp')}
                  class="bg-white/80 text-gray-900"
                  placeholder={t('customers.enterCustomerSegment')}
                />

                <Input
                  label={t('customers.referenceCode')}
                  value={formData.referenceCode}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      referenceCode: (e.target as HTMLInputElement).value,
                    })
                  }
                  helperText={t('customers.referenceCodeHelp')}
                  class="bg-white/80 text-gray-900"
                  placeholder={profileContent.referencePlaceholder}
                />

                <Input
                  label={t('customers.tags')}
                  value={formData.tagsInput}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      tagsInput: (e.target as HTMLInputElement).value,
                    })
                  }
                  helperText={t('customers.tagsHelp')}
                  class="bg-white/80 text-gray-900"
                  placeholder={t('customers.enterTags')}
                />

                <div class="md:col-span-2">
                  <Textarea
                    label={t('customers.serviceNotes')}
                    value={formData.serviceNotes}
                    onInput={(e) =>
                      setFormData({
                        ...formData,
                        serviceNotes: (e.target as HTMLTextAreaElement).value,
                      })
                    }
                    rows={3}
                    helperText={t(`customers.businessProfiles.${formData.businessProfile}.serviceNotesHelp`)}
                    class="bg-white/80 text-gray-900"
                    placeholder={profileContent.serviceNotesPlaceholder}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 class={sectionTitleClass}>{t('customers.financialInformation')}</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                <div class="md:col-span-2">
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
                      class="h-5 w-5 rounded border-gray-300 bg-white text-indigo-600 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900"
                    />
                    <div>
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('customers.taxExempt')}
                      </span>
                      <p class="text-xs text-gray-500 dark:text-gray-400">{t('customers.taxExemptDescription')}</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div>
              <Textarea
                label={t('customers.internalNotes')}
                value={formData.notes}
                onInput={(e) =>
                  setFormData({
                    ...formData,
                    notes: (e.target as HTMLTextAreaElement).value,
                  })
                }
                rows={3}
                helperText={t('customers.internalNotesHelp')}
                class="bg-white/80 text-gray-900"
                placeholder={t('customers.enterInternalNotes')}
              />
            </div>

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
                  class="h-5 w-5 rounded border-gray-300 bg-white text-indigo-600 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900"
                />
                <div>
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{t('customers.active')}</span>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {formData.isActive ? t('customers.activeCustomerHelp') : t('customers.inactiveCustomerHelp')}
                  </p>
                </div>
              </label>
            </div>

            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
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
  const panelClass = 'rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'

  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 10

  if (!user || !hasPermission('users.view')) {
    return (
      <div class="flex items-center justify-center min-h-screen">
        <div class={`${panelClass} max-w-md space-y-4 p-8 text-center`}>
          <div class="text-6xl">🔒</div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('customers.accessDenied')}</h2>
          <p class="text-gray-600 dark:text-gray-400">{t('customers.noPermission')}</p>
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
    } catch (loadError) {
      console.error('Failed to load customers:', loadError)
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

  const handleSaveCustomer = (_customer: Customer) => {
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

  return (
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
        {hasPermission('users.create') && (
          <Button class="w-full sm:w-auto" onClick={handleAddCustomer}>
            {t('customers.addCustomer')}
          </Button>
        )}
      </div>

      <div class={`${panelClass} p-6`}>
        <Input
          placeholder={t('customers.searchCustomers')}
          value={searchQuery}
          onInput={(e) => handleSearch((e.target as HTMLInputElement).value)}
        />
      </div>

      {isLoading ? (
        <div class="flex items-center justify-center py-12">
          <div class="text-center space-y-3">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p class="text-gray-600 dark:text-gray-400">{t('customers.loadingCustomers')}</p>
          </div>
        </div>
      ) : customers.length === 0 ? (
        <div class={`${panelClass} p-12 text-center`}>
          <div class="text-6xl mb-4">👥</div>
          <h3 class="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
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
          <div class={`${panelClass} overflow-hidden`}>
            <Table striped>
              <TableHead>
                <TableRow class="bg-gray-50 dark:bg-gray-800/60">
                  <TableHeader>{t('customers.customerNumber')}</TableHeader>
                  <TableHeader>{t('customers.customerName')}</TableHeader>
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
                {customers.map((customer) => {
                  const secondaryInfo = getCustomerSecondaryInfo(customer)

                  return (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <span class="font-mono text-sm text-indigo-600 dark:text-indigo-300">
                          {customer.customerNumber}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div class="font-medium text-gray-900 dark:text-gray-100">
                            {getCustomerDisplayName(customer, t)}
                          </div>
                          {secondaryInfo && <div class="text-xs text-gray-500 dark:text-gray-400">{secondaryInfo}</div>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          class={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            customer.customerType === 'business'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/30 dark:text-purple-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300'
                          }`}
                        >
                          {t(`customers.${customer.customerType}`)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span class="text-gray-600 dark:text-gray-400">{customer.email || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <span class="text-gray-600 dark:text-gray-400">{customer.phone || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <span class="font-semibold text-indigo-600 dark:text-indigo-300">{customer.loyaltyPoints}</span>
                      </TableCell>
                      <TableCell>
                        <span class="font-semibold text-gray-900 dark:text-gray-100">{customer.totalOrders}</span>
                      </TableCell>
                      <TableCell>
                        <span
                          class={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            customer.isActive
                              ? 'bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                          }`}
                        >
                          {customer.isActive ? t('customers.active') : t('customers.inactive')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div class="flex items-center space-x-2">
                          {hasPermission('users.edit') && (
                            <button
                              type="button"
                              onClick={() => handleEditCustomer(customer)}
                              class="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
                            >
                              {t('common.edit')}
                            </button>
                          )}
                          {hasPermission('users.delete') && (
                            <button
                              type="button"
                              onClick={() => setCustomerToDelete(customer)}
                              class="text-sm font-medium text-red-600 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
                            >
                              {t('common.delete')}
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalCount={totalCount}
              pageSize={itemsPerPage}
            />
          )}

          <div class="text-center text-sm text-gray-600 dark:text-gray-400">
            {t('customers.customersTotal', {
              count: totalCount,
              unit: totalCount === 1 ? t('customers.customer') : t('customers.customers'),
            })}
          </div>
        </>
      )}

      <EditCustomerModal
        customer={selectedCustomer}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveCustomer}
      />

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
