import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Link } from '@astryxdesign/core/Link'
import { Pagination } from '@astryxdesign/core/Pagination'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import {
  pixel,
  proportional,
  Table,
  type TableColumn,
  type TableSortComparator,
  useTableSortable,
  useTableSortableState,
} from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Page } from '../../components/page/Page'
import { useTranslation } from '../../hooks/useTranslation'
import { formatMoney } from '../../lib/format'
import { hrefFor } from '../../lib/router'
import { toast } from '../../lib/toast'
import { type Customer, customerService } from '../../services/customers-turso'
import {
  CUSTOMER_TYPES,
  type CustomerType,
  customerDisplayName,
  customerStatusLabel,
  customerTypeLabel,
  useCurrencySymbol,
  useCustomerPermissions,
} from './customerMeta'

const PAGE_SIZE = 15
const SEARCH_DELAY_MS = 250

type StatusFilter = 'all' | 'active' | 'inactive'

interface CustomerRow extends Record<string, unknown> {
  id: string
  customer: Customer
  name: string
}

const COMPARATORS: Partial<Record<string, TableSortComparator<CustomerRow>>> = {
  customer: (a, b) => a.name.localeCompare(b.name),
  loyalty: (a, b) => a.customer.loyaltyPoints - b.customer.loyaltyPoints,
  orders: (a, b) => a.customer.totalOrders - b.customer.totalOrders,
  purchases: (a, b) => a.customer.totalPurchases - b.customer.totalPurchases,
}

export default function CustomersListPage() {
  const { t } = useTranslation()
  const genericError = t('errors.generic')
  const unnamedLabel = t('customers.unnamedCustomer')
  const permissions = useCustomerPermissions()
  const currencySymbol = useCurrencySymbol()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<CustomerType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(query.trim())
      setPage(1)
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let isCancelled = false
    setIsLoading(true)
    const request = searchTerm ? customerService.searchCustomers(searchTerm) : customerService.getCustomers()
    request
      .then((result) => {
        if (!isCancelled) setCustomers(result)
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
  }, [searchTerm, genericError])

  const rows = useMemo<CustomerRow[]>(
    () =>
      customers
        .filter((customer) => typeFilter === 'all' || customer.customerType === typeFilter)
        .filter((customer) => statusFilter === 'all' || customer.isActive === (statusFilter === 'active'))
        .map((customer) => ({ id: customer.id, customer, name: customerDisplayName(customer, unnamedLabel) })),
    [customers, typeFilter, statusFilter, unnamedLabel],
  )

  const { sortedData, sortConfig } = useTableSortableState<CustomerRow>({ data: rows, comparators: COMPARATORS })
  const sortPlugin = useTableSortable<CustomerRow>(sortConfig)
  const pageRows = sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const columns: TableColumn<CustomerRow>[] = [
    {
      key: 'customer',
      header: t('customers.customerName'),
      width: proportional(2, { minWidth: 180 }),
      sortable: true,
      renderCell: ({ customer, name }) => {
        const secondary = [customer.customerNumber, customer.customerSegment, ...(customer.tags ?? []).slice(0, 2)]
          .filter(Boolean)
          .join(' · ')
        return (
          <VStack gap={0.5}>
            <Link href={hrefFor(`customers/${customer.id}`)}>
              <Text type="inherit" weight="medium" maxLines={1}>
                {name}
              </Text>
            </Link>
            {secondary && (
              <Text type="supporting" maxLines={1}>
                {secondary}
              </Text>
            )}
          </VStack>
        )
      },
    },
    {
      key: 'type',
      header: t('customers.customerType'),
      width: pixel(110),
      renderCell: ({ customer }) => <Text color="secondary">{customerTypeLabel(customer.customerType, t)}</Text>,
    },
    {
      key: 'contact',
      header: t('customers.contactDetails'),
      width: proportional(2, { minWidth: 160 }),
      renderCell: ({ customer }) =>
        customer.email || customer.phone ? (
          <VStack gap={0.5}>
            {customer.email && <Text maxLines={1}>{customer.email}</Text>}
            {customer.phone && <Text type="supporting">{customer.phone}</Text>}
          </VStack>
        ) : (
          <Text color="secondary">{t('customers.noContact')}</Text>
        ),
    },
    {
      key: 'loyalty',
      header: t('customers.loyaltyPoints'),
      width: pixel(120),
      align: 'end',
      sortable: true,
      renderCell: ({ customer }) => <Text hasTabularNumbers>{customer.loyaltyPoints}</Text>,
    },
    {
      key: 'orders',
      header: t('customers.totalOrders'),
      width: pixel(90),
      align: 'end',
      sortable: true,
      renderCell: ({ customer }) => <Text hasTabularNumbers>{customer.totalOrders}</Text>,
    },
    {
      key: 'purchases',
      header: t('customers.totalPurchases'),
      width: pixel(130),
      align: 'end',
      sortable: true,
      renderCell: ({ customer }) => (
        <Text weight="medium" hasTabularNumbers>
          {formatMoney(customer.totalPurchases, currencySymbol)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: t('customers.status'),
      width: pixel(110),
      renderCell: ({ customer }) => {
        const label = customerStatusLabel(customer.isActive, t)
        return (
          <HStack gap={2} vAlign="center">
            <StatusDot variant={customer.isActive ? 'success' : 'neutral'} label={label} />
            <Text>{label}</Text>
          </HStack>
        )
      },
    },
  ]

  const hasFilters = typeFilter !== 'all' || statusFilter !== 'all' || query.trim() !== ''
  const clearFilters = () => {
    setQuery('')
    setSearchTerm('')
    setTypeFilter('all')
    setStatusFilter('all')
    setPage(1)
  }

  return (
    <Page
      title={t('customers.title')}
      description={t('customers.subtitle')}
      actions={
        permissions.canCreate && (
          <Button
            label={t('customers.newCustomer')}
            variant="primary"
            icon={<Plus size={16} />}
            href={hrefFor('customers/new')}
          />
        )
      }
    >
      <Card padding={0}>
        <VStack>
          <HStack gap={3} vAlign="end" wrap="wrap" padding={4}>
            <StackItem size="fill">
              <TextInput
                label={t('common.search')}
                isLabelHidden
                type="search"
                value={query}
                onChange={setQuery}
                hasClear
                placeholder={t('customers.searchPlaceholder')}
                startIcon={Search}
              />
            </StackItem>
            <SegmentedControl
              label={t('customers.customerType')}
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value as CustomerType | 'all')
                setPage(1)
              }}
            >
              <SegmentedControlItem value="all" label={t('customers.allTypes')} />
              {CUSTOMER_TYPES.map((type) => (
                <SegmentedControlItem key={type} value={type} label={customerTypeLabel(type, t)} />
              ))}
            </SegmentedControl>
            <Selector
              label={t('customers.status')}
              isLabelHidden
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value as StatusFilter)
                setPage(1)
              }}
              options={[
                { value: 'all', label: t('customers.allStatuses') },
                { value: 'active', label: t('customers.active') },
                { value: 'inactive', label: t('customers.inactive') },
              ]}
              width={160}
            />
          </HStack>

          {isLoading && customers.length === 0 ? (
            <HStack hAlign="center" padding={10}>
              <Spinner label={t('customers.loadingCustomers')} />
            </HStack>
          ) : rows.length === 0 ? (
            <VStack padding={6}>
              <EmptyState
                title={hasFilters ? t('customers.noMatchingCustomers') : t('customers.noCustomersYet')}
                description={hasFilters ? t('customers.noMatchingCustomersHint') : t('customers.emptyCustomers')}
                actions={
                  hasFilters ? (
                    <Button label={t('customers.clearFilters')} onClick={clearFilters} />
                  ) : (
                    permissions.canCreate && (
                      <Button label={t('customers.newCustomer')} variant="primary" href={hrefFor('customers/new')} />
                    )
                  )
                }
              />
            </VStack>
          ) : (
            <Table<CustomerRow>
              data={pageRows}
              columns={columns}
              idKey="id"
              density="balanced"
              hasHover
              plugins={{ sort: sortPlugin }}
            />
          )}

          {sortedData.length > 0 && (
            <HStack hAlign="between" vAlign="center" padding={4} wrap="wrap" gap={3}>
              <Text type="supporting">
                {sortedData.length > PAGE_SIZE
                  ? t('customers.showingRange', {
                      from: (page - 1) * PAGE_SIZE + 1,
                      to: Math.min(page * PAGE_SIZE, sortedData.length),
                      total: sortedData.length,
                    })
                  : t('customers.customersTotal', {
                      count: sortedData.length,
                      unit: sortedData.length === 1 ? t('customers.customer') : t('customers.customers'),
                    })}
              </Text>
              {sortedData.length > PAGE_SIZE && (
                <Pagination page={page} onChange={setPage} totalItems={sortedData.length} pageSize={PAGE_SIZE} />
              )}
            </HStack>
          )}
        </VStack>
      </Card>
    </Page>
  )
}
