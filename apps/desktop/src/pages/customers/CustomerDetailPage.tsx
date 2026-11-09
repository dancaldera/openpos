import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { Link } from '@astryxdesign/core/Link'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Pencil } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { ConfirmAction } from '../../components/page/ConfirmAction'
import { Page } from '../../components/page/Page'
import { StatTile } from '../../components/page/StatTile'
import { useTranslation } from '../../hooks/useTranslation'
import { formatDate, formatDateTime, formatMoney } from '../../lib/format'
import { hrefFor, navigate } from '../../lib/router'
import { toast } from '../../lib/toast'
import { type Customer, customerService } from '../../services/customers-turso'
import {
  customerDisplayName,
  customerErrorMessage,
  customerStatusLabel,
  customerTypeLabel,
  parseCustomerContext,
  useCurrencySymbol,
  useCustomerPermissions,
} from './customerMeta'

interface CustomerDetailPageProps {
  customerId: string
}

export default function CustomerDetailPage({ customerId }: CustomerDetailPageProps) {
  const { t } = useTranslation()
  const genericError = t('errors.generic')
  const permissions = useCustomerPermissions()
  const currencySymbol = useCurrencySymbol()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCancelled = false
    setIsLoading(true)
    customerService
      .getCustomer(customerId)
      .then((result) => {
        if (!isCancelled) setCustomer(result)
      })
      .catch((error: unknown) => {
        if (!isCancelled) toast.error(error instanceof Error ? error.message : genericError)
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [customerId, genericError])

  const name = customer ? customerDisplayName(customer, t('customers.unnamedCustomer')) : ''
  const breadcrumbs = [{ label: t('customers.title'), to: 'customers' }, { label: name || t('customers.customerName') }]

  if (isLoading) {
    return (
      <Page title={t('customers.customerName')} breadcrumbs={breadcrumbs} width={960}>
        <HStack hAlign="center" padding={10}>
          <Spinner label={t('common.loading')} />
        </HStack>
      </Page>
    )
  }

  if (!customer) {
    return (
      <Page title={t('customers.notFoundTitle')} breadcrumbs={breadcrumbs} width={960}>
        <EmptyState
          title={t('customers.notFoundTitle')}
          description={t('customers.notFoundDescription')}
          actions={<Button label={t('customers.backToCustomers')} href={hrefFor('customers')} />}
        />
      </Page>
    )
  }

  const money = (amount: number) => formatMoney(amount, currencySymbol)
  const context = parseCustomerContext(customer.customFields)
  const statusLabel = customerStatusLabel(customer.isActive, t)
  const contactName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
  const cityLine = [customer.city, customer.state, customer.postalCode].filter(Boolean).join(', ')
  const addressLines = [customer.addressLine1, customer.addressLine2, cityLine].filter(Boolean)
  const averageOrder = customer.totalOrders > 0 ? customer.totalPurchases / customer.totalOrders : 0
  const notSet = <Text color="secondary">{t('customers.notSet')}</Text>

  const setActive = async (isActive: boolean) => {
    const result = await customerService.updateCustomer(customer.id, { isActive })
    if (result.success && result.customer) {
      setCustomer(result.customer)
      toast.success(isActive ? t('customers.customerReactivated') : t('customers.customerDeactivated'))
    } else {
      toast.error(customerErrorMessage(result.error, t))
    }
  }

  const deleteCustomer = async () => {
    const result = await customerService.deleteCustomer(customer.id)
    if (result.success) {
      toast.success(t('customers.customerDeleted'))
      navigate('customers')
    } else {
      toast.error(customerErrorMessage(result.error, t))
    }
  }

  return (
    <Page
      title={name}
      description={`${customer.customerNumber} · ${customerTypeLabel(customer.customerType, t)}`}
      breadcrumbs={breadcrumbs}
      width={960}
      meta={
        <HStack gap={2} vAlign="center">
          <StatusDot variant={customer.isActive ? 'success' : 'neutral'} label={statusLabel} />
          <Text color="secondary">{statusLabel}</Text>
        </HStack>
      }
      actions={
        permissions.canEdit && (
          <Button
            label={t('common.edit')}
            icon={<Pencil size={16} />}
            href={hrefFor(`customers/${customer.id}/edit`)}
          />
        )
      }
    >
      <Grid columns={{ minWidth: 180 }} gap={4}>
        <StatTile
          label={t('customers.totalPurchases')}
          value={money(customer.totalPurchases)}
          detail={customer.totalOrders > 0 ? t('customers.averageOrder', { amount: money(averageOrder) }) : undefined}
        />
        <StatTile label={t('customers.totalOrders')} value={customer.totalOrders} />
        <StatTile label={t('customers.loyaltyPoints')} value={customer.loyaltyPoints} />
        <StatTile
          label={t('customers.currentBalance')}
          value={money(customer.currentBalance)}
          detail={
            customer.creditLimit > 0 ? t('customers.creditLimitOf', { amount: money(customer.creditLimit) }) : undefined
          }
        />
      </Grid>

      <DetailSection title={t('customers.contactInformation')}>
        <MetadataList columns="multi" orientation="vertical" label={{ position: 'top' }}>
          {customer.customerType === 'business' && (
            <MetadataListItem label={t('customers.contactPerson')}>{contactName || notSet}</MetadataListItem>
          )}
          <MetadataListItem label={t('customers.email')}>
            {customer.email ? <Link href={`mailto:${customer.email}`}>{customer.email}</Link> : notSet}
          </MetadataListItem>
          <MetadataListItem label={t('customers.phone')}>{customer.phone || notSet}</MetadataListItem>
          {customer.phoneSecondary && (
            <MetadataListItem label={t('customers.phoneSecondary')}>{customer.phoneSecondary}</MetadataListItem>
          )}
          <MetadataListItem label={t('customers.preferredContactMethod')}>
            {context.preferredContactMethod ? t(`customers.contactMethods.${context.preferredContactMethod}`) : notSet}
          </MetadataListItem>
          <MetadataListItem label={t('customers.address')}>
            {addressLines.length > 0 ? (
              <VStack gap={0.5}>
                {addressLines.map((line) => (
                  <Text key={line}>{line}</Text>
                ))}
              </VStack>
            ) : (
              notSet
            )}
          </MetadataListItem>
        </MetadataList>
      </DetailSection>

      <DetailSection title={t('customers.accountSection')}>
        <MetadataList columns="multi" orientation="vertical" label={{ position: 'top' }}>
          <MetadataListItem label={t('customers.customerNumber')}>
            <Text hasTabularNumbers>{customer.customerNumber}</Text>
          </MetadataListItem>
          <MetadataListItem label={t('customers.customerType')}>
            {customerTypeLabel(customer.customerType, t)}
          </MetadataListItem>
          <MetadataListItem label={t('customers.businessProfile')}>
            {t(`customers.businessProfiles.${context.businessProfile}.label`)}
          </MetadataListItem>
          <MetadataListItem label={t('customers.customerSegment')}>
            {customer.customerSegment || notSet}
          </MetadataListItem>
          <MetadataListItem label={t('customers.referenceCode')}>{context.referenceCode || notSet}</MetadataListItem>
          <MetadataListItem label={t('customers.tags')}>
            {customer.tags && customer.tags.length > 0 ? (
              <HStack gap={1} wrap="wrap">
                {customer.tags.map((tag) => (
                  <Token key={tag} label={tag} size="sm" />
                ))}
              </HStack>
            ) : (
              notSet
            )}
          </MetadataListItem>
          <MetadataListItem label={t('customers.firstPurchaseDate')}>
            {customer.firstPurchaseDate ? formatDate(customer.firstPurchaseDate) : notSet}
          </MetadataListItem>
          <MetadataListItem label={t('customers.lastPurchaseDate')}>
            {customer.lastPurchaseDate ? formatDate(customer.lastPurchaseDate) : notSet}
          </MetadataListItem>
          <MetadataListItem label={t('customers.customerSince')}>{formatDateTime(customer.createdAt)}</MetadataListItem>
        </MetadataList>
      </DetailSection>

      <DetailSection title={t('customers.billingSection')}>
        <MetadataList columns="multi" orientation="vertical" label={{ position: 'top' }}>
          <MetadataListItem label={t('customers.creditLimit')}>
            <Text hasTabularNumbers>{money(customer.creditLimit)}</Text>
          </MetadataListItem>
          <MetadataListItem label={t('customers.currentBalance')}>
            <Text hasTabularNumbers>{money(customer.currentBalance)}</Text>
          </MetadataListItem>
          <MetadataListItem label={t('customers.taxExempt')}>
            {customer.taxExempt ? t('common.yes') : t('common.no')}
          </MetadataListItem>
          <MetadataListItem label={t('customers.taxId')}>{customer.taxId || notSet}</MetadataListItem>
        </MetadataList>
      </DetailSection>

      {(context.serviceNotes || customer.notes) && (
        <DetailSection title={t('customers.notesSection')}>
          <VStack gap={4}>
            {context.serviceNotes && (
              <VStack gap={1}>
                <Text type="label">{t('customers.serviceNotes')}</Text>
                <Text as="p">{context.serviceNotes}</Text>
              </VStack>
            )}
            {customer.notes && (
              <VStack gap={1}>
                <Text type="label">{t('customers.internalNotes')}</Text>
                <Text as="p">{customer.notes}</Text>
              </VStack>
            )}
          </VStack>
        </DetailSection>
      )}

      {permissions.canEdit && (
        <VStack gap={3}>
          <Heading level={2}>{t('customers.statusSection')}</Heading>
          <Card>
            <VStack gap={3}>
              <Text type="supporting">
                {customer.isActive ? t('customers.deactivateHint') : t('customers.inactiveCustomerHelp')}
              </Text>
              <HStack>
                {customer.isActive ? (
                  <ConfirmAction
                    label={t('customers.deactivate')}
                    title={t('customers.deactivateConfirmTitle')}
                    description={t('customers.deactivateConfirmMessage')}
                    confirmLabel={t('customers.deactivate')}
                    cancelLabel={t('common.cancel')}
                    variant="secondary"
                    onConfirm={() => setActive(false)}
                  />
                ) : (
                  <Button label={t('customers.reactivate')} clickAction={() => setActive(true)} />
                )}
              </HStack>
            </VStack>
          </Card>
        </VStack>
      )}

      {permissions.canDelete && (
        <VStack gap={3}>
          <Heading level={2}>{t('customers.dangerZone')}</Heading>
          <Card>
            <VStack gap={3}>
              <Text type="supporting">{t('customers.deleteHint')}</Text>
              <HStack>
                <ConfirmAction
                  label={t('customers.deleteCustomer')}
                  title={t('customers.deleteConfirmTitle')}
                  description={t('customers.deleteMessage')}
                  confirmLabel={t('common.delete')}
                  cancelLabel={t('common.cancel')}
                  onConfirm={deleteCustomer}
                />
              </HStack>
            </VStack>
          </Card>
        </VStack>
      )}
    </Page>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <VStack gap={3}>
      <Heading level={2}>{title}</Heading>
      <Card>{children}</Card>
    </VStack>
  )
}
