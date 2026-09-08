import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { ProductVisual } from '../components/ProductVisual'
import {
  Button,
  Dialog,
  DialogConfirm,
  Dropdown,
  Input,
  PageLoader,
  Pagination,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui'
import { useTranslation } from '../hooks/useTranslation'
import { authService } from '../services/auth-turso'
import { type CompanySettings, companySettingsService } from '../services/company-settings-turso'
import { type Customer, customerService } from '../services/customers-turso'
import { type Order, orderService } from '../services/orders-turso'
import { formatReceiptData, type PrintReceiptData, printThermalReceipt } from '../services/print-service'
import { resolveProductImageUrls } from '../services/product-images'
import { type Product, type ProductWithVariants, productService } from '../services/products-turso'
import { userService } from '../services/users-turso'
import { OrderFormPage } from './OrderFormPage'

export default function Orders() {
  const { t } = useTranslation()
  const panelClass = 'rounded-cards border border-fog-border bg-canvas '
  const softMetricClass = 'rounded-cards border p-3 sm:p-5'

  const [orders, setOrders] = useState<Order[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productCatalog, setProductCatalog] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [view, setView] = useState<'list' | 'form'>('list')
  const [formOrder, setFormOrder] = useState<Order | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<Order['status'] | 'all'>('all')
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('today')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'total' | 'status'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [taxRate, setTaxRate] = useState<number>(0.1)
  const [taxEnabled, setTaxEnabled] = useState<boolean>(true)
  const [currencySymbol, setCurrencySymbol] = useState<string>('$')
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null)
  const [users, setUsers] = useState<{ [key: string]: string }>({}) // userId -> userName mapping
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'manager' | 'user' | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)
  const [printStatus, setPrintStatus] = useState<string | null>(null)
  const [lastPrintTime, setLastPrintTime] = useState<number>(0)

  const [resolvedImageUrls, setResolvedImageUrls] = useState<Record<string, string>>({})

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [pageSize] = useState(10)
  const [orderStats, setOrderStats] = useState({
    pending: 0,
    completed: 0,
    paid: 0,
    cancelled: 0,
  })
  const canManageOrderLifecycle = currentUserRole === 'admin' || currentUserRole === 'manager'

  const [productsWithVariants, setProductsWithVariants] = useState<Record<string, ProductWithVariants>>({})

  useEffect(() => {
    loadData()
    // Get current user role
    const user = authService.getCurrentUser()
    if (user) {
      setCurrentUserRole(user.role)
    }
  }, [])

  useEffect(() => {
    loadData(selectedDateFilter, 1) // Reset to page 1 when date filter changes
    setCurrentPage(1)
  }, [selectedDateFilter])

  useEffect(() => {
    loadData(selectedDateFilter, currentPage)
  }, [currentPage])

  const getDateFilterOptions = () => {
    const options = [
      { value: 'all', label: `📋 ${t('orders.allOrders')}` },
      { value: 'today', label: `📅 ${t('dates.today')}` },
      { value: 'yesterday', label: `📅 ${t('dates.yesterday')}` },
    ]

    // Add the last 5 days
    const now = new Date()
    for (let i = 2; i <= 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const dateString = date.toISOString().split('T')[0]
      const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      options.push({
        value: dateString,
        label: `📅 ${formattedDate}`,
      })
    }

    return options
  }

  const syncResolvedImageUrls = async (productList: Product[]) => {
    const keys = Array.from(new Set(productList.map((product) => product.image?.trim()).filter(Boolean))) as string[]

    if (keys.length === 0) {
      return
    }

    try {
      const urls = await resolveProductImageUrls(keys)
      setResolvedImageUrls((prev) => ({
        ...prev,
        ...urls,
      }))
    } catch (err) {
      console.error('Failed to resolve product image URLs for orders:', err)
    }
  }

  const getProductById = (productId: string) => productCatalog.find((product) => product.id === productId)

  const getProductImageUrl = (product?: Product) => {
    if (!product?.image) {
      return undefined
    }

    return resolvedImageUrls[product.image]
  }

  const loadData = async (dateFilter?: string, page?: number) => {
    try {
      setIsLoading(true)
      const filterToUse = dateFilter || selectedDateFilter
      const pageToUse = page || currentPage

      const [ordersResult, productsData, settings, usersData, allOrdersForStats, customersData] = await Promise.all([
        filterToUse === 'all'
          ? orderService.getOrdersPaginated(pageToUse, pageSize)
          : orderService.getOrdersByDateFilterPaginated(filterToUse, pageToUse, pageSize),
        productService.getProducts(),
        companySettingsService.getSettings(),
        userService.getUsers(),
        filterToUse === 'all' ? orderService.getOrders() : orderService.getOrdersByDateFilter(filterToUse),
        customerService.getCustomers(),
      ])

      // Set pagination data
      console.log('Orders loaded:', {
        orders: ordersResult.orders,
        totalCount: ordersResult.totalCount,
        allOrdersForStats,
      })
      setOrders(ordersResult.orders)
      setAllOrders(allOrdersForStats) // All orders for filtering and statistics
      setTotalCount(ordersResult.totalCount)
      setTotalPages(ordersResult.totalPages)
      setCurrentPage(ordersResult.currentPage)

      // Calculate statistics from all orders
      const stats = {
        pending: allOrdersForStats.filter((o) => o.status === 'pending').length,
        completed: allOrdersForStats.filter((o) => o.status === 'completed').length,
        paid: allOrdersForStats.filter((o) => o.status === 'paid').length,
        cancelled: allOrdersForStats.filter((o) => o.status === 'cancelled').length,
      }
      setOrderStats(stats)

      setProductCatalog(productsData)
      setProducts(productsData.filter((p) => p.isActive && p.stock > 0))
      void syncResolvedImageUrls(productsData)

      // Load variants for all configurable products
      const variantsMap: Record<string, ProductWithVariants> = {}
      for (const product of productsData) {
        if (product.variantType === 'configurable') {
          try {
            const productWithVariants = await productService.getProductWithVariants(product.id)
            if (productWithVariants) {
              variantsMap[product.id] = productWithVariants
            }
          } catch (err) {
            console.error(`Failed to load variants for product ${product.id}:`, err)
          }
        }
      }
      setProductsWithVariants(variantsMap)
      setCustomers(customersData.filter((c) => c.isActive))
      setCompanySettings(settings)
      setTaxEnabled(settings.taxEnabled)
      setTaxRate(settings.taxEnabled ? settings.taxPercentage / 100 : 0)
      setCurrencySymbol(settings.currencySymbol)

      // Create user mapping
      const userMapping: { [key: string]: string } = {}
      usersData.forEach((user) => {
        userMapping[user.id] = user.name
      })
      setUsers(userMapping)
    } catch (err: unknown) {
      toast.error((err as Error)?.message || t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  const filteredOrders = (() => {
    let filtered = selectedStatus === 'all' ? orders : orders.filter((order) => order.status === selectedStatus)

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (order) =>
          order.id.includes(query) ||
          order.items.some((item) => item.productName.toLowerCase().includes(query)) ||
          order.total.toString().includes(query),
      )
    }

    // Sort orders
    filtered = filtered.sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'date':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'total':
          comparison = a.total - b.total
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    console.log('Filtered orders:', {
      selectedStatus,
      searchQuery,
      filteredCount: filtered.length,
      filtered,
    })
    return filtered
  })()

  const openCreateForm = () => {
    setFormOrder(null)
    setView('form')
  }

  const openEditForm = (order: Order) => {
    setFormOrder(order)
    setView('form')
  }

  const handleCloseOrderForm = () => {
    setView('list')
    setFormOrder(null)
  }

  const handleOrderSaved = async () => {
    const wasEditing = Boolean(formOrder)
    toast.success(wasEditing ? t('orders.orderUpdated') : t('orders.orderCreated'))
    await loadData(selectedDateFilter)
    const updatedProducts = await productService.getProducts()
    setProducts(updatedProducts.filter((p) => p.isActive && p.stock > 0))
    handleCloseOrderForm()
  }

  const handleUpdateStatus = async (orderId: string, status: Order['status']) => {
    if ((status === 'cancelled' || status === 'completed') && !canManageOrderLifecycle) {
      toast.error('Only managers and admins can cancel or complete orders')
      return
    }

    try {
      const result = await orderService.updateOrderStatus(orderId, status)
      if (result.success && result.order) {
        const updatedOrder = result.order
        toast.success(t('orders.statusUpdated'))
        const updatedAllOrders = allOrders.map((o) => (o.id === orderId ? updatedOrder : o))
        setAllOrders(updatedAllOrders)
        setOrders(updatedAllOrders)

        // Reload data and products if status affects inventory
        if (status === 'completed' || status === 'paid' || status === 'cancelled') {
          await loadData(selectedDateFilter)
          const updatedProducts = await productService.getProducts()
          setProducts(updatedProducts.filter((p) => p.isActive && p.stock > 0))
        }
      } else {
        toast.error(result.error || t('errors.generic'))
      }
    } catch (_err) {
      toast.error(t('errors.generic'))
    }
  }

  const handleDeleteOrder = async (orderId: string) => {
    if (!canManageOrderLifecycle) {
      toast.error('Only managers and admins can delete orders')
      return
    }

    try {
      const result = await orderService.deleteOrder(orderId)
      if (result.success) {
        const filteredAllOrders = allOrders.filter((o) => o.id !== orderId)
        setAllOrders(filteredAllOrders)
        setOrders(filteredAllOrders)
        setDeleteConfirm(null)
        toast.success(t('orders.orderDeleted'))

        // Reload data with current filter
        await loadData(selectedDateFilter)
        const updatedProducts = await productService.getProducts()
        setProducts(updatedProducts.filter((p) => p.isActive && p.stock > 0))
      } else {
        toast.error(result.error || t('errors.generic'))
      }
    } catch (_err) {
      toast.error(t('errors.generic'))
    }
  }

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return 'border border-fog-border bg-chalk text-void '
      case 'paid':
        return 'border border-fog-border bg-chalk text-void '
      case 'completed':
        return 'border border-fog-border bg-chalk text-void '
      case 'cancelled':
        return 'border border-fog-border bg-chalk text-void '
      default:
        return 'border border-fog-border bg-chalk text-void '
    }
  }

  const getStatusIcon = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return '⏳'
      case 'paid':
        return '💳'
      case 'completed':
        return '✅'
      case 'cancelled':
        return '❌'
      default:
        return '❓'
    }
  }

  const formatCurrency = (amount: number) => {
    return `${currencySymbol}${amount.toFixed(2)}`
  }

  const handleSort = (column: 'date' | 'total' | 'status') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  const getSortIcon = (column: 'date' | 'total' | 'status') => {
    if (sortBy !== column) return '⇅'
    return sortOrder === 'asc' ? '↑' : '↓'
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const buildReceiptData = (order: Order): PrintReceiptData | null => {
    if (!companySettings) {
      return null
    }

    const receiptData = formatReceiptData(order, companySettings, undefined, t('orders.receiptFooter'))

    return {
      ...receiptData,
      supportLabel: t('orders.support'),
      appVersionLabel: t('orders.appVersion'),
      itemLabel: t('orders.item'),
      qtyLabel: t('common.quantity'),
      totalLabel: t('common.total'),
      subtotalLabel: t('common.subtotal'),
      taxLabel: t('common.tax'),
      orderLabel: t('orders.receiptRef'),
    }
  }

  const handleThermalPrint = async (order: Order) => {
    if (isPrinting) return // Prevent concurrent prints

    // Add debounce protection (2 seconds between prints)
    const now = Date.now()
    if (now - lastPrintTime < 2000) {
      setPrintStatus('Please wait before printing again')
      return
    }
    setLastPrintTime(now)

    setIsPrinting(true)
    setPrintStatus(null)
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    try {
      // Validate order data
      if (!order?.id || !order.items || order.items.length === 0) {
        throw new Error('Invalid order data')
      }

      const receiptData = buildReceiptData(order)

      if (!receiptData) {
        throw new Error('Could not load company settings')
      }

      // Add timeout to prevent hanging native print commands
      timeoutId = setTimeout(() => {
        setIsPrinting(false)
        setPrintStatus('Print failed: Operation timed out')
      }, 15000) // 15 second timeout

      // Send to printer
      const response = await printThermalReceipt(receiptData)

      clearTimeout(timeoutId)
      toast.success(t('orders.printSuccess'))
      console.log('Print response:', response)
    } catch (error: unknown) {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      console.error('Print error:', error)
      const printErrorMessage = error instanceof Error ? error.message : String(error)
      setPrintStatus(`Print failed: ${printErrorMessage}`)
      toast.error(printErrorMessage || t('orders.printError'))
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      setIsPrinting(false)
      setTimeout(() => setPrintStatus(null), 3000)
    }
  }

  if (isLoading && orders.length === 0 && view === 'list') {
    return <PageLoader message={t('orders.loadingOrders')} />
  }

  if (view === 'form') {
    return (
      <OrderFormPage
        order={formOrder}
        products={products}
        productCatalog={productCatalog}
        productsWithVariants={productsWithVariants}
        customers={customers}
        taxRate={taxRate}
        taxEnabled={taxEnabled}
        currencySymbol={currencySymbol}
        resolvedImageUrls={resolvedImageUrls}
        onBack={handleCloseOrderForm}
        onSaved={() => void handleOrderSaved()}
      />
    )
  }

  return (
    <div class="max-w-6xl mx-auto">
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <p class="text-sm text-graphite ">
          {totalCount} {totalCount === 1 ? t('orders.order') : t('orders.orders')}
          {selectedDateFilter === 'today'
            ? ` ${t('dates.today').toLowerCase()}`
            : selectedDateFilter === 'yesterday'
              ? ` ${t('dates.yesterday').toLowerCase()}`
              : selectedDateFilter === 'all'
                ? ` ${t('common.total').toLowerCase()}`
                : ` on ${new Date(`${selectedDateFilter}T00:00:00`).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}`}
          {totalPages > 1 && ` • ${t('pagination.page')} ${currentPage} ${t('pagination.of')} ${totalPages}`}
          {searchQuery && ` • ${filteredOrders.length} ${t('orders.found')}`}
        </p>
        <Button class="w-full sm:w-auto" onClick={openCreateForm}>
          {t('orders.createOrder')}
        </Button>
      </div>

      {/* Print Status Message */}
      {printStatus && (
        <div
          class={`mb-4 rounded-cards border p-3 text-center text-sm ${
            printStatus.includes('failed') || printStatus.includes('Print failed')
              ? 'border-fog-border bg-chalk text-void '
              : 'border-fog-border bg-chalk text-void '
          }`}
        >
          {printStatus}
        </div>
      )}

      <div class="mb-6 space-y-4">
        <div class="flex flex-col sm:flex-row gap-3">
          <div class="flex-1">
            <Input
              type="search"
              placeholder={t('orders.searchPlaceholder')}
              value={searchQuery}
              onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              onChange={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              leftIcon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" role="img" aria-label="Search">
                  <title>Search</title>
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              }
              rightIcon={
                searchQuery ? (
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" role="img" aria-label="Clear search">
                    <title>Clear search</title>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : undefined
              }
              onRightIconClick={searchQuery ? () => setSearchQuery('') : undefined}
            />
          </div>
          <div class="flex gap-3 flex-wrap sm:flex-nowrap">
            <div class="flex-1 sm:flex-none">
              <Select
                value={selectedDateFilter}
                onChange={(e) => setSelectedDateFilter((e.target as HTMLSelectElement).value)}
                options={getDateFilterOptions()}
                class="w-full sm:w-auto min-w-0"
              />
            </div>
            <div class="flex-1 sm:flex-none">
              <Select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus((e.target as HTMLSelectElement).value as Order['status'] | 'all')}
                options={[
                  { value: 'all', label: t('orders.allStatus') },
                  { value: 'pending', label: t('orders.pending') },
                  { value: 'paid', label: t('orders.paid') },
                  { value: 'completed', label: t('orders.completed') },
                  { value: 'cancelled', label: t('orders.cancelled') },
                ]}
                class="w-full sm:w-auto min-w-0"
              />
            </div>
            <div class="hidden sm:flex w-auto items-center rounded-cards border border-fog-border bg-chalk px-3 py-2 text-sm text-graphite ">
              <span class="mr-2">{t('orders.sortBy')}:</span>
              <span class="font-medium capitalize">
                {sortBy === 'date'
                  ? t('common.date')
                  : sortBy === 'total'
                    ? t('common.total')
                    : sortBy === 'status'
                      ? t('common.status')
                      : sortBy}
              </span>
              <span class="ml-1">{getSortIcon(sortBy)}</span>
            </div>
          </div>
        </div>

        {/* Order Statistics */}
        <div class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          <div class={`${softMetricClass} border-fog-border bg-chalk `}>
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xl font-semibold text-void sm:text-2xl ">{orderStats.pending}</div>
                <div class="text-xs text-void sm:text-sm ">{t('orders.pendingOrders')}</div>
              </div>
              <div class="text-xl text-void sm:text-2xl ">⏳</div>
            </div>
          </div>
          <div class={`${softMetricClass} border-fog-border bg-chalk `}>
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xl font-semibold text-void sm:text-2xl ">{orderStats.completed}</div>
                <div class="text-xs text-void sm:text-sm ">{t('orders.completed')}</div>
              </div>
              <div class="text-xl text-void sm:text-2xl ">✅</div>
            </div>
          </div>
          <div class={`${softMetricClass} border-fog-border bg-chalk `}>
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xl font-semibold text-void sm:text-2xl ">{orderStats.paid}</div>
                <div class="text-xs text-void sm:text-sm ">{t('orders.paidOrders')}</div>
              </div>
              <div class="text-xl text-void sm:text-2xl ">💳</div>
            </div>
          </div>
          <div class={`${softMetricClass} border-fog-border bg-chalk `}>
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xl font-semibold text-void sm:text-2xl ">{orderStats.cancelled}</div>
                <div class="text-xs text-void sm:text-sm ">{t('orders.cancelled')}</div>
              </div>
              <div class="text-xl text-void sm:text-2xl ">❌</div>
            </div>
          </div>
        </div>
      </div>

      <div class={`${panelClass} overflow-hidden`}>
        <Table striped>
          <TableHead>
            <TableRow class="bg-chalk ">
              <TableHeader class="font-semibold">{t('orders.order')}</TableHeader>
              <TableHeader class="font-semibold">{t('orders.items')}</TableHeader>
              <TableHeader class="font-semibold">{t('orders.payment')}</TableHeader>
              <TableHeader
                class="cursor-pointer select-none font-semibold hover:bg-chalk "
                onClick={() => handleSort('total')}
              >
                {t('common.total')} {getSortIcon('total')}
              </TableHeader>
              <TableHeader
                class="cursor-pointer select-none font-semibold hover:bg-chalk "
                onClick={() => handleSort('status')}
              >
                {t('common.status')} {getSortIcon('status')}
              </TableHeader>
              <TableHeader
                class="cursor-pointer select-none font-semibold hover:bg-chalk "
                onClick={() => handleSort('date')}
              >
                {t('common.date')} {getSortIcon('date')}
              </TableHeader>
              <TableHeader class="font-semibold">{t('common.actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredOrders.map((order, index) => (
              <TableRow
                key={order.id}
                class="cursor-pointer"
                style={`animation-delay: ${index * 50}ms`}
                onClick={() => setSelectedOrder(order)}
              >
                <TableCell>
                  <span class="font-medium">#{order.id}</span>
                </TableCell>
                <TableCell>
                  <div class="max-w-xs">
                    <div class="mb-1 text-sm font-medium text-void ">
                      {order.items.length} {order.items.length === 1 ? t('orders.item') : t('orders.items')}
                    </div>
                    <div class="space-y-1">
                      {order.items.slice(0, 2).map((item, itemIndex) => {
                        const product = getProductById(item.productId)
                        return (
                          <div
                            key={`${item.productId}-${item.variantId || 'simple'}-${itemIndex}`}
                            class="flex items-center justify-between gap-2 text-xs text-graphite "
                          >
                            <div class="flex min-w-0 items-center gap-2">
                              <ProductVisual
                                product={product}
                                name={item.productName}
                                imageUrl={getProductImageUrl(product)}
                                sizeClass="h-8 w-8"
                                roundedClass="rounded-cards"
                              />
                              <span class="truncate">{item.productName}</span>
                            </div>
                            <span class="flex-shrink-0 font-medium">×{item.quantity}</span>
                          </div>
                        )
                      })}
                      {order.items.length > 2 && (
                        <div class="text-xs text-graphite ">
                          +{order.items.length - 2} {t('orders.more')}...
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {order.paymentMethod && (
                    <div class="flex items-center">
                      <span class="text-lg mr-2">
                        {order.paymentMethod === 'cash' ? '💵' : order.paymentMethod === 'card' ? '💳' : '🔄'}
                      </span>
                      <span class="text-sm font-medium capitalize text-void ">
                        {order.paymentMethod === 'cash'
                          ? t('orders.cash')
                          : order.paymentMethod === 'card'
                            ? t('orders.card')
                            : t('orders.transfer')}
                      </span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div class="text-right">
                    <div class="text-lg font-bold text-void ">
                      {formatCurrency(taxEnabled ? order.total : order.subtotal)}
                    </div>
                    {taxEnabled && order.tax > 0 && (
                      <div class="text-xs text-graphite ">
                        {t('common.tax')}: {formatCurrency(order.tax)}
                      </div>
                    )}
                    {taxEnabled && order.tax === 0 && (
                      <div class="text-xs italic text-graphite ">{t('orders.noTaxApplied')}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    class={`inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wide ${getStatusColor(order.status)}`}
                  >
                    <span class="mr-1 text-sm">{getStatusIcon(order.status)}</span>
                    {order.status === 'pending'
                      ? t('orders.pending')
                      : order.status === 'paid'
                        ? t('orders.paid')
                        : order.status === 'completed'
                          ? t('orders.completed')
                          : t('orders.cancelled')}
                  </div>
                </TableCell>
                <TableCell>
                  <div class="text-sm text-graphite ">
                    <div>{new Date(order.createdAt).toLocaleDateString()}</div>
                    <div class="text-xs text-graphite ">
                      {new Date(order.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div class="flex justify-center">
                    <Dropdown
                      align="right"
                      items={[
                        {
                          id: `${order.id}-view`,
                          label: t('orders.viewDetails'),
                          onClick: () => setSelectedOrder(order),
                        },
                      ]}
                      trigger={
                        <>
                          <span class="inline-flex h-7 w-7 items-center justify-center rounded-cards border border-fog-border text-graphite transition-colors hover:bg-chalk hover:text-void ">
                            <svg aria-hidden="true" viewBox="0 0 16 16" class="h-4 w-4 fill-current">
                              <circle cx="3" cy="8" r="1.25" />
                              <circle cx="8" cy="8" r="1.25" />
                              <circle cx="13" cy="8" r="1.25" />
                            </svg>
                          </span>
                          <span class="sr-only">{t('common.actions')}</span>
                        </>
                      }
                    />
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
          onPageChange={handlePageChange}
          totalCount={totalCount}
          pageSize={pageSize}
          isLoading={isLoading}
        />
      )}

      {filteredOrders.length === 0 && (
        <div class={`${panelClass} p-12`}>
          <div class="text-center">
            <div class="text-6xl mb-6">
              {searchQuery
                ? '🔍'
                : selectedStatus === 'all'
                  ? '📋'
                  : selectedStatus === 'pending'
                    ? '⏳'
                    : selectedStatus === 'completed'
                      ? '✅'
                      : selectedStatus === 'paid'
                        ? '💳'
                        : '❌'}
            </div>
            <h2 class="mb-3 text-lg font-semibold text-void ">
              {searchQuery
                ? t('orders.noMatchingOrders')
                : selectedStatus === 'all'
                  ? t('orders.noOrdersYet')
                  : t('orders.noOrdersWithStatus', { status: selectedStatus })}
            </h2>
            <p class="mx-auto mb-6 max-w-md text-graphite ">
              {searchQuery
                ? t('orders.noMatchingOrdersDesc', { query: searchQuery })
                : selectedStatus === 'all'
                  ? t('orders.noOrdersYetDesc')
                  : t('orders.noOrdersWithStatusDesc', { status: selectedStatus })}
            </p>
            {!searchQuery && selectedStatus === 'all' && (
              <Button onClick={openCreateForm} class="mt-4">
                {t('orders.createFirstOrder')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <Dialog
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          title={t('orders.orderDetailsTitle', { id: selectedOrder.id })}
          size="lg"
        >
          <div>
            <div class="space-y-6">
              {/* Order Header */}
              <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-fog-border pb-4 ">
                <div>
                  <div class="flex flex-wrap items-center gap-2 mb-2">
                    <div
                      class={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-wide ${getStatusColor(selectedOrder.status)}`}
                    >
                      <span class="mr-2 text-base">{getStatusIcon(selectedOrder.status)}</span>
                      {selectedOrder.status === 'pending'
                        ? t('orders.pending')
                        : selectedOrder.status === 'paid'
                          ? t('orders.paid')
                          : selectedOrder.status === 'completed'
                            ? t('orders.completed')
                            : t('orders.cancelled')}
                    </div>
                    {selectedOrder.paymentMethod && (
                      <div class="flex items-center text-graphite ">
                        <span class="text-lg mr-1">
                          {selectedOrder.paymentMethod === 'cash'
                            ? '💵'
                            : selectedOrder.paymentMethod === 'card'
                              ? '💳'
                              : '🔄'}
                        </span>
                        <span class="text-sm capitalize">
                          {selectedOrder.paymentMethod === 'cash'
                            ? t('orders.cash')
                            : selectedOrder.paymentMethod === 'card'
                              ? t('orders.card')
                              : t('orders.transfer')}
                        </span>
                      </div>
                    )}
                  </div>
                  <div class="text-sm text-graphite ">
                    {t('orders.created')}: {new Date(selectedOrder.createdAt).toLocaleString()}
                  </div>
                  {selectedOrder.completedAt && (
                    <div class="text-sm text-graphite ">
                      {t('orders.completed')}: {new Date(selectedOrder.completedAt).toLocaleString()}
                    </div>
                  )}
                  {selectedOrder.userId && users[selectedOrder.userId] && (
                    <div class="text-sm text-graphite ">
                      {t('orders.createdBy')}: <span class="font-medium text-void ">{users[selectedOrder.userId]}</span>
                    </div>
                  )}
                </div>
                <div class="sm:text-right">
                  <div class="text-3xl font-bold text-void ">
                    {formatCurrency(taxEnabled ? selectedOrder.total : selectedOrder.subtotal)}
                  </div>
                  <div class="text-sm text-graphite ">{t('orders.totalAmount')}</div>
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h4 class="mb-3 text-lg font-semibold text-void ">{t('orders.orderItems')}</h4>
                <div class="space-y-3">
                  {selectedOrder.items.map((item, index) => (
                    <div
                      key={`${item.productId}-${item.variantId || 'simple'}-${index}`}
                      class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-cards border border-fog-border bg-chalk p-4 "
                    >
                      <div class="flex min-w-0 flex-1 items-start gap-3">
                        <ProductVisual
                          product={getProductById(item.productId)}
                          name={item.productName}
                          imageUrl={getProductImageUrl(getProductById(item.productId))}
                          sizeClass="h-12 w-12"
                        />
                        <div class="min-w-0 flex-1">
                          <div class="font-semibold text-void truncate">{item.productName}</div>
                          {item.variantAttributes && (
                            <div class="mt-1 text-xs text-void ">
                              {Object.entries(item.variantAttributes).map(([k, v]) => (
                                <span
                                  key={k}
                                  class="mr-1 mb-1 inline-flex items-center rounded-cards bg-chalk px-2 py-1 text-void "
                                >
                                  <span class="capitalize">{k}:</span> {v}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div class="flex items-center justify-between sm:justify-end gap-4 flex-shrink-0">
                        <div class="text-center">
                          <div class="font-semibold text-void ">×{item.quantity}</div>
                          <div class="text-xs text-graphite ">{t('common.quantity')}</div>
                        </div>
                        <div class="text-right">
                          <div class="font-semibold text-void ">{formatCurrency(item.unitPrice)}</div>
                          <div class="text-xs text-graphite ">{t('orders.unitPrice')}</div>
                        </div>
                        <div class="text-right">
                          <div class="text-lg font-bold text-void ">{formatCurrency(item.totalPrice)}</div>
                          <div class="text-xs text-graphite ">{t('orders.itemTotal')}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Summary */}
              <div class="rounded-cards border border-fog-border bg-chalk p-4 ">
                <h4 class="mb-3 text-lg font-semibold text-void ">{t('orders.orderSummary')}</h4>
                <div class="space-y-2">
                  {/* Only show subtotal and tax breakdown when tax is enabled */}
                  {taxEnabled && (
                    <>
                      <div class="flex justify-between text-void ">
                        <span>{t('common.subtotal')}:</span>
                        <span class="font-semibold">{formatCurrency(selectedOrder.subtotal)}</span>
                      </div>
                      {/* Only show tax line if the order actually has tax applied */}
                      {selectedOrder.tax > 0 && (
                        <div class="flex justify-between text-void ">
                          <span>
                            {t('common.tax')} ({((selectedOrder.tax / selectedOrder.subtotal) * 100).toFixed(1)}%):
                          </span>
                          <span class="font-semibold">{formatCurrency(selectedOrder.tax)}</span>
                        </div>
                      )}
                      <div class="border-t border-fog-border pt-2 ">
                        <div class="flex justify-between text-xl font-bold text-void ">
                          <span>{t('common.total')}:</span>
                          <span>{formatCurrency(selectedOrder.total)}</span>
                        </div>
                      </div>
                    </>
                  )}
                  {/* When tax is disabled, only show the total */}
                  {!taxEnabled && (
                    <div class="flex justify-between text-xl font-bold text-void ">
                      <span>{t('common.total')}:</span>
                      <span>{formatCurrency(selectedOrder.subtotal)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div>
                  <h4 class="mb-3 text-lg font-semibold text-void ">{t('orders.notes')}</h4>
                  <div class="rounded-cards border border-fog-border bg-chalk p-4 ">
                    <p class="text-void ">{selectedOrder.notes}</p>
                  </div>
                </div>
              )}

              {/* Order Actions */}
              <div class="flex flex-wrap items-center gap-2 border-t border-fog-border pt-4 ">
                <Button
                  size="sm"
                  onClick={() => handleThermalPrint(selectedOrder)}
                  disabled={isPrinting}
                  class="bg-accent text-canvas"
                >
                  {isPrinting ? t('orders.printing') : t('orders.printReceipt')}
                </Button>
                {selectedOrder.status === 'pending' && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        openEditForm(selectedOrder)
                        setSelectedOrder(null)
                      }}
                    >
                      {t('orders.updateOrder')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        handleUpdateStatus(selectedOrder.id, 'paid')
                        setSelectedOrder(null)
                      }}
                      class="bg-accent text-canvas"
                    >
                      {t('orders.markAsPaid')}
                    </Button>
                    {canManageOrderLifecycle && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          handleUpdateStatus(selectedOrder.id, 'cancelled')
                          setSelectedOrder(null)
                        }}
                        class="text-void border-fog-border hover:bg-chalk "
                      >
                        {t('orders.cancelOrder')}
                      </Button>
                    )}
                  </>
                )}
                {selectedOrder.status === 'paid' && canManageOrderLifecycle && (
                  <Button
                    size="sm"
                    onClick={() => {
                      handleUpdateStatus(selectedOrder.id, 'completed')
                      setSelectedOrder(null)
                    }}
                    class="bg-accent text-canvas"
                  >
                    {t('orders.markComplete')}
                  </Button>
                )}
                {canManageOrderLifecycle && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDeleteConfirm(selectedOrder.id)
                      setSelectedOrder(null)
                    }}
                    class="text-void border-fog-border hover:bg-chalk "
                  >
                    {t('orders.deleteOrder')}
                  </Button>
                )}
                <div class="flex-1" />
                <Button size="sm" variant="outline" onClick={() => setSelectedOrder(null)}>
                  {t('common.close')}
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      <DialogConfirm
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteOrder(deleteConfirm)}
        title={t('orders.confirmDelete')}
        message={t('orders.deleteConfirmMessage')}
        confirmText={t('common.delete')}
        variant="danger"
      />
    </div>
  )
}
