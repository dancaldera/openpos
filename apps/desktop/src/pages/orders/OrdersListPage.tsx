import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Link } from '@astryxdesign/core/Link'
import { Pagination } from '@astryxdesign/core/Pagination'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
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
import { StatTile } from '../../components/page/StatTile'
import { useTranslation } from '../../hooks/useTranslation'
import { formatDate, formatMoney, formatTime, shortId } from '../../lib/format'
import { hrefFor } from '../../lib/router'
import { toast } from '../../lib/toast'
import { type Order, orderService } from '../../services/orders-turso'
import {
  dateFilterOptions,
  ORDER_STATUSES,
  type OrderStatus,
  orderStatusDot,
  orderStatusLabel,
  paymentMethodLabel,
} from './orderMeta'
import { useOrderReferenceData } from './useOrderReferenceData'

const PAGE_SIZE = 15

interface OrderRow extends Record<string, unknown> {
  id: string
  order: Order
  createdAt: number
  customerName: string
  itemCount: number
  itemSummary: string
  amount: number
  status: OrderStatus
}

const COMPARATORS: Partial<Record<string, TableSortComparator<OrderRow>>> = {
  date: (a, b) => a.createdAt - b.createdAt,
  customer: (a, b) => a.customerName.localeCompare(b.customerName),
  status: (a, b) => ORDER_STATUSES.indexOf(a.status) - ORDER_STATUSES.indexOf(b.status),
  total: (a, b) => a.amount - b.amount,
}

export default function OrdersListPage() {
  const { t } = useTranslation()
  const reference = useOrderReferenceData({ withCustomers: true })
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('today')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `t` is a new function every render; reload only when the date filter changes.
  useEffect(() => {
    let isCancelled = false
    setIsLoading(true)
    const request = dateFilter === 'all' ? orderService.getOrders() : orderService.getOrdersByDateFilter(dateFilter)
    request
      .then((result) => {
        if (!isCancelled) setOrders(result)
      })
      .catch((error: unknown) => {
        if (!isCancelled) toast.error(error instanceof Error ? error.message : t('errors.generic'))
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [dateFilter])

  // biome-ignore lint/correctness/useExhaustiveDependencies: changing any filter returns to the first page.
  useEffect(() => {
    setPage(1)
  }, [dateFilter, statusFilter, query])

  const customerNames = useMemo(
    () =>
      Object.fromEntries(
        reference.customers.map((customer) => [
          customer.id,
          customer.companyName || `${customer.firstName} ${customer.lastName}`.trim(),
        ]),
      ),
    [reference.customers],
  )

  const counts = useMemo(() => {
    const result: Record<OrderStatus, number> = { pending: 0, paid: 0, completed: 0, cancelled: 0 }
    for (const order of orders) result[order.status] += 1
    return result
  }, [orders])

  const revenue = useMemo(
    () =>
      orders
        .filter((order) => order.status === 'paid' || order.status === 'completed')
        .reduce((sum, order) => sum + (reference.taxEnabled ? order.total : order.subtotal), 0),
    [orders, reference.taxEnabled],
  )

  const rows = useMemo<OrderRow[]>(() => {
    const term = query.trim().toLowerCase()
    return orders
      .filter((order) => statusFilter === 'all' || order.status === statusFilter)
      .map((order) => {
        const customerName = order.customerId ? (customerNames[order.customerId] ?? '') : ''
        return {
          id: order.id,
          order,
          createdAt: new Date(order.createdAt).getTime(),
          customerName,
          itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
          itemSummary: order.items.map((item) => item.productName).join(', '),
          amount: reference.taxEnabled ? order.total : order.subtotal,
          status: order.status,
        }
      })
      .filter(
        (row) =>
          term === '' ||
          row.id.toLowerCase().includes(term) ||
          shortId(row.id).toLowerCase().includes(term) ||
          row.itemSummary.toLowerCase().includes(term) ||
          row.customerName.toLowerCase().includes(term) ||
          row.amount.toFixed(2).includes(term),
      )
  }, [orders, statusFilter, query, customerNames, reference.taxEnabled])

  const { sortedData, sortConfig } = useTableSortableState<OrderRow>({ data: rows, comparators: COMPARATORS })
  const sortPlugin = useTableSortable<OrderRow>(sortConfig)
  const pageRows = sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const columns: TableColumn<OrderRow>[] = [
    {
      key: 'reference',
      header: t('orders.orderHeader'),
      width: pixel(120),
      renderCell: (row) => (
        <Link href={hrefFor(`orders/${row.id}`)}>
          <Text type="inherit" weight="medium" hasTabularNumbers>
            #{shortId(row.id)}
          </Text>
        </Link>
      ),
    },
    {
      key: 'date',
      header: t('common.date'),
      width: pixel(150),
      sortable: true,
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text>{formatDate(row.createdAt)}</Text>
          <Text type="supporting">{formatTime(row.createdAt)}</Text>
        </VStack>
      ),
    },
    {
      key: 'customer',
      header: t('orders.customer'),
      width: proportional(1, { minWidth: 140 }),
      sortable: true,
      renderCell: (row) =>
        row.customerName ? (
          <Text maxLines={1}>{row.customerName}</Text>
        ) : (
          <Text color="secondary">{t('orders.walkIn')}</Text>
        ),
    },
    {
      key: 'items',
      header: t('orders.items'),
      width: proportional(2, { minWidth: 180 }),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text maxLines={1}>{row.itemSummary}</Text>
          <Text type="supporting">{t('orders.unitCount', { count: row.itemCount })}</Text>
        </VStack>
      ),
    },
    {
      key: 'payment',
      header: t('orders.payment'),
      width: pixel(120),
      renderCell: (row) => <Text color="secondary">{paymentMethodLabel(row.order.paymentMethod, t)}</Text>,
    },
    {
      key: 'status',
      header: t('common.status'),
      width: pixel(130),
      sortable: true,
      renderCell: (row) => (
        <HStack gap={2} vAlign="center">
          <StatusDot variant={orderStatusDot(row.status)} label={orderStatusLabel(row.status, t)} />
          <Text>{orderStatusLabel(row.status, t)}</Text>
        </HStack>
      ),
    },
    {
      key: 'total',
      header: t('common.total'),
      width: pixel(120),
      align: 'end',
      sortable: true,
      renderCell: (row) => (
        <Text weight="medium" hasTabularNumbers>
          {formatMoney(row.amount, reference.currencySymbol)}
        </Text>
      ),
    },
  ]

  const hasFilters = statusFilter !== 'all' || query.trim() !== ''

  return (
    <Page
      title={t('orders.title')}
      description={t('orders.subtitle')}
      actions={
        <Button label={t('orders.newOrder')} variant="primary" icon={<Plus size={16} />} href={hrefFor('orders/new')} />
      }
    >
      <Grid columns={{ minWidth: 180 }} gap={4}>
        <StatTile label={t('orders.pending')} value={counts.pending} />
        <StatTile label={t('orders.paid')} value={counts.paid} />
        <StatTile label={t('orders.completed')} value={counts.completed} />
        <StatTile label={t('orders.revenue')} value={formatMoney(revenue, reference.currencySymbol)} />
      </Grid>

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
                placeholder={t('orders.searchPlaceholder')}
                startIcon={Search}
              />
            </StackItem>
            <Selector
              label={t('common.date')}
              isLabelHidden
              value={dateFilter}
              onChange={(value) => setDateFilter(value)}
              options={dateFilterOptions(t)}
              width={180}
            />
            <SegmentedControl
              label={t('common.status')}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as OrderStatus | 'all')}
            >
              <SegmentedControlItem value="all" label={t('orders.allStatus')} />
              {ORDER_STATUSES.map((status) => (
                <SegmentedControlItem key={status} value={status} label={orderStatusLabel(status, t)} />
              ))}
            </SegmentedControl>
          </HStack>

          {!isLoading && rows.length === 0 ? (
            <VStack padding={6}>
              <EmptyState
                title={hasFilters ? t('orders.noMatchingOrders') : t('orders.noOrdersYet')}
                description={hasFilters ? t('orders.noMatchingOrdersHint') : t('orders.noOrdersYetDesc')}
                actions={
                  hasFilters ? (
                    <Button
                      label={t('orders.clearFilters')}
                      onClick={() => {
                        setQuery('')
                        setStatusFilter('all')
                      }}
                    />
                  ) : (
                    <Button label={t('orders.newOrder')} variant="primary" href={hrefFor('orders/new')} />
                  )
                }
              />
            </VStack>
          ) : (
            <Table<OrderRow>
              data={pageRows}
              columns={columns}
              idKey="id"
              density="balanced"
              hasHover
              plugins={{ sort: sortPlugin }}
            />
          )}

          {sortedData.length > PAGE_SIZE && (
            <HStack hAlign="between" vAlign="center" padding={4} wrap="wrap" gap={3}>
              <Text type="supporting">
                {t('orders.showingRange', {
                  from: (page - 1) * PAGE_SIZE + 1,
                  to: Math.min(page * PAGE_SIZE, sortedData.length),
                  total: sortedData.length,
                })}
              </Text>
              <Pagination page={page} onChange={setPage} totalItems={sortedData.length} pageSize={PAGE_SIZE} />
            </HStack>
          )}
        </VStack>
      </Card>
    </Page>
  )
}
