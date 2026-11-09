import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { pixel, proportional, Table, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Pencil, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ProductThumb } from '../../components/ProductThumb'
import { ConfirmAction } from '../../components/page/ConfirmAction'
import { Page } from '../../components/page/Page'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from '../../hooks/useTranslation'
import { formatDateTime, formatMoney, shortId } from '../../lib/format'
import { hrefFor, navigate } from '../../lib/router'
import { toast } from '../../lib/toast'
import { type Order, type OrderItem, orderService } from '../../services/orders-turso'
import { formatReceiptData, printThermalReceipt } from '../../services/print-service'
import { orderStatusDot, orderStatusLabel, paymentMethodLabel, variantLabel } from './orderMeta'
import { useOrderReferenceData } from './useOrderReferenceData'

interface ItemRow extends Record<string, unknown> {
  key: string
  item: OrderItem
}

interface OrderDetailPageProps {
  orderId: string
}

export default function OrderDetailPage({ orderId }: OrderDetailPageProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const reference = useOrderReferenceData({ withCustomers: true, withUsers: true })
  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPrinting, setIsPrinting] = useState(false)
  const canManageLifecycle = user?.role === 'admin' || user?.role === 'manager'

  // biome-ignore lint/correctness/useExhaustiveDependencies: `t` is a new function every render; reload only when the order changes.
  useEffect(() => {
    let isCancelled = false
    setIsLoading(true)
    orderService
      .getOrder(orderId)
      .then((result) => {
        if (!isCancelled) setOrder(result)
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
  }, [orderId])

  const breadcrumbs = [{ label: t('orders.title'), to: 'orders' }, { label: `#${shortId(orderId)}` }]

  if (isLoading) {
    return (
      <Page title={`#${shortId(orderId)}`} breadcrumbs={breadcrumbs} width={960}>
        <HStack hAlign="center" padding={10}>
          <Spinner label={t('common.loading')} />
        </HStack>
      </Page>
    )
  }

  if (!order) {
    return (
      <Page title={t('orders.notFoundTitle')} breadcrumbs={breadcrumbs} width={960}>
        <EmptyState
          title={t('orders.notFoundTitle')}
          description={t('orders.notFoundDescription')}
          actions={<Button label={t('orders.backToOrders')} href={hrefFor('orders')} />}
        />
      </Page>
    )
  }

  const money = (amount: number) => formatMoney(amount, reference.currencySymbol)
  const customer = order.customerId ? reference.customers.find((entry) => entry.id === order.customerId) : undefined
  const customerName = customer ? customer.companyName || `${customer.firstName} ${customer.lastName}`.trim() : ''
  const productImage = (productId: string) => {
    const image = reference.productCatalog.find((product) => product.id === productId)?.image
    return image ? reference.imageUrls[image] : undefined
  }

  const updateStatus = async (status: Order['status']) => {
    if ((status === 'cancelled' || status === 'completed') && !canManageLifecycle) {
      toast.error(t('orders.managersOnly'))
      return
    }
    const result = await orderService.updateOrderStatus(order.id, status)
    if (result.success && result.order) {
      setOrder(result.order)
      toast.success(t('orders.statusUpdated'))
    } else {
      toast.error(result.error || t('errors.generic'))
    }
  }

  const deleteOrder = async () => {
    const result = await orderService.deleteOrder(order.id)
    if (result.success) {
      toast.success(t('orders.orderDeleted'))
      navigate('orders')
    } else {
      toast.error(result.error || t('errors.generic'))
    }
  }

  const printReceipt = async () => {
    if (!reference.settings) {
      toast.error(t('orders.printError'))
      return
    }
    setIsPrinting(true)
    try {
      const receipt = formatReceiptData(order, reference.settings, undefined, t('orders.receiptFooter'))
      await printThermalReceipt({
        ...receipt,
        supportLabel: t('orders.support'),
        appVersionLabel: t('orders.appVersion'),
        itemLabel: t('orders.item'),
        qtyLabel: t('common.quantity'),
        totalLabel: t('common.total'),
        subtotalLabel: t('common.subtotal'),
        taxLabel: t('common.tax'),
        orderLabel: t('orders.receiptRef'),
      })
      toast.success(t('orders.printSuccess'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('orders.printError'))
    } finally {
      setIsPrinting(false)
    }
  }

  const rows: ItemRow[] = order.items.map((item, index) => ({
    key: `${item.productId}-${item.variantId ?? 'simple'}-${index}`,
    item,
  }))

  const columns: TableColumn<ItemRow>[] = [
    {
      key: 'product',
      header: t('orders.product'),
      width: proportional(3, { minWidth: 200 }),
      renderCell: ({ item }) => (
        <HStack gap={3} vAlign="center">
          <ProductThumb name={item.productName} imageUrl={productImage(item.productId)} size="sm" />
          <VStack gap={0.5}>
            <Text weight="medium" maxLines={1}>
              {item.productName}
            </Text>
            {item.variantAttributes && <Text type="supporting">{variantLabel(item.variantAttributes)}</Text>}
          </VStack>
        </HStack>
      ),
    },
    {
      key: 'quantity',
      header: t('common.quantity'),
      width: pixel(100),
      align: 'end',
      renderCell: ({ item }) => <Text hasTabularNumbers>{item.quantity}</Text>,
    },
    {
      key: 'unitPrice',
      header: t('orders.unitPrice'),
      width: pixel(120),
      align: 'end',
      renderCell: ({ item }) => <Text hasTabularNumbers>{money(item.unitPrice)}</Text>,
    },
    {
      key: 'lineTotal',
      header: t('common.amount'),
      width: pixel(120),
      align: 'end',
      renderCell: ({ item }) => (
        <Text weight="medium" hasTabularNumbers>
          {money(item.totalPrice)}
        </Text>
      ),
    },
  ]

  const statusLabel = orderStatusLabel(order.status, t)
  const total = reference.taxEnabled ? order.total : order.subtotal

  return (
    <Page
      title={t('orders.orderReference', { id: shortId(order.id) })}
      breadcrumbs={breadcrumbs}
      width={960}
      meta={
        <HStack gap={2} vAlign="center">
          <StatusDot variant={orderStatusDot(order.status)} label={statusLabel} />
          <Text color="secondary">{statusLabel}</Text>
        </HStack>
      }
      actions={
        <>
          <Button
            label={isPrinting ? t('orders.printing') : t('orders.printReceipt')}
            icon={<Printer size={16} />}
            isLoading={isPrinting}
            onClick={() => void printReceipt()}
          />
          {order.status === 'pending' && (
            <Button label={t('common.edit')} icon={<Pencil size={16} />} href={hrefFor(`orders/${order.id}/edit`)} />
          )}
          {order.status === 'pending' && (
            <Button label={t('orders.markAsPaid')} variant="primary" clickAction={() => updateStatus('paid')} />
          )}
          {order.status === 'paid' && canManageLifecycle && (
            <Button label={t('orders.markComplete')} variant="primary" clickAction={() => updateStatus('completed')} />
          )}
        </>
      }
    >
      <Card>
        <MetadataList columns="multi" orientation="vertical" label={{ position: 'top' }}>
          <MetadataListItem label={t('orders.created')}>{formatDateTime(order.createdAt)}</MetadataListItem>
          {order.completedAt && (
            <MetadataListItem label={t('orders.completed')}>{formatDateTime(order.completedAt)}</MetadataListItem>
          )}
          <MetadataListItem label={t('orders.customer')}>{customerName || t('orders.walkIn')}</MetadataListItem>
          <MetadataListItem label={t('orders.paymentMethod')}>
            {paymentMethodLabel(order.paymentMethod, t)}
          </MetadataListItem>
          {order.userId && reference.userNames[order.userId] && (
            <MetadataListItem label={t('orders.createdBy')}>{reference.userNames[order.userId]}</MetadataListItem>
          )}
          <MetadataListItem label={t('orders.reference')}>
            <Text type="code">{order.id}</Text>
          </MetadataListItem>
        </MetadataList>
      </Card>

      <VStack gap={3}>
        <Heading level={2}>{t('orders.orderItems')}</Heading>
        <Card padding={0}>
          <Table<ItemRow> data={rows} columns={columns} idKey="key" density="balanced" />
          <VStack gap={2} padding={4}>
            {reference.taxEnabled && (
              <>
                <SummaryLine label={t('common.subtotal')} value={money(order.subtotal)} />
                <SummaryLine
                  label={
                    order.subtotal > 0
                      ? `${t('common.tax')} (${((order.tax / order.subtotal) * 100).toFixed(1)}%)`
                      : t('common.tax')
                  }
                  value={money(order.tax)}
                />
                <Divider />
              </>
            )}
            <SummaryLine label={t('common.total')} value={money(total)} isStrong />
          </VStack>
        </Card>
      </VStack>

      {order.notes && (
        <VStack gap={3}>
          <Heading level={2}>{t('orders.notes')}</Heading>
          <Card>
            <Text as="p">{order.notes}</Text>
          </Card>
        </VStack>
      )}

      {canManageLifecycle && (order.status === 'pending' || order.status === 'paid') && (
        <VStack gap={3}>
          <Heading level={2}>{t('orders.lifecycle')}</Heading>
          <HStack gap={3} wrap="wrap">
            <ConfirmAction
              label={t('orders.cancelOrder')}
              title={t('orders.cancelConfirmTitle')}
              description={t('orders.cancelConfirmMessage')}
              confirmLabel={t('orders.cancelOrder')}
              cancelLabel={t('orders.keepOrder')}
              variant="secondary"
              onConfirm={() => updateStatus('cancelled')}
            />
          </HStack>
        </VStack>
      )}

      {canManageLifecycle && (
        <VStack gap={3}>
          <Heading level={2}>{t('orders.dangerZone')}</Heading>
          <Card>
            <VStack gap={3}>
              <Text type="supporting">{t('orders.deleteHint')}</Text>
              <HStack>
                <ConfirmAction
                  label={t('orders.deleteOrder')}
                  title={t('orders.confirmDelete')}
                  description={t('orders.deleteConfirmMessage')}
                  confirmLabel={t('common.delete')}
                  cancelLabel={t('common.cancel')}
                  onConfirm={deleteOrder}
                />
              </HStack>
            </VStack>
          </Card>
        </VStack>
      )}
    </Page>
  )
}

function SummaryLine({ label, value, isStrong = false }: { label: string; value: string; isStrong?: boolean }) {
  return (
    <HStack hAlign="between" vAlign="center">
      <Text
        type={isStrong ? 'large' : 'body'}
        weight={isStrong ? 'semibold' : 'normal'}
        color={isStrong ? 'primary' : 'secondary'}
      >
        {label}
      </Text>
      <Text type={isStrong ? 'large' : 'body'} weight={isStrong ? 'semibold' : 'medium'} hasTabularNumbers>
        {value}
      </Text>
    </HStack>
  )
}
