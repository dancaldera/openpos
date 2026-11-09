import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { Page } from '../../components/page/Page'
import { useTranslation } from '../../hooks/useTranslation'
import { hrefFor, navigate } from '../../lib/router'
import { toast } from '../../lib/toast'
import { type Customer, customerService } from '../../services/customers-turso'
import {
  BUSINESS_PROFILES,
  type BusinessProfile,
  buildCustomerPayload,
  CUSTOMER_TYPES,
  type CustomerField,
  type CustomerFormData,
  type CustomerType,
  createEmptyFormData,
  customerDisplayName,
  customerErrorMessage,
  customerTypeLabel,
  formDataFromCustomer,
  PREFERRED_CONTACT_METHODS,
  type PreferredContactMethod,
  useCustomerPermissions,
  validateCustomerForm,
} from './customerMeta'

interface CustomerFormPageProps {
  /** Customer to edit; omit to create a new one. */
  customerId?: string
}

export default function CustomerFormPage({ customerId }: CustomerFormPageProps) {
  const { t } = useTranslation()
  const genericError = t('errors.generic')
  const permissions = useCustomerPermissions()
  const isEditing = Boolean(customerId)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(isEditing)
  const [formData, setFormData] = useState<CustomerFormData>(createEmptyFormData)
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(createEmptyFormData()))
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState<{ field: CustomerField; message: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)

  useEffect(() => {
    if (!customerId) return
    let isCancelled = false
    customerService
      .getCustomer(customerId)
      .then((loaded) => {
        if (isCancelled || !loaded) return
        const next = formDataFromCustomer(loaded)
        setCustomer(loaded)
        setFormData(next)
        setSavedSnapshot(JSON.stringify(next))
      })
      .catch((loadError: unknown) => {
        if (!isCancelled) toast.error(loadError instanceof Error ? loadError.message : genericError)
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingCustomer(false)
      })
    return () => {
      isCancelled = true
    }
  }, [customerId, genericError])

  const isDirty = JSON.stringify(formData) !== savedSnapshot
  const backTo = customerId ? `customers/${customerId}` : 'customers'
  const isBusiness = formData.customerType === 'business'
  const profile = formData.businessProfile

  const update = <K extends keyof CustomerFormData>(key: K, value: CustomerFormData[K]) => {
    setFormData((previous) => ({ ...previous, [key]: value }))
    if (fieldError?.field === key) setFieldError(null)
  }

  const statusFor = (field: CustomerField) =>
    fieldError?.field === field ? { type: 'error' as const, message: fieldError.message } : undefined

  const save = async (event?: FormEvent) => {
    event?.preventDefault()
    const validation = validateCustomerForm(formData, t)
    if (validation) {
      setFieldError(validation)
      setError(validation.message)
      return
    }
    setIsSaving(true)
    setError('')
    setFieldError(null)
    try {
      const payload = buildCustomerPayload(formData, customer)
      const result = customerId
        ? await customerService.updateCustomer(customerId, payload)
        : await customerService.createCustomer({
            ...payload,
            currentBalance: 0,
            loyaltyPoints: 0,
            totalPurchases: 0,
            totalOrders: 0,
          })
      if (result.success && result.customer) {
        toast.success(customerId ? t('customers.customerUpdated') : t('customers.customerCreated'))
        setSavedSnapshot(JSON.stringify(formData))
        navigate(`customers/${result.customer.id}`)
      } else {
        setError(customerErrorMessage(result.error, t))
      }
    } catch {
      setError(t('errors.generic'))
    } finally {
      setIsSaving(false)
    }
  }

  const leave = () => {
    if (isSaving) return
    if (isDirty && !isConfirmingDiscard) {
      setIsConfirmingDiscard(true)
      return
    }
    navigate(backTo)
  }

  const customerName = customer ? customerDisplayName(customer, t('customers.unnamedCustomer')) : ''
  const breadcrumbs = isEditing
    ? [
        { label: t('customers.title'), to: 'customers' },
        { label: customerName || t('customers.customerName'), to: `customers/${customerId}` },
        { label: t('common.edit') },
      ]
    : [{ label: t('customers.title'), to: 'customers' }, { label: t('customers.newCustomer') }]
  const title = isEditing ? t('customers.editCustomerTitle') : t('customers.newCustomer')

  if ((isEditing && !permissions.canEdit) || (!isEditing && !permissions.canCreate)) {
    return (
      <Page title={title} breadcrumbs={breadcrumbs} width={720}>
        <EmptyState
          title={t('customers.accessDenied')}
          description={t('customers.noPermission')}
          actions={<Button label={t('customers.backToCustomers')} href={hrefFor(backTo)} />}
        />
      </Page>
    )
  }

  if (isLoadingCustomer) {
    return (
      <Page title={title} breadcrumbs={breadcrumbs} width={720}>
        <HStack hAlign="center" padding={10}>
          <Spinner label={t('common.loading')} />
        </HStack>
      </Page>
    )
  }

  if (isEditing && !customer) {
    return (
      <Page title={title} breadcrumbs={breadcrumbs} width={720}>
        <EmptyState
          title={t('customers.notFoundTitle')}
          description={t('customers.notFoundDescription')}
          actions={<Button label={t('customers.backToCustomers')} href={hrefFor('customers')} />}
        />
      </Page>
    )
  }

  const saveLabel = isEditing ? t('customers.saveChanges') : t('customers.createCustomer')

  return (
    <Page
      title={title}
      description={t('customers.formPageDescription')}
      breadcrumbs={breadcrumbs}
      width={720}
      actions={
        <>
          <Button label={t('common.cancel')} onClick={leave} isDisabled={isSaving} />
          <Button label={saveLabel} variant="primary" isLoading={isSaving} onClick={() => void save()} />
        </>
      }
    >
      {isConfirmingDiscard && (
        <Banner
          status="warning"
          title={t('customers.unsavedChangesTitle')}
          description={t('customers.unsavedChangesMessage')}
          collapsible={false}
          endContent={
            <HStack gap={2}>
              <Button label={t('customers.keepEditing')} size="sm" onClick={() => setIsConfirmingDiscard(false)} />
              <Button
                label={t('customers.discardChanges')}
                size="sm"
                variant="destructive"
                onClick={() => navigate(backTo)}
              />
            </HStack>
          }
        />
      )}
      {error && (
        <Banner
          status="error"
          title={t('customers.saveFailed')}
          description={error}
          collapsible={false}
          isDismissable
          onDismiss={() => setError('')}
        />
      )}

      <form onSubmit={(event) => void save(event)} noValidate>
        <VStack gap={6}>
          <FormSection title={t('customers.identitySection')} description={t('customers.identitySectionHint')}>
            <VStack gap={2}>
              <Text type="label">{t('customers.customerType')}</Text>
              <SegmentedControl
                label={t('customers.customerType')}
                value={formData.customerType}
                onChange={(value) => update('customerType', value as CustomerType)}
              >
                {CUSTOMER_TYPES.map((type) => (
                  <SegmentedControlItem key={type} value={type} label={customerTypeLabel(type, t)} />
                ))}
              </SegmentedControl>
            </VStack>
            {isBusiness && (
              <TextInput
                label={t('customers.companyName')}
                value={formData.companyName}
                onChange={(value) => update('companyName', value)}
                isRequired
                description={t('customers.companyNameBusinessHelp')}
                placeholder={t('customers.enterCompanyName')}
                status={statusFor('companyName')}
              />
            )}
            <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
              <TextInput
                label={isBusiness ? t('customers.contactFirstName') : t('customers.firstName')}
                value={formData.firstName}
                onChange={(value) => update('firstName', value)}
                isRequired={!isBusiness}
                isOptional={isBusiness}
                placeholder={isBusiness ? t('customers.enterContactFirstName') : t('customers.enterFirstName')}
                status={statusFor('firstName')}
              />
              <TextInput
                label={isBusiness ? t('customers.contactLastName') : t('customers.lastName')}
                value={formData.lastName}
                onChange={(value) => update('lastName', value)}
                isRequired={!isBusiness}
                isOptional={isBusiness}
                placeholder={isBusiness ? t('customers.enterContactLastName') : t('customers.enterLastName')}
                status={statusFor('lastName')}
              />
            </Grid>
            {!isBusiness && (
              <TextInput
                label={t('customers.companyName')}
                value={formData.companyName}
                onChange={(value) => update('companyName', value)}
                isOptional
                description={t('customers.companyNameOptionalHelp')}
                placeholder={t('customers.enterCompanyName')}
              />
            )}
          </FormSection>

          <FormSection title={t('customers.contactInformation')}>
            <TextInput
              label={t('customers.email')}
              type="email"
              autoComplete="off"
              value={formData.email}
              onChange={(value) => update('email', value)}
              isOptional
              placeholder={t('customers.enterEmail')}
            />
            <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
              <TextInput
                label={t('customers.phone')}
                type="tel"
                value={formData.phone}
                onChange={(value) => update('phone', value)}
                isOptional
                placeholder={t('customers.enterPhone')}
              />
              <TextInput
                label={t('customers.phoneSecondary')}
                type="tel"
                value={formData.phoneSecondary}
                onChange={(value) => update('phoneSecondary', value)}
                isOptional
                placeholder={t('customers.enterSecondaryPhone')}
              />
            </Grid>
            <Selector
              label={t('customers.preferredContactMethod')}
              description={t('customers.preferredContactMethodHelp')}
              isOptional
              hasClear
              placeholder={t('customers.selectPreferredContactMethod')}
              value={formData.preferredContactMethod || null}
              onChange={(value: string | null) =>
                update('preferredContactMethod', (value ?? '') as PreferredContactMethod | '')
              }
              options={PREFERRED_CONTACT_METHODS.map((method) => ({
                value: method,
                label: t(`customers.contactMethods.${method}`),
              }))}
              width="100%"
            />
          </FormSection>

          <FormSection title={t('customers.address')}>
            <TextInput
              label={t('customers.addressLine1')}
              value={formData.addressLine1}
              onChange={(value) => update('addressLine1', value)}
              isOptional
              placeholder={t('customers.enterAddress')}
            />
            <TextInput
              label={t('customers.addressLine2')}
              value={formData.addressLine2}
              onChange={(value) => update('addressLine2', value)}
              isOptional
              placeholder={t('customers.enterAddressLine2')}
            />
            <Grid columns={{ minWidth: 160, max: 3 }} gap={4}>
              <TextInput
                label={t('customers.city')}
                value={formData.city}
                onChange={(value) => update('city', value)}
                isOptional
                placeholder={t('customers.enterCity')}
              />
              <TextInput
                label={t('customers.state')}
                value={formData.state}
                onChange={(value) => update('state', value)}
                isOptional
                placeholder={t('customers.enterState')}
              />
              <TextInput
                label={t('customers.postalCode')}
                value={formData.postalCode}
                onChange={(value) => update('postalCode', value)}
                isOptional
                placeholder={t('customers.enterPostalCode')}
              />
            </Grid>
          </FormSection>

          <FormSection title={t('customers.businessContext')} description={t('customers.businessContextHint')}>
            <Selector
              label={t('customers.businessProfile')}
              description={t(`customers.businessProfiles.${profile}.helper`)}
              value={profile}
              onChange={(value) => update('businessProfile', value as BusinessProfile)}
              options={BUSINESS_PROFILES.map((option) => ({
                value: option,
                label: t(`customers.businessProfiles.${option}.label`),
              }))}
              width="100%"
            />
            <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
              <TextInput
                label={t('customers.customerSegment')}
                description={t('customers.customerSegmentHelp')}
                value={formData.customerSegment}
                onChange={(value) => update('customerSegment', value)}
                isOptional
                placeholder={t('customers.enterCustomerSegment')}
              />
              <TextInput
                label={t('customers.referenceCode')}
                description={t('customers.referenceCodeHelp')}
                value={formData.referenceCode}
                onChange={(value) => update('referenceCode', value)}
                isOptional
                placeholder={t(`customers.businessProfiles.${profile}.referencePlaceholder`)}
              />
            </Grid>
            <TextInput
              label={t('customers.tags')}
              description={t('customers.tagsHelp')}
              value={formData.tagsInput}
              onChange={(value) => update('tagsInput', value)}
              isOptional
              placeholder={t('customers.enterTags')}
            />
            <TextArea
              label={t('customers.serviceNotes')}
              description={t(`customers.businessProfiles.${profile}.serviceNotesHelp`)}
              value={formData.serviceNotes}
              onChange={(value) => update('serviceNotes', value)}
              isOptional
              rows={3}
              placeholder={t(`customers.businessProfiles.${profile}.serviceNotesPlaceholder`)}
            />
          </FormSection>

          <FormSection title={t('customers.billingSection')} description={t('customers.billingSectionHint')}>
            <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
              <NumberInput
                label={t('customers.creditLimit')}
                value={formData.creditLimit}
                onChange={(value) => update('creditLimit', Number.isFinite(value) ? value : 0)}
                min={0}
                step={0.01}
                isOptional
              />
              <TextInput
                label={t('customers.taxId')}
                value={formData.taxId}
                onChange={(value) => update('taxId', value)}
                isOptional
                placeholder={t('customers.enterTaxId')}
              />
            </Grid>
            <CheckboxInput
              label={t('customers.taxExempt')}
              description={t('customers.taxExemptDescription')}
              value={formData.taxExempt}
              onChange={(checked) => update('taxExempt', checked)}
            />
          </FormSection>

          <FormSection title={t('customers.notesSection')}>
            <TextArea
              label={t('customers.internalNotes')}
              description={t('customers.internalNotesHelp')}
              value={formData.notes}
              onChange={(value) => update('notes', value)}
              isOptional
              rows={3}
              placeholder={t('customers.enterInternalNotes')}
            />
            <CheckboxInput
              label={t('customers.active')}
              description={formData.isActive ? t('customers.activeCustomerHelp') : t('customers.inactiveCustomerHelp')}
              value={formData.isActive}
              onChange={(checked) => update('isActive', checked)}
            />
          </FormSection>

          <HStack gap={2} hAlign="end">
            <Button label={t('common.cancel')} onClick={leave} isDisabled={isSaving} />
            <Button label={saveLabel} variant="primary" type="submit" isLoading={isSaving} />
          </HStack>
        </VStack>
      </form>
    </Page>
  )
}

function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <VStack gap={3}>
      <VStack gap={1}>
        <Heading level={2}>{title}</Heading>
        {description && <Text type="supporting">{description}</Text>}
      </VStack>
      <Card>
        <FormLayout defaultOptionality="optional">{children}</FormLayout>
      </Card>
    </VStack>
  )
}
