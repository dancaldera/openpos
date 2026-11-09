import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { companySettingsService } from '../../services/company-settings-turso'
import type { Customer } from '../../services/customers-turso'

export type TranslateFn = (key: string, params?: Record<string, string | number | boolean>) => string
export type CustomerType = Customer['customerType']
export type BusinessProfile = 'general' | 'butcher' | 'optical' | 'medical' | 'grocery' | 'disposable' | 'other'
export type PreferredContactMethod = 'phone' | 'email' | 'whatsapp' | 'sms' | 'inPerson'

export const CUSTOMER_TYPES: CustomerType[] = ['individual', 'business']

export const BUSINESS_PROFILES: BusinessProfile[] = [
  'general',
  'butcher',
  'optical',
  'medical',
  'grocery',
  'disposable',
  'other',
]

export const PREFERRED_CONTACT_METHODS: PreferredContactMethod[] = ['phone', 'email', 'whatsapp', 'sms', 'inPerson']

/** Service validation messages that have a translated equivalent. */
const CUSTOMER_ERROR_TRANSLATIONS: Record<string, string> = {
  'First name is required': 'customers.firstNameRequired',
  'Last name is required': 'customers.lastNameRequired',
  'Company name is required': 'customers.companyNameRequired',
  'Invalid email format': 'customers.invalidEmail',
  'Customer with this email already exists': 'customers.duplicateEmail',
}

export interface CustomerContextFields {
  businessProfile: BusinessProfile
  preferredContactMethod: PreferredContactMethod | ''
  referenceCode: string
  serviceNotes: string
}

export interface CustomerFormData extends CustomerContextFields {
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
  customerType: CustomerType
  customerSegment: string
  creditLimit: number
  taxExempt: boolean
  taxId: string
  notes: string
  isActive: boolean
  tagsInput: string
}

export function createEmptyFormData(): CustomerFormData {
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

function safeCustomFields(customFields?: Record<string, unknown>): Record<string, unknown> {
  if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) return {}
  return customFields
}

function isBusinessProfile(value: unknown): value is BusinessProfile {
  return typeof value === 'string' && BUSINESS_PROFILES.includes(value as BusinessProfile)
}

function isPreferredContactMethod(value: unknown): value is PreferredContactMethod {
  return typeof value === 'string' && PREFERRED_CONTACT_METHODS.includes(value as PreferredContactMethod)
}

/** Business-context fields the client stores inside `customFields`. */
export function parseCustomerContext(customFields?: Record<string, unknown>): CustomerContextFields {
  const fields = safeCustomFields(customFields)
  return {
    businessProfile: isBusinessProfile(fields.businessProfile) ? fields.businessProfile : 'general',
    preferredContactMethod: isPreferredContactMethod(fields.preferredContactMethod)
      ? fields.preferredContactMethod
      : '',
    referenceCode: typeof fields.referenceCode === 'string' ? fields.referenceCode : '',
    serviceNotes: typeof fields.serviceNotes === 'string' ? fields.serviceNotes : '',
  }
}

export function formDataFromCustomer(customer: Customer): CustomerFormData {
  const context = parseCustomerContext(customer.customFields)
  return {
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
    ...context,
    tagsInput: customer.tags?.join(', ') || '',
  }
}

export function parseTagsInput(tagsInput: string): string[] {
  const unique = new Set<string>()
  for (const tag of tagsInput.split(',')) {
    const normalized = tag.trim()
    if (normalized) unique.add(normalized)
  }
  return [...unique]
}

/** Merge the business-context fields into existing custom fields without dropping unrelated keys. */
export function buildCustomerCustomFields(
  existing: Record<string, unknown> | undefined,
  context: CustomerContextFields,
): Record<string, unknown> {
  const next = { ...safeCustomFields(existing) }
  delete next.businessProfile
  delete next.preferredContactMethod
  delete next.referenceCode
  delete next.serviceNotes

  next.businessProfile = context.businessProfile
  if (context.preferredContactMethod) next.preferredContactMethod = context.preferredContactMethod
  if (context.referenceCode) next.referenceCode = context.referenceCode
  if (context.serviceNotes) next.serviceNotes = context.serviceNotes
  return next
}

function trimToUndefined(value: string): string | undefined {
  return value.trim() || undefined
}

export type CustomerField = 'firstName' | 'lastName' | 'companyName'

/** Same identity rules as before: businesses need a company name, individuals a first and last name. */
export function validateCustomerForm(
  formData: CustomerFormData,
  t: TranslateFn,
): { field: CustomerField; message: string } | null {
  if (formData.customerType === 'business') {
    if (!formData.companyName.trim()) return { field: 'companyName', message: t('customers.companyNameRequired') }
    return null
  }
  if (!formData.firstName.trim()) return { field: 'firstName', message: t('customers.firstNameRequired') }
  if (!formData.lastName.trim()) return { field: 'lastName', message: t('customers.lastNameRequired') }
  return null
}

export function buildCustomerPayload(formData: CustomerFormData, existing: Customer | null) {
  const tags = parseTagsInput(formData.tagsInput)
  return {
    firstName: formData.firstName.trim(),
    lastName: formData.lastName.trim(),
    companyName: trimToUndefined(formData.companyName),
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
    customFields: buildCustomerCustomFields(existing?.customFields, {
      businessProfile: formData.businessProfile,
      preferredContactMethod: formData.preferredContactMethod,
      referenceCode: formData.referenceCode.trim(),
      serviceNotes: formData.serviceNotes.trim(),
    }),
  }
}

export function customerErrorMessage(error: string | undefined, t: TranslateFn): string {
  if (!error) return t('errors.generic')
  const key = CUSTOMER_ERROR_TRANSLATIONS[error]
  return key ? t(key) : error
}

/** Company name first for businesses, person name first otherwise; `fallback` when neither is set. */
export function customerDisplayName(customer: Customer, fallback: string): string {
  const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
  if (customer.customerType === 'business') {
    return customer.companyName || fullName || customer.customerNumber || fallback
  }
  return fullName || customer.companyName || customer.customerNumber || fallback
}

export function customerTypeLabel(type: CustomerType, t: TranslateFn): string {
  return t(`customers.${type}`)
}

export function customerStatusLabel(isActive: boolean, t: TranslateFn): string {
  return isActive ? t('customers.active') : t('customers.inactive')
}

/** Customer screens reuse the `users.*` permissions, as the previous page did. */
export function useCustomerPermissions() {
  const { user, hasPermission } = useAuth()
  return {
    canView: Boolean(user) && hasPermission('users.view'),
    canCreate: hasPermission('users.create'),
    canEdit: hasPermission('users.edit'),
    canDelete: hasPermission('users.delete'),
  }
}

/** Store currency symbol for money figures; falls back to `$` until settings load. */
export function useCurrencySymbol(): string {
  const [symbol, setSymbol] = useState('$')
  useEffect(() => {
    let isCancelled = false
    companySettingsService
      .getSettings()
      .then((settings) => {
        if (!isCancelled && settings?.currencySymbol) setSymbol(settings.currencySymbol)
      })
      .catch(() => undefined)
    return () => {
      isCancelled = true
    }
  }, [])
  return symbol
}
