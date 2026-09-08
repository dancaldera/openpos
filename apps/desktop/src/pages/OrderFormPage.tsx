import { useEffect, useMemo, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { ProductVisual } from '../components/ProductVisual'
import { Button, DialogConfirm, Input, Select } from '../components/ui'
import { ChevronLeftIcon } from '../components/ui/icons'
import { useTranslation } from '../hooks/useTranslation'
import type { Customer } from '../services/customers-turso'
import { type Order, orderService } from '../services/orders-turso'
import type { Product, ProductWithVariants } from '../services/products-turso'

export interface OrderFormPageProps {
  order: Order | null
  products: Product[]
  productCatalog: Product[]
  productsWithVariants: Record<string, ProductWithVariants>
  customers: Customer[]
  taxRate: number
  taxEnabled: boolean
  currencySymbol: string
  resolvedImageUrls: Record<string, string>
  onBack: () => void
  onSaved: (order: Order) => void
}

type PaymentMethod = 'cash' | 'card' | 'transfer'

interface OrderFormItem {
  productId: string
  quantity: number
  variantId?: string
}

interface OrderFormState {
  items: OrderFormItem[]
  customerId: string
  paymentMethod: PaymentMethod
  notes: string
}

const formFromOrder = (order: Order | null): OrderFormState =>
  order
    ? {
        items: order.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          variantId: item.variantId,
        })),
        customerId: order.customerId || '',
        paymentMethod: order.paymentMethod || 'cash',
        notes: order.notes || '',
      }
    : {
        items: [],
        customerId: '',
        paymentMethod: 'cash',
        notes: '',
      }

export function OrderFormPage({
  order,
  products,
  productCatalog,
  productsWithVariants,
  customers,
  taxRate,
  taxEnabled,
  currencySymbol,
  resolvedImageUrls,
  onBack,
  onSaved,
}: OrderFormPageProps) {
  const { t } = useTranslation()
  const panelClass = 'rounded-cards border border-fog-border bg-canvas '
  const mutedPanelClass = 'rounded-cards border border-fog-border bg-chalk '

  const [formData, setFormData] = useState<OrderFormState>(() => formFromOrder(order))
  const [initialFormSnapshot, setInitialFormSnapshot] = useState(() => JSON.stringify(formFromOrder(order)))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [selectedVariantForProduct, setSelectedVariantForProduct] = useState<Record<string, string>>({})
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)

  useEffect(() => {
    const nextForm = formFromOrder(order)
    setFormData(nextForm)
    setInitialFormSnapshot(JSON.stringify(nextForm))
    setProductSearch('')
    setSelectedVariantForProduct({})
    setError('')
    setShowUnsavedConfirm(false)
  }, [order])

  const isDirty = useMemo(() => JSON.stringify(formData) !== initialFormSnapshot, [formData, initialFormSnapshot])

  const formatCurrency = (amount: number) => `${currencySymbol}${amount.toFixed(2)}`

  const getProductById = (productId: string) => productCatalog.find((product) => product.id === productId)

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) {
      return products
    }

    const query = productSearch.toLowerCase()
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query) ||
        product.price.toString().includes(query) ||
        (product.barcode || '').toLowerCase().includes(query),
    )
  }, [productSearch, products])

  const requestBack = () => {
    if (isLoading) return
    if (isDirty) {
      setShowUnsavedConfirm(true)
      return
    }
    onBack()
  }

  const removeItem = (productId: string, variantId?: string) => {
    const product = getProductById(productId)
    toast.info(t('orders.itemRemoved', { product: product?.name || 'Product' }))
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((item) => !(item.productId === productId && item.variantId === variantId)),
    }))
  }

  const addResolvedItem = (
    resolved: {
      productId: string
      productName: string
      stock: number
      variantId?: string
      variantAttributes?: Record<string, string>
    },
    quantity: number = 1,
  ) => {
    setFormData((prev) => {
      const existingItem = prev.items.find(
        (item) => item.productId === resolved.productId && item.variantId === resolved.variantId,
      )

      if (existingItem) {
        const newQuantity = existingItem.quantity + quantity
        if (newQuantity > resolved.stock) {
          toast.error(`Insufficient stock. Available: ${resolved.stock}`)
          return prev
        }

        if (newQuantity <= 0) {
          removeItem(resolved.productId, resolved.variantId)
          return prev
        }

        if (quantity > 0) {
          const label = resolved.variantAttributes
            ? `${resolved.productName} (${Object.entries(resolved.variantAttributes)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ')})`
            : resolved.productName
          toast.success(t('orders.itemAdded', { product: label, quantity: newQuantity }))
        } else {
          toast.info(t('orders.quantityUpdated', { product: resolved.productName, quantity: newQuantity }))
        }

        return {
          ...prev,
          items: prev.items.map((item) =>
            item.productId === resolved.productId && item.variantId === resolved.variantId
              ? { ...item, quantity: newQuantity }
              : item,
          ),
        }
      }

      if (quantity > resolved.stock) {
        toast.error(`Insufficient stock. Available: ${resolved.stock}`)
        return prev
      }

      const label = resolved.variantAttributes
        ? `${resolved.productName} (${Object.entries(resolved.variantAttributes)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')})`
        : resolved.productName

      toast.success(t('orders.itemAdded', { product: label, quantity: Math.max(quantity, 1) }))
      return {
        ...prev,
        items: [
          ...prev.items,
          { productId: resolved.productId, quantity: Math.max(quantity, 1), variantId: resolved.variantId },
        ],
      }
    })
  }

  const addItem = (productId: string, quantity: number = 1, forcedVariantId?: string) => {
    const product = products.find((p) => p.id === productId)
    if (!product) return

    const productVariants = productsWithVariants[productId]

    if (product.variantType === 'configurable') {
      const selectedVariantId = forcedVariantId || selectedVariantForProduct[productId]

      if (!selectedVariantId) {
        toast.error(`Please select a variant for ${product.name}`)
        return
      }

      const variant = productVariants?.variants?.find((v) => v.id === selectedVariantId)
      if (!variant?.isActive) {
        toast.error(`Selected variant is not available for ${product.name}`)
        return
      }

      addResolvedItem(
        {
          productId,
          productName: product.name,
          stock: variant.stock,
          variantId: selectedVariantId,
          variantAttributes: variant.attributes,
        },
        quantity,
      )
    } else {
      addResolvedItem({ productId, productName: product.name, stock: product.stock }, quantity)
    }
  }

  const totals = useMemo(() => {
    const subtotal = formData.items.reduce((total, item) => {
      const product = getProductById(item.productId)
      const variant = item.variantId
        ? productsWithVariants[item.productId]?.variants?.find((v) => v.id === item.variantId)
        : undefined
      const itemPrice = variant?.price || product?.price || 0
      return total + itemPrice * item.quantity
    }, 0)
    const tax = taxEnabled ? subtotal * taxRate : 0
    return { subtotal, tax, total: subtotal + tax }
  }, [formData.items, productCatalog, productsWithVariants, taxEnabled, taxRate])

  const handleSubmit = async () => {
    if (formData.items.length === 0) {
      toast.error(t('orders.addItemError'))
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const result = order
        ? await orderService.updateOrder(order.id, {
            items: formData.items,
            paymentMethod: formData.paymentMethod,
            notes: formData.notes,
          })
        : await orderService.createOrder({
            items: formData.items,
            customerId: formData.customerId || undefined,
            paymentMethod: formData.paymentMethod,
            notes: formData.notes,
          })

      if (result.success && result.order) {
        onSaved(result.order)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  const title = order ? t('orders.updateOrderTitle', { id: order.id }) : t('orders.createNewOrder')

  return (
    <div class="mx-auto max-w-6xl">
      <div class="sticky top-0 z-10 -mx-1 mb-6 border-b border-fog-border bg-canvas px-1 py-3">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={requestBack}
              disabled={isLoading}
              class="shrink-0"
            >
              <ChevronLeftIcon class="mr-1 h-4 w-4" />
              {t('common.back')}
            </Button>
            <div class="min-w-0">
              <h1 class="truncate text-xl font-semibold text-void">{title}</h1>
              <p class="text-sm text-graphite">{t('orders.formPageHint')}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 sm:justify-end">
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isLoading || formData.items.length === 0}
            >
              {isLoading ? t('common.loading') : order ? t('orders.updateOrder') : t('orders.createOrder')}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div class="mb-6 rounded-cards border border-fog-border bg-chalk px-4 py-3 text-void">
          <div class="flex items-center">
            <span class="mr-2 text-void">⚠️</span>
            {error}
          </div>
        </div>
      )}

      <div class="space-y-8">
        {/* Available Products */}
        <div>
          <div class="mb-4">
            <h3 class="text-lg font-semibold text-void ">{t('orders.availableProducts')}</h3>
            <p class="mt-1 text-sm text-graphite ">{t('orders.clickToAdd')}</p>
          </div>
          <div class="flex flex-col sm:flex-row gap-3 mb-2">
            <div class="flex-1">
              <Input
                type="search"
                placeholder={t('orders.searchProducts')}
                value={productSearch}
                onInput={(e) => setProductSearch((e.target as HTMLInputElement).value)}
                leftIcon={
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" role="img" aria-label="Search">
                    <title>Search</title>
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                    />
                  </svg>
                }
                rightIcon={
                  productSearch ? (
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" role="img" aria-label="Clear search">
                      <title>Clear search</title>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : undefined
                }
                onRightIconClick={productSearch ? () => setProductSearch('') : undefined}
                class="text-sm"
              />
            </div>
          </div>
          <div class="mb-3 text-sm text-graphite ">
            {filteredProducts.length} {t('orders.of')} {products.length} {t('products.title').toLowerCase()}
          </div>
          <div class={`${panelClass} max-h-96 overflow-y-auto p-4 sm:p-6`}>
            {filteredProducts.length === 0 ? (
              <div class="text-center py-12">
                <div class="text-6xl mb-4">🔍</div>
                <h3 class="mb-2 text-lg font-medium text-void ">{t('orders.noProductsFound')}</h3>
                <p class="text-graphite ">
                  {productSearch
                    ? t('orders.noProductsMatch', { search: productSearch })
                    : t('orders.noProductsAvailable')}
                </p>
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => setProductSearch('')}
                    class="mt-4 text-void hover:text-void font-medium"
                  >
                    {t('orders.clearSearch')}
                  </button>
                )}
              </div>
            ) : (
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                {filteredProducts.map((product) => {
                  const productVariants = productsWithVariants[product.id]
                  const isConfigurable = product.variantType === 'configurable'
                  const selectedVariantId = selectedVariantForProduct[product.id]
                  const selectedVariant = productVariants?.variants?.find((v) => v.id === selectedVariantId)

                  return (
                    <div
                      key={product.id}
                      class={`group relative rounded-cards border p-4 transition-colors duration-150 ${
                        product.stock > 0 ? 'cursor-pointer hover:border-fog-border' : 'cursor-not-allowed opacity-50'
                      } ${selectedVariantId ? 'border-fog-border bg-chalk ' : 'border-fog-border bg-canvas '}`}
                    >
                      <div class="flex flex-col h-full">
                        <div class="flex-1">
                          <div class="flex items-start justify-between mb-3 gap-3">
                            <div class="flex min-w-0 flex-1 items-start gap-3">
                              <ProductVisual
                                product={product}
                                name={product.name}
                                imageUrl={product.image ? resolvedImageUrls[product.image] : undefined}
                                sizeClass="h-12 w-12"
                              />
                              <div class="min-w-0 flex-1">
                                <div class="text-sm font-semibold leading-tight text-void ">{product.name}</div>
                                <div class="mt-1 inline-block rounded-full bg-chalk px-2 py-1 text-xs font-medium text-graphite ">
                                  {product.category}
                                </div>
                              </div>
                            </div>
                            {isConfigurable && (
                              <span class="rounded-full bg-chalk px-2 py-1 text-xs text-void ">
                                {t('variants.variant')}
                              </span>
                            )}
                          </div>
                          {product.barcode && (
                            <div class="mb-2 text-[11px] font-mono text-graphite ">{product.barcode}</div>
                          )}

                          {isConfigurable && productVariants?.variants && productVariants.variants.length > 0 && (
                            <div class="mt-2 space-y-2">
                              <select
                                value={selectedVariantId || ''}
                                onChange={(e) => {
                                  setSelectedVariantForProduct({
                                    ...selectedVariantForProduct,
                                    [product.id]: (e.target as HTMLSelectElement).value,
                                  })
                                }}
                                class="w-full rounded-cards border border-fog-border bg-canvas px-2 py-2 text-xs text-void focus:border-fog-border focus:outline-none focus:ring-2 focus:ring-accent "
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="">{t('variants.selectVariant')}</option>
                                {productVariants.variants
                                  .filter((v) => v.isActive && v.stock > 0)
                                  .map((variant) => {
                                    const attrString = Object.entries(variant.attributes)
                                      .map(([k, v]) => `${k}: ${v}`)
                                      .join(', ')
                                    return (
                                      <option key={variant.id} value={variant.id}>
                                        {attrString} - {formatCurrency(variant.price)} ({variant.stock} in stock)
                                      </option>
                                    )
                                  })}
                              </select>
                            </div>
                          )}
                        </div>

                        <div class="flex items-center justify-between mt-auto">
                          <div class="text-lg font-bold text-void ">
                            {selectedVariant ? formatCurrency(selectedVariant.price) : formatCurrency(product.price)}
                          </div>
                          <div
                            class={`rounded-full px-2 py-1 text-xs font-medium ${
                              (selectedVariant ? selectedVariant.stock : product.stock) > 10
                                ? 'bg-chalk text-void '
                                : (selectedVariant ? selectedVariant.stock : product.stock) > 0
                                  ? 'bg-chalk text-void '
                                  : 'bg-chalk text-void '
                            }`}
                          >
                            {(selectedVariant ? selectedVariant.stock : product.stock) > 0
                              ? `📦 ${selectedVariant ? selectedVariant.stock : product.stock}`
                              : '❌ Out'}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => addItem(product.id)}
                          disabled={
                            product.stock === 0 ||
                            (isConfigurable && !selectedVariantId) ||
                            (selectedVariant && selectedVariant.stock === 0)
                          }
                          class="w-full mt-3 bg-void disabled:bg-chalk disabled:cursor-not-allowed text-canvas disabled:text-ash text-sm font-medium py-2 px-4 rounded-buttons transition-colors duration-150"
                        >
                          {isConfigurable && !selectedVariantId ? t('variants.selectVariant') : t('orders.addProduct')}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Order Items */}
        {formData.items.length > 0 && (
          <div>
            <h3 class="mb-6 text-lg font-semibold text-void ">{t('orders.orderSummary')}</h3>
            <div class={`${mutedPanelClass} space-y-3 p-4 sm:space-y-4 sm:p-6`}>
              {formData.items.map((item) => {
                const product = getProductById(item.productId)
                const variant = item.variantId
                  ? productsWithVariants[item.productId]?.variants?.find((v) => v.id === item.variantId)
                  : undefined
                const itemPrice = variant?.price || product?.price || 0
                const availableStock = variant?.stock || product?.stock || 0
                const variantAttributes = variant?.attributes

                return product ? (
                  <div
                    key={`${item.productId}-${item.variantId || 'simple'}`}
                    class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-cards border border-fog-border bg-canvas p-4 "
                  >
                    <div class="flex flex-1 items-start gap-3 min-w-0">
                      <ProductVisual
                        product={product}
                        name={product.name}
                        imageUrl={product.image ? resolvedImageUrls[product.image] : undefined}
                      />
                      <div class="flex-1 min-w-0">
                        <div class="mb-1 font-semibold text-void truncate">{product.name}</div>
                        {variantAttributes && (
                          <div class="mb-2 text-xs text-void ">
                            {Object.entries(variantAttributes).map(([k, v]) => (
                              <span
                                key={k}
                                class="mr-1 mb-1 inline-flex items-center rounded-cards bg-chalk px-2 py-1 text-void "
                              >
                                <span class="capitalize">{k}:</span> {v}
                              </span>
                            ))}
                          </div>
                        )}
                        <div class="inline-block rounded-full bg-chalk px-3 py-1 text-sm text-graphite ">
                          {formatCurrency(itemPrice)} × {item.quantity} ={' '}
                          <span class="font-bold text-void">{formatCurrency(itemPrice * item.quantity)}</span>
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (item.quantity > 1) {
                            addItem(item.productId, -1, item.variantId)
                          } else {
                            removeItem(item.productId, item.variantId)
                          }
                        }}
                        class="w-8 h-8 p-0 flex items-center justify-center"
                      >
                        −
                      </Button>
                      <div class="w-10 rounded border border-fog-border bg-chalk px-1 py-1 text-center text-lg font-bold ">
                        {item.quantity}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addItem(item.productId, 1, item.variantId)}
                        disabled={item.quantity >= availableStock}
                        class="w-8 h-8 p-0 flex items-center justify-center"
                      >
                        +
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => removeItem(item.productId, item.variantId)}
                        class="w-8 h-8 p-0 flex items-center justify-center ml-1"
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ) : null
              })}

              {/* Order Totals */}
              <div class="mt-4 border-t border-fog-border pt-4 sm:mt-6 sm:pt-6">
                <div class={`${panelClass} p-4 sm:p-5`}>
                  <div class="space-y-3 sm:space-y-4">
                    <div class="flex justify-between text-void ">
                      <span class="font-medium">{t('common.subtotal')}:</span>
                      <span class="font-semibold">{formatCurrency(totals.subtotal)}</span>
                    </div>
                    {taxEnabled && (
                      <div class="flex justify-between text-void ">
                        <span class="font-medium">
                          {t('common.tax')} ({(taxRate * 100).toFixed(1)}%):
                        </span>
                        <span class="font-semibold">{formatCurrency(totals.tax)}</span>
                      </div>
                    )}
                    {!taxEnabled && (
                      <div class="py-2 text-center text-sm italic text-graphite ">{t('orders.taxDisabled')}</div>
                    )}
                    <div class="border-t border-fog-border pt-3 sm:pt-4 ">
                      <div class="flex justify-between rounded-cards bg-chalk px-3 py-2 text-lg font-bold text-void sm:px-4 sm:py-3 sm:text-xl ">
                        <span>{order ? t('orders.newTotal') : t('common.total')}:</span>
                        <span class="text-void ">{formatCurrency(totals.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Customer Selection */}
        <div>
          <Select
            label={t('orders.customer')}
            value={formData.customerId}
            disabled={Boolean(order)}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                customerId: (e.target as HTMLSelectElement).value,
              }))
            }
            options={[
              { value: '', label: t('orders.selectCustomerPlaceholder') },
              ...customers.map((customer) => ({
                value: customer.id,
                label: `${customer.firstName} ${customer.lastName}${customer.companyName ? ` (${customer.companyName})` : ''} - ${customer.customerNumber}`,
              })),
            ]}
          />
        </div>

        {/* Payment & Notes */}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Select
              label={t('orders.paymentMethod')}
              value={formData.paymentMethod}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  paymentMethod: (e.target as HTMLSelectElement).value as PaymentMethod,
                }))
              }
              options={[
                { value: 'cash', label: t('orders.cash') },
                { value: 'card', label: t('orders.card') },
                { value: 'transfer', label: t('orders.transfer') },
              ]}
            />
          </div>
          <div>
            <Input
              label={t('orders.orderNotes')}
              value={formData.notes}
              onInput={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  notes: (e.target as HTMLInputElement).value,
                }))
              }
              placeholder={t('orders.optionalNotes')}
            />
          </div>
        </div>
      </div>

      <DialogConfirm
        isOpen={showUnsavedConfirm}
        onClose={() => setShowUnsavedConfirm(false)}
        onConfirm={() => {
          setShowUnsavedConfirm(false)
          onBack()
        }}
        title={t('orders.unsavedChangesTitle')}
        message={t('orders.unsavedChangesMessage')}
        confirmText={t('orders.discardChanges')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </div>
  )
}
