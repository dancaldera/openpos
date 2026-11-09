import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { IconButton } from '@astryxdesign/core/IconButton'
import { List, ListItem } from '@astryxdesign/core/List'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { pixel, proportional, Table, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Minus, Plus, ScanBarcode, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ProductThumb } from '../../components/ProductThumb'
import { Page } from '../../components/page/Page'
import { useTranslation } from '../../hooks/useTranslation'
import { formatMoney, shortId } from '../../lib/format'
import { hrefFor, navigate } from '../../lib/router'
import { toast } from '../../lib/toast'
import { type Order, orderService } from '../../services/orders-turso'
import { type Product, productService } from '../../services/products-turso'
import { PAYMENT_METHODS, type PaymentMethod, paymentMethodLabel, variantLabel } from './orderMeta'
import { useOrderReferenceData } from './useOrderReferenceData'

interface OrderLine {
  productId: string
  variantId?: string
  quantity: number
}

interface OrderDraft {
  items: OrderLine[]
  customerId: string
  paymentMethod: PaymentMethod
  notes: string
}

const EMPTY_DRAFT: OrderDraft = { items: [], customerId: '', paymentMethod: 'cash', notes: '' }

function draftFromOrder(order: Order): OrderDraft {
  return {
    items: order.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
    })),
    customerId: order.customerId || '',
    paymentMethod: order.paymentMethod || 'cash',
    notes: order.notes || '',
  }
}

const sameLine = (line: OrderLine, productId: string, variantId?: string) =>
  line.productId === productId && line.variantId === variantId

interface CatalogRow extends Record<string, unknown> {
  id: string
  product: Product
}

interface OrderFormPageProps {
  /** Order to edit; omit to create a new one. */
  orderId?: string
}

export default function OrderFormPage({ orderId }: OrderFormPageProps) {
  const { t } = useTranslation()
  const reference = useOrderReferenceData({ withVariants: true, withCustomers: true })
  const [order, setOrder] = useState<Order | null>(null)
  const [isLoadingOrder, setIsLoadingOrder] = useState(Boolean(orderId))
  const [draft, setDraft] = useState<OrderDraft>(EMPTY_DRAFT)
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(EMPTY_DRAFT))
  const [productQuery, setProductQuery] = useState('')
  const [barcode, setBarcode] = useState('')
  const [chosenVariants, setChosenVariants] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `t` is a new function every render; load only when the order changes.
  useEffect(() => {
    if (!orderId) return
    let isCancelled = false
    orderService
      .getOrder(orderId)
      .then((loaded) => {
        if (isCancelled || !loaded) return
        const next = draftFromOrder(loaded)
        setOrder(loaded)
        setDraft(next)
        setSavedSnapshot(JSON.stringify(next))
      })
      .catch((loadError: unknown) => {
        if (!isCancelled) toast.error(loadError instanceof Error ? loadError.message : t('errors.generic'))
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingOrder(false)
      })
    return () => {
      isCancelled = true
    }
  }, [orderId])

  const isEditing = Boolean(orderId)
  const isDirty = JSON.stringify(draft) !== savedSnapshot
  const money = (amount: number) => formatMoney(amount, reference.currencySymbol)
  const backTo = orderId ? `orders/${orderId}` : 'orders'

  const productById = (productId: string) => reference.productCatalog.find((product) => product.id === productId)
  const variantOf = (productId: string, variantId?: string) =>
    variantId
      ? reference.productsWithVariants[productId]?.variants?.find((variant) => variant.id === variantId)
      : undefined
  const imageFor = (product?: Product) => (product?.image ? reference.imageUrls[product.image] : undefined)

  const lineDetails = (line: OrderLine) => {
    const product = productById(line.productId)
    const variant = variantOf(line.productId, line.variantId)
    const unitPrice = variant?.price ?? product?.price ?? 0
    const stock = variant ? variant.stock : (product?.stock ?? 0)
    // When editing, units already on this order are reserved for it.
    const reserved = order?.items.find((item) => sameLine(item, line.productId, line.variantId))?.quantity ?? 0
    return { product, variant, unitPrice, available: stock + reserved }
  }

  const subtotal = draft.items.reduce((sum, line) => sum + lineDetails(line).unitPrice * line.quantity, 0)
  const tax = reference.taxEnabled ? subtotal * reference.taxRate : 0
  const totals = { subtotal, tax, total: subtotal + tax }

  const setQuantity = (productId: string, variantId: string | undefined, quantity: number) => {
    setDraft((previous) => ({
      ...previous,
      items:
        quantity <= 0
          ? previous.items.filter((line) => !sameLine(line, productId, variantId))
          : previous.items.map((line) => (sameLine(line, productId, variantId) ? { ...line, quantity } : line)),
    }))
  }

  const addLine = (productId: string, variantId?: string) => {
    const product = productById(productId)
    if (!product) return
    if (product.variantType === 'configurable' && !variantId) {
      toast.error(t('orders.chooseVariantFirst', { product: product.name }))
      return
    }
    const existing = draft.items.find((line) => sameLine(line, productId, variantId))
    const nextQuantity = (existing?.quantity ?? 0) + 1
    const { available } = lineDetails({ productId, variantId, quantity: nextQuantity })
    if (nextQuantity > available) {
      toast.error(t('orders.insufficientStock', { available }))
      return
    }
    setDraft((previous) => ({
      ...previous,
      items: existing
        ? previous.items.map((line) =>
            sameLine(line, productId, variantId) ? { ...line, quantity: nextQuantity } : line,
          )
        : [...previous.items, { productId, variantId, quantity: 1 }],
    }))
  }

  const addByBarcode = async () => {
    const code = barcode.trim()
    if (!code) return
    try {
      const match = await productService.findSellableByBarcode(code)
      if (!match) {
        toast.error(t('orders.barcodeNotFound'))
      } else if (!match.isActive) {
        toast.error(t('orders.barcodeInactive'))
      } else if (match.stock <= 0) {
        toast.error(t('orders.barcodeOutOfStock'))
      } else {
        addLine(match.productId, match.variantId)
      }
    } catch {
      toast.error(t('orders.barcodeLookupFailed'))
    }
    setBarcode('')
  }

  const save = async () => {
    if (draft.items.length === 0) {
      setError(t('orders.addItemError'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const result = orderId
        ? await orderService.updateOrder(orderId, {
            items: draft.items,
            paymentMethod: draft.paymentMethod,
            notes: draft.notes,
          })
        : await orderService.createOrder({
            items: draft.items,
            customerId: draft.customerId || undefined,
            paymentMethod: draft.paymentMethod,
            notes: draft.notes,
          })
      if (result.success && result.order) {
        toast.success(orderId ? t('orders.orderUpdated') : t('orders.orderCreated'))
        setSavedSnapshot(JSON.stringify(draft))
        navigate(`orders/${result.order.id}`)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('errors.generic'))
    } finally {
      setIsSaving(false)
    }
  }

  const leave = () => {
    if (isDirty && !isConfirmingDiscard) {
      setIsConfirmingDiscard(true)
      return
    }
    navigate(backTo)
  }

  const sellableProducts = useMemo(() => {
    const term = productQuery.trim().toLowerCase()
    return reference.productCatalog
      .filter((product) => product.isActive)
      .filter(
        (product) =>
          term === '' ||
          product.name.toLowerCase().includes(term) ||
          product.category.toLowerCase().includes(term) ||
          (product.barcode || '').toLowerCase().includes(term),
      )
  }, [reference.productCatalog, productQuery])

  const catalogRows: CatalogRow[] = sellableProducts.map((product) => ({ id: product.id, product }))

  const catalogColumns: TableColumn<CatalogRow>[] = [
    {
      key: 'product',
      header: t('orders.product'),
      width: proportional(3, { minWidth: 200 }),
      renderCell: ({ product }) => (
        <HStack gap={3} vAlign="center">
          <ProductThumb name={product.name} imageUrl={imageFor(product)} size="sm" />
          <VStack gap={0.5}>
            <Text weight="medium" maxLines={1}>
              {product.name}
            </Text>
            <Text type="supporting" maxLines={1}>
              {product.barcode ? `${product.category} · ${product.barcode}` : product.category}
            </Text>
          </VStack>
        </HStack>
      ),
    },
    {
      key: 'option',
      header: t('variants.variant'),
      width: proportional(2, { minWidth: 160 }),
      renderCell: ({ product }) => {
        if (product.variantType !== 'configurable') return <Text color="secondary">{t('orders.standard')}</Text>
        const variants = (reference.productsWithVariants[product.id]?.variants ?? []).filter(
          (variant) => variant.isActive && variant.stock > 0,
        )
        if (variants.length === 0) return <Text color="secondary">{t('orders.noVariantsInStock')}</Text>
        return (
          <Selector
            label={t('variants.selectVariant')}
            isLabelHidden
            size="sm"
            placeholder={t('variants.selectVariant')}
            value={chosenVariants[product.id] ?? ''}
            onChange={(value) => setChosenVariants((previous) => ({ ...previous, [product.id]: value }))}
            options={variants.map((variant) => ({
              value: variant.id,
              label: variantLabel(variant.attributes),
              description: `${money(variant.price)} · ${t('orders.inStock', { count: variant.stock })}`,
            }))}
            width="100%"
          />
        )
      },
    },
    {
      key: 'price',
      header: t('common.price'),
      width: pixel(100),
      align: 'end',
      renderCell: ({ product }) => {
        const variant = variantOf(product.id, chosenVariants[product.id])
        return <Text hasTabularNumbers>{money(variant?.price ?? product.price)}</Text>
      },
    },
    {
      key: 'stock',
      header: t('orders.stock'),
      width: pixel(80),
      align: 'end',
      renderCell: ({ product }) => {
        const variant = variantOf(product.id, chosenVariants[product.id])
        const stock = variant ? variant.stock : product.stock
        return (
          <Text hasTabularNumbers color={stock > 0 ? 'primary' : 'secondary'}>
            {stock}
          </Text>
        )
      },
    },
    {
      key: 'add',
      header: '',
      width: pixel(64),
      align: 'end',
      renderCell: ({ product }) => {
        const variantId = chosenVariants[product.id]
        const variant = variantOf(product.id, variantId)
        const stock = product.variantType === 'configurable' ? (variant?.stock ?? 0) : product.stock
        const needsVariant = product.variantType === 'configurable' && !variantId
        return (
          <IconButton
            label={t('orders.addToOrder', { product: product.name })}
            icon={<Plus size={16} />}
            size="sm"
            isDisabled={needsVariant || stock <= 0}
            tooltip={needsVariant ? t('variants.selectVariant') : t('orders.addProduct')}
            onClick={() => addLine(product.id, variantId)}
          />
        )
      },
    },
  ]

  const breadcrumbs = isEditing
    ? [
        { label: t('orders.title'), to: 'orders' },
        { label: `#${shortId(orderId ?? '')}`, to: `orders/${orderId}` },
        { label: t('common.edit') },
      ]
    : [{ label: t('orders.title'), to: 'orders' }, { label: t('orders.newOrder') }]

  if (reference.isLoading || isLoadingOrder) {
    return (
      <Page title={isEditing ? t('orders.editOrder') : t('orders.newOrder')} breadcrumbs={breadcrumbs}>
        <HStack hAlign="center" padding={10}>
          <Spinner label={t('common.loading')} />
        </HStack>
      </Page>
    )
  }

  if (isEditing && order?.status !== 'pending') {
    return (
      <Page title={t('orders.editOrder')} breadcrumbs={breadcrumbs} width={960}>
        <EmptyState
          title={order ? t('orders.notEditableTitle') : t('orders.notFoundTitle')}
          description={order ? t('orders.notEditableDescription') : t('orders.notFoundDescription')}
          actions={<Button label={t('orders.backToOrders')} href={hrefFor(order ? `orders/${order.id}` : 'orders')} />}
        />
      </Page>
    )
  }

  const itemCount = draft.items.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <Page
      title={isEditing ? t('orders.editOrderTitle', { id: shortId(orderId ?? '') }) : t('orders.newOrder')}
      description={t('orders.formPageHint')}
      breadcrumbs={breadcrumbs}
      actions={
        <>
          <Button label={t('common.cancel')} onClick={leave} isDisabled={isSaving} />
          <Button
            label={isEditing ? t('orders.saveChanges') : t('orders.createOrder')}
            variant="primary"
            isLoading={isSaving}
            isDisabled={draft.items.length === 0}
            onClick={() => void save()}
          />
        </>
      }
    >
      {isConfirmingDiscard && (
        <Banner
          status="warning"
          title={t('orders.unsavedChangesTitle')}
          description={t('orders.unsavedChangesMessage')}
          collapsible={false}
          endContent={
            <HStack gap={2}>
              <Button label={t('orders.keepEditing')} size="sm" onClick={() => setIsConfirmingDiscard(false)} />
              <Button
                label={t('orders.discardChanges')}
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
          title={t('orders.saveFailed')}
          description={error}
          collapsible={false}
          isDismissable
          onDismiss={() => setError('')}
        />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <VStack gap={3}>
          <Heading level={2}>{t('orders.availableProducts')}</Heading>
          <Card padding={0}>
            <HStack gap={3} padding={4} wrap="wrap" vAlign="end">
              <StackItem size="fill">
                <TextInput
                  label={t('orders.searchProducts')}
                  isLabelHidden
                  type="search"
                  value={productQuery}
                  onChange={setProductQuery}
                  hasClear
                  placeholder={t('orders.searchProducts')}
                  startIcon={Search}
                />
              </StackItem>
              <TextInput
                label={t('orders.scanBarcode')}
                isLabelHidden
                value={barcode}
                onChange={setBarcode}
                onEnter={() => void addByBarcode()}
                placeholder={t('orders.scanBarcodePlaceholder')}
                startIcon={ScanBarcode}
                width={260}
                hasAutoCorrect={false}
                hasSpellCheck={false}
              />
            </HStack>
            {catalogRows.length === 0 ? (
              <VStack padding={6}>
                <EmptyState
                  isCompact
                  title={t('orders.noProductsFound')}
                  description={
                    productQuery
                      ? t('orders.noProductsMatch', { search: productQuery })
                      : t('orders.noProductsAvailable')
                  }
                />
              </VStack>
            ) : (
              <Table<CatalogRow> data={catalogRows} columns={catalogColumns} idKey="id" density="compact" hasHover />
            )}
          </Card>
        </VStack>

        <div className="lg:sticky lg:top-6">
          <Card>
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="center">
                <Heading level={2}>{t('orders.currentOrder')}</Heading>
                <Text type="supporting">{t('orders.unitCount', { count: itemCount })}</Text>
              </HStack>

              {draft.items.length === 0 ? (
                <EmptyState
                  isCompact
                  title={t('orders.emptyOrderTitle')}
                  description={t('orders.emptyOrderDescription')}
                />
              ) : (
                <List hasDividers density="compact" edge="flush">
                  {draft.items.map((line) => {
                    const { product, variant, unitPrice, available } = lineDetails(line)
                    const name = product?.name ?? t('orders.unknownProduct')
                    return (
                      <ListItem
                        key={`${line.productId}-${line.variantId ?? 'simple'}`}
                        label={name}
                        description={
                          variant
                            ? `${variantLabel(variant.attributes)} · ${money(unitPrice)}`
                            : `${money(unitPrice)} ${t('orders.each')}`
                        }
                        endContent={
                          <HStack gap={1} vAlign="center">
                            <IconButton
                              label={t('orders.decreaseQuantity', { product: name })}
                              icon={<Minus size={14} />}
                              size="sm"
                              variant="ghost"
                              onClick={() => setQuantity(line.productId, line.variantId, line.quantity - 1)}
                            />
                            <Text hasTabularNumbers weight="medium">
                              {line.quantity}
                            </Text>
                            <IconButton
                              label={t('orders.increaseQuantity', { product: name })}
                              icon={<Plus size={14} />}
                              size="sm"
                              variant="ghost"
                              isDisabled={line.quantity >= available}
                              onClick={() => setQuantity(line.productId, line.variantId, line.quantity + 1)}
                            />
                            <IconButton
                              label={t('orders.removeFromOrder', { product: name })}
                              icon={<X size={14} />}
                              size="sm"
                              variant="ghost"
                              onClick={() => setQuantity(line.productId, line.variantId, 0)}
                            />
                          </HStack>
                        }
                      />
                    )
                  })}
                </List>
              )}

              <Divider />

              <Selector
                label={t('orders.customer')}
                value={draft.customerId || null}
                hasSearch
                hasClear
                isDisabled={isEditing}
                disabledMessage={isEditing ? t('orders.customerLocked') : undefined}
                placeholder={t('orders.walkIn')}
                onChange={(value: string | null) => setDraft((previous) => ({ ...previous, customerId: value ?? '' }))}
                options={reference.customers.map((customer) => ({
                  value: customer.id,
                  label: customer.companyName || `${customer.firstName} ${customer.lastName}`.trim(),
                  description: customer.customerNumber,
                }))}
                width="100%"
              />

              <VStack gap={2}>
                <Text type="label">{t('orders.paymentMethod')}</Text>
                <SegmentedControl
                  label={t('orders.paymentMethod')}
                  value={draft.paymentMethod}
                  layout="fill"
                  onChange={(value) => setDraft((previous) => ({ ...previous, paymentMethod: value as PaymentMethod }))}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <SegmentedControlItem key={method} value={method} label={paymentMethodLabel(method, t)} />
                  ))}
                </SegmentedControl>
              </VStack>

              <TextArea
                label={t('orders.orderNotes')}
                isOptional
                value={draft.notes}
                onChange={(value) => setDraft((previous) => ({ ...previous, notes: value }))}
                placeholder={t('orders.optionalNotes')}
                rows={2}
              />

              <Divider />

              <VStack gap={2}>
                <HStack hAlign="between">
                  <Text color="secondary">{t('common.subtotal')}</Text>
                  <Text hasTabularNumbers>{money(totals.subtotal)}</Text>
                </HStack>
                {reference.taxEnabled && (
                  <HStack hAlign="between">
                    <Text color="secondary">
                      {t('common.tax')} ({(reference.taxRate * 100).toFixed(1)}%)
                    </Text>
                    <Text hasTabularNumbers>{money(totals.tax)}</Text>
                  </HStack>
                )}
                <HStack hAlign="between" vAlign="center">
                  <Text type="large" weight="semibold">
                    {t('common.total')}
                  </Text>
                  <Text type="large" weight="semibold" hasTabularNumbers>
                    {money(totals.total)}
                  </Text>
                </HStack>
              </VStack>

              <Button
                label={isEditing ? t('orders.saveChanges') : t('orders.createOrder')}
                variant="primary"
                width="100%"
                isLoading={isSaving}
                isDisabled={draft.items.length === 0}
                onClick={() => void save()}
              />
            </VStack>
          </Card>
        </div>
      </div>
    </Page>
  )
}
