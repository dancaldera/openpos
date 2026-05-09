import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogConfirm,
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

const getCategoryIcon = (category: string): string => {
  const icons: { [key: string]: string } = {
    Beverages: '🥤',
    Bakery: '🍞',
    'Coffee & Tea': '☕',
    Dairy: '🥛',
    Snacks: '🍫',
    Seafood: '🐟',
    'Frozen Foods': '🧊',
    'Fresh Produce': '🍎',
    'Meat & Poultry': '🍖',
    'Pantry Items': '🥫',
    'Condiments & Sauces': '🫙',
    'Breakfast Items': '🍳',
    'Household Items': '🧽',
    'Personal Care': '🧴',
    Electronics: '📱',
    Other: '📦',
  }
  return icons[category] || '📦'
}

interface ProductVisualProps {
  product?: Product
  name: string
  imageUrl?: string
  sizeClass?: string
  roundedClass?: string
  className?: string
}

function ProductVisual({
  product,
  name,
  imageUrl,
  sizeClass = 'h-10 w-10',
  roundedClass = 'rounded-cards',
  className = '',
}: ProductVisualProps) {
  return (
    <div
      class={`flex shrink-0 items-center justify-center overflow-hidden bg-chalk text-void ${sizeClass} ${roundedClass} ${className}`}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={name} class="h-full w-full object-cover" />
      ) : (
        <span class="text-base leading-none">{getCategoryIcon(product?.category || 'Other')}</span>
      )}
    </div>
  )
}

export default function Orders() {
  const { t } = useTranslation()
  const panelClass = 'rounded-cards border border-fog-border bg-canvas '
  const mutedPanelClass = 'rounded-cards border border-fog-border bg-chalk '
  const softMetricClass = 'rounded-cards border p-3 sm:p-5'

  const [orders, setOrders] = useState<Order[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productCatalog, setProductCatalog] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<Order['status'] | 'all'>('all')
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('today')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'total' | 'status'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [taxRate, setTaxRate] = useState<number>(0.1)
  const [taxEnabled, setTaxEnabled] = useState<boolean>(true)
  const [currencySymbol, setCurrencySymbol] = useState<string>('$')
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [editProductSearch, setEditProductSearch] = useState('')
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

  // Variant state
  const [productsWithVariants, setProductsWithVariants] = useState<Record<string, ProductWithVariants>>({})
  const [selectedVariantForProduct, setSelectedVariantForProduct] = useState<Record<string, string>>({})

  const [newOrder, setNewOrder] = useState({
    items: [] as Array<{ productId: string; quantity: number; variantId?: string }>,
    customerId: '' as string,
    paymentMethod: 'cash' as 'cash' | 'card' | 'transfer',
    notes: '',
  })

  const [editOrderItems, setEditOrderItems] = useState<
    Array<{ productId: string; quantity: number; variantId?: string }>
  >([])
  const [editPaymentMethod, setEditPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash')
  const [editNotes, setEditNotes] = useState('')

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

  const filteredProducts = (() => {
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
  })()

  const filteredEditProducts = (() => {
    if (!editProductSearch.trim()) {
      return products
    }

    const query = editProductSearch.toLowerCase()
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query) ||
        product.price.toString().includes(query) ||
        (product.barcode || '').toLowerCase().includes(query),
    )
  })()

  const addResolvedItemToOrder = (
    resolved: {
      productId: string
      productName: string
      stock: number
      variantId?: string
      variantAttributes?: Record<string, string>
    },
    quantity: number = 1,
  ) => {
    const existingItem = newOrder.items.find(
      (item) => item.productId === resolved.productId && item.variantId === resolved.variantId,
    )

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity
      if (newQuantity > resolved.stock) {
        toast.error(`Insufficient stock. Available: ${resolved.stock}`)
        return
      }

      if (newQuantity <= 0) {
        removeItemFromOrder(resolved.productId, resolved.variantId)
        return
      }

      setNewOrder({
        ...newOrder,
        items: newOrder.items.map((item) =>
          item.productId === resolved.productId && item.variantId === resolved.variantId
            ? { ...item, quantity: newQuantity }
            : item,
        ),
      })

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
      return
    }

    if (quantity > resolved.stock) {
      toast.error(`Insufficient stock. Available: ${resolved.stock}`)
      return
    }

    const label = resolved.variantAttributes
      ? `${resolved.productName} (${Object.entries(resolved.variantAttributes)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')})`
      : resolved.productName

    setNewOrder({
      ...newOrder,
      items: [...newOrder.items, { productId: resolved.productId, quantity, variantId: resolved.variantId }],
    })
    toast.success(t('orders.itemAdded', { product: label, quantity }))
  }

  const handleCreateOrder = async () => {
    if (newOrder.items.length === 0) {
      toast.error(t('orders.addItemError'))
      return
    }

    try {
      setIsLoading(true)
      const result = await orderService.createOrder(newOrder)

      if (result.success && result.order) {
        const newOrdersList = [...allOrders, result.order]
        toast.success(t('orders.orderCreated'))
        setAllOrders(newOrdersList)
        setOrders(newOrdersList)
        setIsCreateModalOpen(false)
        setNewOrder({
          items: [],
          customerId: '',
          paymentMethod: 'cash',
          notes: '',
        })
        setSelectedVariantForProduct({})

        // Reload data with current filter
        await loadData(selectedDateFilter)
        const updatedProducts = await productService.getProducts()
        setProducts(updatedProducts.filter((p) => p.isActive && p.stock > 0))
      } else {
        toast.error(result.error || t('errors.generic'))
      }
    } catch (_err) {
      toast.error(t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
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

  const addItemToOrder = (productId: string, quantity: number = 1, forcedVariantId?: string) => {
    const product = products.find((p) => p.id === productId)
    if (!product) return

    const productName = product.name
    const productVariants = productsWithVariants[productId]

    // Check if product is configurable and needs variant selection
    if (product.variantType === 'configurable') {
      const selectedVariantId = forcedVariantId || selectedVariantForProduct[productId]

      if (!selectedVariantId) {
        toast.error(`Please select a variant for ${productName}`)
        return
      }

      // Verify variant exists and is active
      const variant = productVariants?.variants?.find((v) => v.id === selectedVariantId)
      if (!variant || !variant.isActive) {
        toast.error(`Selected variant is not available for ${productName}`)
        return
      }

      addResolvedItemToOrder(
        {
          productId,
          productName,
          stock: variant.stock,
          variantId: selectedVariantId,
          variantAttributes: variant.attributes,
        },
        quantity,
      )
    } else {
      addResolvedItemToOrder({ productId, productName, stock: product.stock }, quantity)
    }
  }

  const removeItemFromOrder = (productId: string, variantId?: string) => {
    const product = products.find((p) => p.id === productId)
    const productName = product?.name || 'Product'

    toast.info(t('orders.itemRemoved', { product: productName }))
    setNewOrder({
      ...newOrder,
      items: newOrder.items.filter((item) => !(item.productId === productId && item.variantId === variantId)),
    })
  }

  const handleEditOrder = (order: Order) => {
    setEditingOrder(order)
    setEditOrderItems(order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })))
    setEditPaymentMethod(order.paymentMethod || 'cash')
    setEditNotes(order.notes || '')
    setEditProductSearch('')
  }

  const handleUpdateOrder = async () => {
    if (!editingOrder || editOrderItems.length === 0) {
      toast.error(t('orders.addItemError'))
      return
    }

    try {
      setIsLoading(true)
      const result = await orderService.updateOrder(editingOrder.id, {
        items: editOrderItems,
        paymentMethod: editPaymentMethod,
        notes: editNotes,
      })

      if (result.success && result.order) {
        const updated = result.order
        toast.success(t('orders.orderUpdated'))
        const updatedAllOrders = allOrders.map((o) => (o.id === editingOrder.id ? updated : o))
        setAllOrders(updatedAllOrders)
        setOrders(updatedAllOrders)
        setEditingOrder(null)
        setEditOrderItems([])
        setEditPaymentMethod('cash')
        setEditNotes('')
      } else {
        toast.error(result.error || t('errors.generic'))
      }
    } catch (_err) {
      toast.error(t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  const addItemToEditOrder = (productId: string, quantity: number = 1) => {
    const existingItem = editOrderItems.find((item) => item.productId === productId)
    const product = products.find((p) => p.id === productId)
    const productName = product?.name || 'Product'

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity

      if (newQuantity <= 0) {
        // Remove item completely if quantity becomes 0 or negative
        removeItemFromEditOrder(productId)
      } else {
        if (quantity > 0) {
          toast.success(t('orders.itemAdded', { product: productName, quantity: newQuantity }))
        } else {
          toast.info(t('orders.quantityUpdated', { product: productName, quantity: newQuantity }))
        }
        setEditOrderItems(
          editOrderItems.map((item) => (item.productId === productId ? { ...item, quantity: newQuantity } : item)),
        )
      }
    } else {
      toast.success(t('orders.itemAdded', { product: productName, quantity: Math.max(quantity, 1) }))
      setEditOrderItems([...editOrderItems, { productId, quantity: Math.max(quantity, 1) }])
    }
  }

  const removeItemFromEditOrder = (productId: string) => {
    const product = products.find((p) => p.id === productId)
    const productName = product?.name || 'Product'

    toast.info(t('orders.itemRemoved', { product: productName }))
    setEditOrderItems(editOrderItems.filter((item) => item.productId !== productId))
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
      orderLabel: t('orders.order'),
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

    // Add timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      setIsPrinting(false)
      setPrintStatus('Print failed: Operation timed out')
    }, 15000) // 15 second timeout

    try {
      // Validate order data
      if (!order || !order.id || !order.items || order.items.length === 0) {
        throw new Error('Invalid order data')
      }

      const receiptData = buildReceiptData(order)

      if (!receiptData) {
        throw new Error('Could not load company settings')
      }

      // Send to printer
      const response = await printThermalReceipt(receiptData)

      clearTimeout(timeoutId)
      toast.success(t('orders.printSuccess'))
      console.log('Print response:', response)
    } catch (error: unknown) {
      clearTimeout(timeoutId)
      console.error('Print error:', error)
      const printErrorMessage = error instanceof Error ? error.message : String(error)
      setPrintStatus(`Print failed: ${printErrorMessage}`)
      toast.error(printErrorMessage || t('orders.printError'))
    } finally {
      setIsPrinting(false)
      // Clear status after 3 seconds
      setTimeout(() => setPrintStatus(null), 3000)
    }
  }

  if (isLoading && orders.length === 0) {
    return <PageLoader message={t('orders.loadingOrders')} />
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
        <Button class="w-full sm:w-auto" onClick={() => setIsCreateModalOpen(true)}>
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
                  <Button size="sm" variant="outline" onClick={() => setSelectedOrder(order)}>
                    {t('orders.viewDetails')}
                  </Button>
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
              <Button onClick={() => setIsCreateModalOpen(true)} class="mt-4">
                {t('orders.createFirstOrder')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/*  Create Order Modal */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false)
        }}
        title={t('orders.createNewOrder')}
        size="full"
      >
        <div>
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
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        role="img"
                        aria-label="Search"
                      >
                        <title>Search</title>
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                        />
                      </svg>
                    }
                    rightIcon={
                      productSearch ? (
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" role="img" aria-label="Clear search">
                          <title>Clear search</title>
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
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
                            product.stock > 0
                              ? 'cursor-pointer hover:border-fog-border'
                              : 'cursor-not-allowed opacity-50'
                          } ${selectedVariantId ? 'border-fog-border bg-chalk ' : 'border-fog-border bg-canvas '}`}
                        >
                          <div class="flex flex-col h-full">
                            <div class="flex-1">
                              <div class="flex items-start justify-between mb-3 gap-3">
                                <div class="flex min-w-0 flex-1 items-start gap-3">
                                  <ProductVisual
                                    product={product}
                                    name={product.name}
                                    imageUrl={getProductImageUrl(product)}
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

                              {/* Variant selector for configurable products */}
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
                                    class="w-full rounded-cards border border-fog-border bg-canvas px-2 py-2 text-xs text-void focus:border-fog-border focus:outline-none focus:ring-2 focus:ring-void "
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
                                {selectedVariant
                                  ? formatCurrency(selectedVariant.price)
                                  : formatCurrency(product.price)}
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
                              onClick={() => addItemToOrder(product.id)}
                              disabled={
                                product.stock === 0 ||
                                (isConfigurable && !selectedVariantId) ||
                                (selectedVariant && selectedVariant.stock === 0)
                              }
                              class="w-full mt-3 bg-void disabled:bg-chalk disabled:cursor-not-allowed text-canvas disabled:text-ash text-sm font-medium py-2 px-4 rounded-buttons transition-colors duration-150"
                            >
                              {isConfigurable && !selectedVariantId
                                ? t('variants.selectVariant')
                                : t('orders.addProduct')}
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
            {newOrder.items.length > 0 && (
              <div>
                <h3 class="mb-6 text-lg font-semibold text-void ">{t('orders.orderSummary')}</h3>
                <div class={`${mutedPanelClass} space-y-3 p-4 sm:space-y-4 sm:p-6`}>
                  {newOrder.items.map((item) => {
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
                          <ProductVisual product={product} name={product.name} imageUrl={getProductImageUrl(product)} />
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
                                addItemToOrder(item.productId, -1, item.variantId)
                              } else {
                                removeItemFromOrder(item.productId, item.variantId)
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
                            onClick={() => addItemToOrder(item.productId, 1, item.variantId)}
                            disabled={item.quantity >= availableStock}
                            class="w-8 h-8 p-0 flex items-center justify-center"
                          >
                            +
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => removeItemFromOrder(item.productId, item.variantId)}
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
                    {(() => {
                      const subtotal = newOrder.items.reduce((total, item) => {
                        const product = products.find((p) => p.id === item.productId)
                        const variant = item.variantId
                          ? productsWithVariants[item.productId]?.variants?.find((v) => v.id === item.variantId)
                          : undefined
                        const itemPrice = variant?.price || product?.price || 0
                        return total + itemPrice * item.quantity
                      }, 0)
                      const tax = taxEnabled ? subtotal * taxRate : 0
                      const total = subtotal + tax

                      return (
                        <div class={`${panelClass} p-4 sm:p-5`}>
                          <div class="space-y-3 sm:space-y-4">
                            <div class="flex justify-between text-void ">
                              <span class="font-medium">{t('common.subtotal')}:</span>
                              <span class="font-semibold">{formatCurrency(subtotal)}</span>
                            </div>
                            {taxEnabled && (
                              <div class="flex justify-between text-void ">
                                <span class="font-medium">
                                  {t('common.tax')} ({(taxRate * 100).toFixed(1)}%):
                                </span>
                                <span class="font-semibold">{formatCurrency(tax)}</span>
                              </div>
                            )}
                            {!taxEnabled && (
                              <div class="py-2 text-center text-sm italic text-graphite ">
                                {t('orders.taxDisabled')}
                              </div>
                            )}
                            <div class="border-t border-fog-border pt-3 sm:pt-4 ">
                              <div class="flex justify-between rounded-cards bg-chalk px-3 py-2 text-lg font-bold text-void sm:px-4 sm:py-3 sm:text-xl ">
                                <span>{t('common.total')}:</span>
                                <span class="text-void ">{formatCurrency(total)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Customer Selection */}
            <div>
              <Select
                label={t('orders.customer')}
                value={newOrder.customerId}
                onChange={(e) =>
                  setNewOrder({
                    ...newOrder,
                    customerId: (e.target as HTMLSelectElement).value,
                  })
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
                  value={newOrder.paymentMethod}
                  onChange={(e) =>
                    setNewOrder({
                      ...newOrder,
                      paymentMethod: (e.target as HTMLSelectElement).value as 'cash' | 'card' | 'transfer',
                    })
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
                  value={newOrder.notes}
                  onInput={(e) =>
                    setNewOrder({
                      ...newOrder,
                      notes: (e.target as HTMLInputElement).value,
                    })
                  }
                  placeholder={t('orders.optionalNotes')}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-fog-border pt-6 ">
              <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)} disabled={isLoading}>
                {t('common.cancel')}
              </Button>
              <Button type="button" onClick={handleCreateOrder} disabled={isLoading || newOrder.items.length === 0}>
                {isLoading ? t('common.loading') : t('orders.createOrder')}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Edit Order Modal */}
      <Dialog
        isOpen={!!editingOrder}
        onClose={() => {
          setEditingOrder(null)
          setEditOrderItems([])
          setEditPaymentMethod('cash')
          setEditNotes('')
          setEditProductSearch('')
        }}
        title={t('orders.updateOrderTitle', { id: editingOrder?.id ?? '' })}
        size="full"
      >
        <div>
          <div class="space-y-6">
            {/* Available Products for Editing */}
            <div>
              <div class="mb-4">
                <h3 class="text-lg font-semibold text-void ">{t('orders.availableProducts')}</h3>
                <p class="mt-1 text-sm text-graphite ">{t('orders.clickToAdd')}</p>
              </div>
              <div class="mb-2">
                <Input
                  type="search"
                  placeholder={t('orders.searchProducts')}
                  value={editProductSearch}
                  onInput={(e) => setEditProductSearch((e.target as HTMLInputElement).value)}
                  leftIcon={
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      role="img"
                      aria-label="Search"
                    >
                      <title>Search</title>
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                      />
                    </svg>
                  }
                  rightIcon={
                    editProductSearch ? (
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" role="img" aria-label="Clear search">
                        <title>Clear search</title>
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    ) : undefined
                  }
                  onRightIconClick={editProductSearch ? () => setEditProductSearch('') : undefined}
                  class="text-sm"
                />
              </div>
              <div class="mb-3 text-sm text-graphite ">
                {filteredEditProducts.length} {t('orders.of')} {products.length} {t('products.title').toLowerCase()}
              </div>
              <div class={`${panelClass} max-h-96 overflow-y-auto p-4 sm:p-6`}>
                {filteredEditProducts.length === 0 ? (
                  <div class="text-center py-12">
                    <div class="text-6xl mb-4">🔍</div>
                    <h3 class="mb-2 text-lg font-medium text-void ">{t('orders.noProductsFound')}</h3>
                    <p class="text-graphite ">
                      {editProductSearch
                        ? t('orders.noProductsMatch', { search: editProductSearch })
                        : t('orders.noProductsAvailable')}
                    </p>
                    {editProductSearch && (
                      <button
                        type="button"
                        onClick={() => setEditProductSearch('')}
                        class="mt-4 text-void hover:text-void font-medium"
                      >
                        {t('orders.clearSearch')}
                      </button>
                    )}
                  </div>
                ) : (
                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                    {filteredEditProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        class="group relative rounded-cards border border-fog-border bg-canvas p-4 text-left transition-colors duration-150 hover:border-fog-border hover:bg-chalk focus:outline-none focus:ring-2 focus:ring-void cursor-pointer"
                        onClick={() => product.stock > 0 && addItemToEditOrder(product.id)}
                        disabled={product.stock === 0}
                        aria-label={`${t('orders.addProduct')} ${product.name}`}
                      >
                        <div class="flex flex-col h-full">
                          <div class="flex-1">
                            <div class="mb-2 text-sm font-semibold leading-tight text-void ">{product.name}</div>
                            <div class="mb-3 inline-block rounded-full bg-chalk px-2 py-1 text-xs font-medium text-graphite ">
                              {product.category}
                            </div>
                          </div>
                          <div class="flex items-center justify-between mt-auto">
                            <div class="text-lg font-bold text-void ">{formatCurrency(product.price)}</div>
                            <div
                              class={`rounded-full px-2 py-1 text-xs font-medium ${
                                product.stock > 10
                                  ? 'bg-chalk text-void '
                                  : product.stock > 0
                                    ? 'bg-chalk text-void '
                                    : 'bg-chalk text-void '
                              }`}
                            >
                              {product.stock > 0 ? `📦 ${product.stock}` : '❌ Out'}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Edit Order Items */}
            {editOrderItems.length > 0 && (
              <div>
                <h3 class="mb-6 text-lg font-semibold text-void ">{t('orders.updatedOrderSummary')}</h3>
                <div class={`${mutedPanelClass} space-y-3 p-4 sm:space-y-4 sm:p-6`}>
                  {editOrderItems.map((item) => {
                    const product = products.find((p) => p.id === item.productId)
                    return product ? (
                      <div
                        key={item.productId}
                        class="flex flex-col sm:flex-row sm:items-center gap-3 rounded-cards border border-fog-border bg-canvas p-4 "
                      >
                        <div class="flex-1 min-w-0">
                          <div class="mb-1 font-semibold text-void truncate">{product.name}</div>
                          <div class="inline-block rounded-full bg-chalk px-3 py-1 text-sm text-graphite ">
                            {formatCurrency(product.price)} × {item.quantity} ={' '}
                            <span class="font-bold text-void">{formatCurrency(product.price * item.quantity)}</span>
                          </div>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addItemToEditOrder(item.productId, -1)}
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
                            onClick={() => addItemToEditOrder(item.productId, 1)}
                            disabled={item.quantity >= product.stock}
                            class="w-8 h-8 p-0 flex items-center justify-center"
                          >
                            +
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => removeItemFromEditOrder(item.productId)}
                            class="w-8 h-8 p-0 flex items-center justify-center ml-1"
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    ) : null
                  })}

                  {/* Updated Order Totals */}
                  <div class="mt-4 border-t border-fog-border pt-4 sm:mt-6 sm:pt-6">
                    {(() => {
                      const subtotal = editOrderItems.reduce((total, item) => {
                        const product = products.find((p) => p.id === item.productId)
                        return total + (product ? product.price * item.quantity : 0)
                      }, 0)
                      const tax = taxEnabled ? subtotal * taxRate : 0
                      const total = subtotal + tax

                      return (
                        <div class={`${panelClass} p-4 sm:p-5`}>
                          <div class="space-y-3 sm:space-y-4">
                            <div class="flex justify-between text-void ">
                              <span class="font-medium">{t('common.subtotal')}:</span>
                              <span class="font-semibold">{formatCurrency(subtotal)}</span>
                            </div>
                            {taxEnabled && (
                              <div class="flex justify-between text-void ">
                                <span class="font-medium">
                                  {t('common.tax')} ({(taxRate * 100).toFixed(1)}%):
                                </span>
                                <span class="font-semibold">{formatCurrency(tax)}</span>
                              </div>
                            )}
                            {!taxEnabled && (
                              <div class="py-2 text-center text-sm italic text-graphite ">
                                {t('orders.taxDisabled')}
                              </div>
                            )}
                            <div class="border-t border-fog-border pt-3 sm:pt-4 ">
                              <div class="flex justify-between rounded-cards bg-chalk px-3 py-2 text-lg font-bold text-void sm:px-4 sm:py-3 sm:text-xl ">
                                <span>{t('orders.newTotal')}:</span>
                                <span class="text-void ">{formatCurrency(total)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Payment Method & Notes */}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Select
                  label={t('orders.paymentMethod')}
                  value={editPaymentMethod}
                  onChange={(e) =>
                    setEditPaymentMethod((e.target as HTMLSelectElement).value as 'cash' | 'card' | 'transfer')
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
                  value={editNotes}
                  onInput={(e) => setEditNotes((e.target as HTMLInputElement).value)}
                  placeholder={t('orders.optionalNotes')}
                />
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-fog-border pt-6 ">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditingOrder(null)
              setEditOrderItems([])
              setEditPaymentMethod('cash')
              setEditNotes('')
              setEditProductSearch('')
            }}
            disabled={isLoading}
          >
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleUpdateOrder} disabled={isLoading || editOrderItems.length === 0}>
            {isLoading ? t('orders.updating') : t('orders.updateOrder')}
          </Button>
        </div>
      </Dialog>

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
                  class="bg-void text-canvas"
                >
                  {isPrinting ? t('orders.printing') : t('orders.printReceipt')}
                </Button>
                {selectedOrder.status === 'pending' && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        handleEditOrder(selectedOrder)
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
                      class="bg-void text-canvas"
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
                    class="bg-void text-canvas"
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
