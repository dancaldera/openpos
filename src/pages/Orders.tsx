import { useEffect, useState } from 'preact/hooks'
import {
  Button,
  Container,
  Dialog,
  DialogBody,
  DialogConfirm,
  DialogFooter,
  Dropdown,
  type DropdownItem,
  Heading,
  Input,
  Pagination,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '../components/ui'
import { useTranslation } from '../hooks/useTranslation'
import { authService } from '../services/auth-sqlite'
import { companySettingsService } from '../services/company-settings-sqlite'
import { type Order, orderService } from '../services/orders-sqlite'
import { type Product, productService } from '../services/products-sqlite'
import { userService } from '../services/users-sqlite'
import { PrintService } from '../services/print-service'

export default function Orders() {
  const { t } = useTranslation()

  const [orders, setOrders] = useState<Order[]>([])
  const [allOrders, setAllOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
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
  const [productSearch, setProductSearch] = useState('')
  const [editProductSearch, setEditProductSearch] = useState('')
  const [users, setUsers] = useState<{ [key: string]: string }>({}) // userId -> userName mapping
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'manager' | 'user' | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)
  const [printStatus, setPrintStatus] = useState<string | null>(null)

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

  const [newOrder, setNewOrder] = useState({
    items: [] as Array<{ productId: string; quantity: number }>,
    paymentMethod: 'cash' as 'cash' | 'card' | 'transfer',
    notes: '',
  })

  const [editOrderItems, setEditOrderItems] = useState<Array<{ productId: string; quantity: number }>>([])
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

  const loadData = async (dateFilter?: string, page?: number) => {
    try {
      setIsLoading(true)
      const filterToUse = dateFilter || selectedDateFilter
      const pageToUse = page || currentPage

      const [ordersResult, productsData, settings, usersData, allOrdersForStats] = await Promise.all([
        filterToUse === 'all'
          ? orderService.getOrdersPaginated(pageToUse, pageSize)
          : orderService.getOrdersByDateFilterPaginated(filterToUse, pageToUse, pageSize),
        productService.getProducts(),
        companySettingsService.getSettings(),
        userService.getUsers(),
        filterToUse === 'all' ? orderService.getOrders() : orderService.getOrdersByDateFilter(filterToUse),
      ])

      // Set pagination data
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

      setProducts(productsData.filter((p) => p.isActive && p.stock > 0))
      setTaxEnabled(settings.taxEnabled)
      setTaxRate(settings.taxEnabled ? settings.taxPercentage / 100 : 0)
      setCurrencySymbol(settings.currencySymbol)

      // Create user mapping
      const userMapping: { [key: string]: string } = {}
      usersData.forEach((user) => {
        userMapping[user.id] = user.name
      })
      setUsers(userMapping)

      setError('')
    } catch (err: unknown) {
      setError((err as Error)?.message || t('errors.generic'))
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
        product.price.toString().includes(query),
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
        product.price.toString().includes(query),
    )
  })()

  const handleCreateOrder = async () => {
    if (newOrder.items.length === 0) {
      setError(t('orders.addItemError'))
      return
    }

    try {
      setIsLoading(true)
      const result = await orderService.createOrder(newOrder)

      if (result.success && result.order) {
        const newOrdersList = [...allOrders, result.order]
        setAllOrders(newOrdersList)
        setOrders(newOrdersList)
        setIsCreateModalOpen(false)
        setNewOrder({
          items: [],
          paymentMethod: 'cash',
          notes: '',
        })

        // Reload data with current filter
        await loadData(selectedDateFilter)
        const updatedProducts = await productService.getProducts()
        setProducts(updatedProducts.filter((p) => p.isActive && p.stock > 0))

        setError('')
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateStatus = async (orderId: string, status: Order['status']) => {
    try {
      const result = await orderService.updateOrderStatus(orderId, status)
      if (result.success && result.order) {
        const updatedOrder = result.order
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
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    }
  }

  const handleDeleteOrder = async (orderId: string) => {
    try {
      const result = await orderService.deleteOrder(orderId)
      if (result.success) {
        const filteredAllOrders = allOrders.filter((o) => o.id !== orderId)
        setAllOrders(filteredAllOrders)
        setOrders(filteredAllOrders)
        setDeleteConfirm(null)

        // Reload data with current filter
        await loadData(selectedDateFilter)
        const updatedProducts = await productService.getProducts()
        setProducts(updatedProducts.filter((p) => p.isActive && p.stock > 0))
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    }
  }

  const addItemToOrder = (productId: string, quantity: number = 1) => {
    const existingItem = newOrder.items.find((item) => item.productId === productId)

    if (existingItem) {
      setNewOrder({
        ...newOrder,
        items: newOrder.items.map((item) =>
          item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item,
        ),
      })
    } else {
      setNewOrder({
        ...newOrder,
        items: [...newOrder.items, { productId, quantity }],
      })
    }
  }

  const removeItemFromOrder = (productId: string) => {
    setNewOrder({
      ...newOrder,
      items: newOrder.items.filter((item) => item.productId !== productId),
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
      setError(t('orders.addItemError'))
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
        const updatedAllOrders = allOrders.map((o) => (o.id === editingOrder.id ? updated : o))
        setAllOrders(updatedAllOrders)
        setOrders(updatedAllOrders)
        setEditingOrder(null)
        setEditOrderItems([])
        setEditPaymentMethod('cash')
        setEditNotes('')
        setError('')
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  const addItemToEditOrder = (productId: string, quantity: number = 1) => {
    const existingItem = editOrderItems.find((item) => item.productId === productId)
    const originalItem = editingOrder?.items.find((item) => item.productId === productId)

    if (existingItem) {
      // Only allow increasing quantities, not decreasing below original amount
      const newQuantity = Math.max(existingItem.quantity + quantity, originalItem?.quantity || 1)

      setEditOrderItems(
        editOrderItems.map((item) => (item.productId === productId ? { ...item, quantity: newQuantity } : item)),
      )
    } else {
      setEditOrderItems([...editOrderItems, { productId, quantity }])
    }
  }

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 border border-yellow-300 shadow-sm'
      case 'paid':
        return 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border border-blue-300 shadow-sm'
      case 'completed':
        return 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border border-green-300 shadow-sm'
      case 'cancelled':
        return 'bg-gradient-to-r from-red-100 to-red-200 text-red-800 border border-red-300 shadow-sm'
      default:
        return 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 border border-gray-300 shadow-sm'
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

  const handleThermalPrint = async (order: Order) => {
    setIsPrinting(true)
    setPrintStatus(null)

    try {
      // Get company settings for printing
      const settings = await companySettingsService.getSettings()
      
      // Format receipt data
      const receiptData = PrintService.formatReceiptData(order, settings)
      
      // Send to printer
      const response = await PrintService.printThermalReceipt(receiptData)
      
      setPrintStatus('Print command sent successfully!')
      console.log('Print response:', response)
    } catch (error: any) {
      console.error('Print error:', error)
      setPrintStatus(`Print failed: ${error.message || error}`)
    } finally {
      setIsPrinting(false)
      // Clear status after 3 seconds
      setTimeout(() => setPrintStatus(null), 3000)
    }
  }

  const getOrderActionItems = (order: Order): DropdownItem[] => {
    const items: DropdownItem[] = [
      {
        id: `view-${order.id}`,
        label: t('orders.viewDetails'),
        icon: '👁️',
        onClick: () => setSelectedOrder(order),
      },
      {
        id: `print-${order.id}`,
        label: 'Print Receipt',
        icon: '🖨️',
        onClick: () => handleThermalPrint(order),
      },
    ]

    if (order.status === 'pending') {
      items.push(
        {
          id: `edit-${order.id}`,
          label: t('orders.updateOrder'),
          icon: '✏️',
          onClick: () => handleEditOrder(order),
        },
        {
          id: `pay-${order.id}`,
          label: t('orders.markAsPaid'),
          icon: '💰',
          onClick: () => handleUpdateStatus(order.id, 'paid'),
        },
        {
          id: `cancel-${order.id}`,
          label: t('orders.cancelOrder'),
          icon: '❌',
          onClick: () => handleUpdateStatus(order.id, 'cancelled'),
          variant: 'danger',
        },
      )
    }

    if (order.status === 'paid') {
      items.push({
        id: `complete-${order.id}`,
        label: t('orders.markComplete'),
        icon: '✅',
        onClick: () => handleUpdateStatus(order.id, 'completed'),
      })
    }

    // Only show delete option for admin and manager roles
    if (currentUserRole === 'admin' || currentUserRole === 'manager') {
      items.push(
        {
          id: `separator-${order.id}`,
          label: '',
          icon: '',
          onClick: () => {},
          separator: true,
        },
        {
          id: `delete-${order.id}`,
          label: t('orders.deleteOrder'),
          icon: '🗑️',
          onClick: () => setDeleteConfirm(order.id),
          variant: 'danger',
        },
      )
    }

    return items
  }

  if (isLoading) {
    return (
      <div class="bg-white rounded-lg shadow p-6">
        <div class="text-center py-8">
          <div class="w-8 h-8 bg-blue-600 rounded-full animate-spin border-2 border-transparent border-t-white mx-auto mb-4"></div>
          <p class="text-gray-600">{t('orders.loadingOrders')}</p>
        </div>
      </div>
    )
  }

  return (
    <Container size="xl">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">{t('orders.title')}</h1>
          <p class="text-gray-600">
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
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <span class="mr-2">➕</span>
          {t('orders.createOrder')}
        </Button>
      </div>

      {error && <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

      {/* Print Status Message */}
      {printStatus && (
        <div
          class={`text-center p-3 mb-4 text-sm rounded ${
            printStatus.includes('failed') || printStatus.includes('Print failed')
              ? 'bg-red-100 text-red-700 border border-red-200'
              : 'bg-green-100 text-green-700 border border-green-200'
          }`}
        >
          {printStatus}
        </div>
      )}

      <div class="mb-6 space-y-4">
        <div class="flex gap-4">
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
              class="bg-white text-gray-900 placeholder-gray-500"
            />
          </div>
          <div class="w-auto">
            <Select
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter((e.target as HTMLSelectElement).value)}
              options={getDateFilterOptions()}
              class="w-auto min-w-0"
            />
          </div>
          <div class="w-auto">
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
              class="w-auto min-w-0"
            />
          </div>
          <div class="flex items-center text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg w-auto">
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

        {/* Order Statistics */}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-3xl font-bold text-blue-600">{orderStats.pending}</div>
                <div class="text-sm font-medium text-blue-700">{t('orders.pendingOrders')}</div>
              </div>
              <div class="text-blue-400 text-2xl">⏳</div>
            </div>
          </div>
          <div class="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border border-green-200 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-3xl font-bold text-green-600">{orderStats.completed}</div>
                <div class="text-sm font-medium text-green-700">{t('orders.completed')}</div>
              </div>
              <div class="text-green-400 text-2xl">✅</div>
            </div>
          </div>
          <div class="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl border border-purple-200 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-3xl font-bold text-purple-600">{orderStats.paid}</div>
                <div class="text-sm font-medium text-purple-700">{t('orders.paidOrders')}</div>
              </div>
              <div class="text-purple-400 text-2xl">💳</div>
            </div>
          </div>
          <div class="bg-gradient-to-br from-red-50 to-red-100 p-6 rounded-xl border border-red-200 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-3xl font-bold text-red-600">{orderStats.cancelled}</div>
                <div class="text-sm font-medium text-red-700">{t('orders.cancelled')}</div>
              </div>
              <div class="text-red-400 text-2xl">❌</div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <Table>
          <TableHead>
            <TableRow class="bg-gray-50">
              <TableHeader class="font-semibold text-gray-900">{t('orders.order')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('orders.items')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('orders.payment')}</TableHeader>
              <TableHeader
                class="font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('total')}
              >
                {t('common.total')} {getSortIcon('total')}
              </TableHeader>
              <TableHeader
                class="font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('status')}
              >
                {t('common.status')} {getSortIcon('status')}
              </TableHeader>
              <TableHeader
                class="font-semibold text-gray-900 cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort('date')}
              >
                {t('common.date')} {getSortIcon('date')}
              </TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('common.actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredOrders.map((order, index) => (
              <TableRow
                key={order.id}
                class="hover:bg-gray-50 transition-all duration-200 hover:shadow-sm cursor-pointer"
                style={`animation-delay: ${index * 50}ms`}
                onClick={() => setSelectedOrder(order)}
              >
                <TableCell>
                  <Text>#{order.id}</Text>
                </TableCell>
                <TableCell>
                  <div class="max-w-xs">
                    <div class="text-sm font-medium text-gray-900 mb-1">
                      {order.items.length} {order.items.length === 1 ? t('orders.item') : t('orders.items')}
                    </div>
                    <div class="space-y-1">
                      {order.items.slice(0, 2).map((item) => (
                        <div key={item.productId} class="flex justify-between text-xs text-gray-600">
                          <span class="truncate mr-2">{item.productName}</span>
                          <span class="flex-shrink-0 font-medium">×{item.quantity}</span>
                        </div>
                      ))}
                      {order.items.length > 2 && (
                        <div class="text-xs text-gray-500">
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
                      <span class="text-sm font-medium text-gray-700 capitalize">
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
                    <div class="text-lg font-bold text-gray-900">
                      {formatCurrency(taxEnabled ? order.total : order.subtotal)}
                    </div>
                    {taxEnabled && order.tax > 0 && (
                      <div class="text-xs text-gray-500">
                        {t('common.tax')}: {formatCurrency(order.tax)}
                      </div>
                    )}
                    {taxEnabled && order.tax === 0 && (
                      <div class="text-xs text-gray-400 italic">{t('orders.noTaxApplied')}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    class={`inline-flex items-center px-3 py-2 rounded-full text-xs font-semibold uppercase tracking-wide ${getStatusColor(order.status)} transition-all hover:scale-105`}
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
                  <div class="text-sm text-gray-600">
                    <div>{new Date(order.createdAt).toLocaleDateString()}</div>
                    <div class="text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()} class="relative">
                  <Dropdown
                    trigger={
                      <span class="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all hover:shadow-md cursor-pointer group">
                        <span class="mr-2 group-hover:scale-110 transition-transform">⚙️</span>
                        <span class="font-semibold">{t('common.actions')}</span>
                        <span class="ml-1 text-xs group-hover:rotate-180 transition-transform duration-200">▼</span>
                      </span>
                    }
                    items={getOrderActionItems(order)}
                    align="right"
                    width="w-52"
                    usePortal={true}
                  />
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
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
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
            <Heading level={3} class="mb-3 text-gray-900">
              {searchQuery
                ? t('orders.noMatchingOrders')
                : selectedStatus === 'all'
                  ? t('orders.noOrdersYet')
                  : t('orders.noOrdersWithStatus', { status: selectedStatus })}
            </Heading>
            <Text class="text-gray-600 mb-6 max-w-md mx-auto">
              {searchQuery
                ? t('orders.noMatchingOrdersDesc', { query: searchQuery })
                : selectedStatus === 'all'
                  ? t('orders.noOrdersYetDesc')
                  : t('orders.noOrdersWithStatusDesc', { status: selectedStatus })}
            </Text>
            {!searchQuery && selectedStatus === 'all' && (
              <Button onClick={() => setIsCreateModalOpen(true)} class="mt-4">
                <span class="mr-2">➕</span>
                {t('orders.createFirstOrder')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/*  Create Order Modal */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={t('orders.createNewOrder')}
        size="full"
      >
        <DialogBody>
          <div class="space-y-6">
            {/* Available Products */}
            <div>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                <div>
                  <h3 class="text-lg font-semibold text-gray-900">{t('orders.availableProducts')}</h3>
                  <p class="text-sm text-gray-600 mt-1">{t('orders.clickToAdd')}</p>
                </div>
                <div class="flex items-center gap-3">
                  <div class="w-64">
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
                          <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            role="img"
                            aria-label="Clear search"
                          >
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
                  <div class="text-sm text-gray-500">
                    {filteredProducts.length} {t('orders.of')} {products.length} {t('products.title').toLowerCase()}
                  </div>
                </div>
              </div>
              <div class="max-h-96 overflow-y-auto backdrop-blur-lg bg-gradient-to-br from-white/20 to-white/10 border border-white/30 rounded-2xl p-6 shadow-2xl">
                {filteredProducts.length === 0 ? (
                  <div class="text-center py-12">
                    <div class="text-6xl mb-4">🔍</div>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">{t('orders.noProductsFound')}</h3>
                    <p class="text-gray-500">
                      {productSearch
                        ? t('orders.noProductsMatch', { search: productSearch })
                        : t('orders.noProductsAvailable')}
                    </p>
                    {productSearch && (
                      <button
                        type="button"
                        onClick={() => setProductSearch('')}
                        class="mt-4 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {t('orders.clearSearch')}
                      </button>
                    )}
                  </div>
                ) : (
                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                    {filteredProducts.map((product) => (
                      <div
                        key={product.id}
                        class="group relative backdrop-blur-md bg-white/70 border-2 border-gray-200 rounded-xl p-4 hover:bg-white hover:shadow-sm transition-colors duration-150 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-200 cursor-pointer"
                         onClick={() => product.stock > 0 && addItemToOrder(product.id)}
                         role="button"
                         tabindex={0}
                          aria-label={`${t('orders.addProduct')} ${product.name}`}
                          onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            product.stock > 0 && addItemToOrder(product.id)
                          }
                        }}
                      >
                        {/* Glass highlight overlay */}
                        <div class="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent rounded-xl opacity-60"></div>

                        <div class="relative flex justify-between items-start">
                          <div class="flex-1">
                            <div class="font-semibold text-gray-900 mb-1 drop-shadow-sm">{product.name}</div>
                            <div class="text-sm text-gray-700 mb-3 font-medium backdrop-blur-sm bg-white/40 px-2 py-1 rounded-full w-fit">
                              {product.category}
                            </div>
                            <div class="flex items-center justify-between">
                              <div class="text-xl font-bold text-emerald-600 drop-shadow-md">
                                {formatCurrency(product.price)}
                              </div>
                              <div
                                class={`text-sm px-3 py-1.5 rounded-full font-semibold backdrop-blur-sm border transition-all ${
                                  product.stock > 10
                                    ? 'bg-emerald-100/80 text-emerald-800 border-emerald-200/50 shadow-emerald-100/50'
                                    : product.stock > 0
                                      ? 'bg-amber-100/80 text-amber-800 border-amber-200/50 shadow-amber-100/50'
                                      : 'bg-red-100/80 text-red-800 border-red-200/50 shadow-red-100/50'
                                } shadow-lg`}
                              >
                                📦 {product.stock}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Order Items */}
            {newOrder.items.length > 0 && (
              <div>
                <h3 class="text-lg font-semibold text-gray-900 mb-4">{t('orders.orderSummary')}</h3>
                <div class="backdrop-blur-lg bg-gradient-to-br from-blue-100/60 to-indigo-100/40 border border-blue-200/50 rounded-2xl p-6 space-y-4 shadow-xl">
                  {newOrder.items.map((item) => {
                    const product = products.find((p) => p.id === item.productId)
                    return product ? (
                      <div
                        key={item.productId}
                        class="relative flex justify-between items-center backdrop-blur-md bg-white/80 border border-white/50 rounded-xl p-5 shadow-lg hover:shadow-xl transition-all duration-200"
                      >
                        {/* Glass highlight overlay */}
                        <div class="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent rounded-xl opacity-70"></div>

                        <div class="relative flex-1">
                          <div class="font-semibold text-gray-900 mb-2 drop-shadow-sm">{product.name}</div>
                          <div class="text-sm text-gray-700 backdrop-blur-sm bg-white/60 px-3 py-1 rounded-full w-fit">
                            {formatCurrency(product.price)} × {item.quantity} ={' '}
                            <span class="font-bold text-emerald-600">
                              {formatCurrency(product.price * item.quantity)}
                            </span>
                          </div>
                        </div>
                        <div class="relative flex items-center space-x-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (item.quantity > 1) {
                                addItemToOrder(item.productId, -1)
                              } else {
                                removeItemFromOrder(item.productId)
                              }
                            }}
                            class="w-10 h-10 p-0 flex items-center justify-center backdrop-blur-sm bg-white/70 border-white/60 hover:bg-white/90 hover:shadow-lg transition-all duration-200 hover:scale-110"
                          >
                            <span class="drop-shadow-sm">➖</span>
                          </Button>
                          <div class="w-14 text-center font-bold text-xl backdrop-blur-sm bg-gradient-to-r from-indigo-100/80 to-blue-100/80 px-3 py-2 rounded-lg border border-white/40 shadow-md">
                            {item.quantity}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addItemToOrder(item.productId, 1)}
                            disabled={item.quantity >= product.stock}
                            class="w-10 h-10 p-0 flex items-center justify-center backdrop-blur-sm bg-white/70 border-white/60 hover:bg-white/90 hover:shadow-lg transition-all duration-200 hover:scale-110 disabled:opacity-50 disabled:hover:scale-100"
                          >
                            <span class="drop-shadow-sm">➕</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeItemFromOrder(item.productId)}
                            class="backdrop-blur-sm bg-red-100/70 text-red-700 border-red-200/60 hover:bg-red-200/80 hover:shadow-lg transition-all duration-200 hover:scale-110 ml-2"
                          >
                            <span class="drop-shadow-sm">🗑️</span>
                          </Button>
                        </div>
                      </div>
                    ) : null
                  })}

                  {/* Order Totals */}
                  <div class="border-t border-white/40 pt-4 mt-6">
                    {(() => {
                      const subtotal = newOrder.items.reduce((total, item) => {
                        const product = products.find((p) => p.id === item.productId)
                        return total + (product ? product.price * item.quantity : 0)
                      }, 0)
                      const tax = taxEnabled ? subtotal * taxRate : 0
                      const total = subtotal + tax

                      return (
                        <div
                          class={`backdrop-blur-md rounded-xl p-5 border shadow-lg ${
                            taxEnabled ? 'bg-white/60 border-white/50' : 'bg-gray-50/60 border-gray-200/50'
                          }`}
                        >
                          <div class="space-y-3">
                            <div class="flex justify-between text-gray-700 text-lg">
                              <span class="font-medium">{t('common.subtotal')}:</span>
                              <span class="font-semibold drop-shadow-sm">{formatCurrency(subtotal)}</span>
                            </div>
                            {taxEnabled && (
                              <div class="flex justify-between text-gray-700 text-lg">
                                <span class="font-medium">
                                  {t('common.tax')} ({(taxRate * 100).toFixed(1)}%):
                                </span>
                                <span class="font-semibold drop-shadow-sm">{formatCurrency(tax)}</span>
                              </div>
                            )}
                            {!taxEnabled && (
                              <div class="text-sm text-gray-500 italic text-center py-2">{t('orders.taxDisabled')}</div>
                            )}
                            <div class="border-t border-white/40 pt-3">
                              <div class="flex justify-between text-2xl font-bold text-gray-900 backdrop-blur-sm bg-gradient-to-r from-emerald-100/60 to-green-100/40 px-4 py-3 rounded-lg border border-emerald-200/50 shadow-md">
                                <span class="drop-shadow-sm">{t('common.total')}:</span>
                                <span class="drop-shadow-sm text-emerald-700">{formatCurrency(total)}</span>
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

            {/* Payment & Notes */}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    { value: 'cash', label: `💵 ${t('orders.cash')}` },
                    { value: 'card', label: `💳 ${t('orders.card')}` },
                    { value: 'transfer', label: `🔄 ${t('orders.transfer')}` },
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
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleCreateOrder} disabled={isLoading || newOrder.items.length === 0}>
            {isLoading ? t('common.loading') : t('orders.createOrder')}
          </Button>
        </DialogFooter>
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
        <DialogBody>
          <div class="space-y-6">
            {/* Available Products for Editing */}
            <div>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                <div>
                  <h3 class="text-lg font-semibold text-gray-900">{t('orders.availableProducts')}</h3>
                  <p class="text-sm text-gray-600 mt-1">{t('orders.clickToAdd')}</p>
                </div>
                <div class="flex items-center gap-3">
                  <div class="w-64">
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
                          <svg
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            role="img"
                            aria-label="Clear search"
                          >
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
                  <div class="text-sm text-gray-500">
                    {filteredEditProducts.length} {t('orders.of')} {products.length} {t('products.title').toLowerCase()}
                  </div>
                </div>
              </div>
              <div class="max-h-96 overflow-y-auto backdrop-blur-lg bg-gradient-to-br from-emerald-50/40 to-blue-50/30 border border-emerald-200/30 rounded-2xl p-6 shadow-2xl">
                {filteredEditProducts.length === 0 ? (
                  <div class="text-center py-12">
                    <div class="text-6xl mb-4">🔍</div>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">{t('orders.noProductsFound')}</h3>
                    <p class="text-gray-500">
                      {editProductSearch
                        ? t('orders.noProductsMatch', { search: editProductSearch })
                        : t('orders.noProductsAvailable')}
                    </p>
                    {editProductSearch && (
                      <button
                        type="button"
                        onClick={() => setEditProductSearch('')}
                        class="mt-4 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {t('orders.clearSearch')}
                      </button>
                    )}
                  </div>
                ) : (
                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                    {filteredEditProducts.map((product) => (
                      <div
                        key={product.id}
                        class="group relative backdrop-blur-md bg-white/70 border-2 border-gray-200 rounded-xl p-4 hover:bg-white hover:shadow-sm transition-colors duration-150 hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-200 cursor-pointer"
                          onClick={() => product.stock > 0 && addItemToEditOrder(product.id)}
                          role="button"
                          tabindex={0}
                          aria-label={`${t('orders.addProduct')} ${product.name}`}
                          onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            product.stock > 0 && addItemToEditOrder(product.id)
                          }
                        }}
                      >
                        <div class="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent rounded-xl opacity-60"></div>

                        <div class="relative flex justify-between items-start">
                          <div class="flex-1">
                            <div class="font-semibold text-gray-900 mb-1 drop-shadow-sm">{product.name}</div>
                            <div class="text-sm text-gray-700 mb-3 font-medium backdrop-blur-sm bg-white/40 px-2 py-1 rounded-full w-fit">
                              {product.category}
                            </div>
                            <div class="flex items-center justify-between">
                              <div class="text-xl font-bold text-emerald-600 drop-shadow-md">
                                {formatCurrency(product.price)}
                              </div>
                              <div
                                class={`text-sm px-3 py-1.5 rounded-full font-semibold backdrop-blur-sm border transition-all ${
                                  product.stock > 10
                                    ? 'bg-emerald-100/80 text-emerald-800 border-emerald-200/50 shadow-emerald-100/50'
                                    : product.stock > 0
                                      ? 'bg-amber-100/80 text-amber-800 border-amber-200/50 shadow-amber-100/50'
                                      : 'bg-red-100/80 text-red-800 border-red-200/50 shadow-red-100/50'
                                } shadow-lg`}
                              >
                                📦 {product.stock}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Edit Order Items */}
            {editOrderItems.length > 0 && (
              <div>
                <h3 class="text-lg font-semibold text-gray-900 mb-4">{t('orders.updatedOrderSummary')}</h3>
                <div class="backdrop-blur-lg bg-gradient-to-br from-emerald-100/60 to-green-100/40 border border-emerald-200/50 rounded-2xl p-6 space-y-4 shadow-xl">
                  {editOrderItems.map((item) => {
                    const product = products.find((p) => p.id === item.productId)
                    return product ? (
                      <div
                        key={item.productId}
                        class="relative flex justify-between items-center backdrop-blur-md bg-white/80 border border-white/50 rounded-xl p-5 shadow-lg hover:shadow-xl transition-all duration-200"
                      >
                        <div class="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent rounded-xl opacity-70"></div>

                        <div class="relative flex-1">
                          <div class="font-semibold text-gray-900 mb-2 drop-shadow-sm">{product.name}</div>
                          <div class="text-sm text-gray-700 backdrop-blur-sm bg-white/60 px-3 py-1 rounded-full w-fit">
                            {formatCurrency(product.price)} × {item.quantity} ={' '}
                            <span class="font-bold text-emerald-600">
                              {formatCurrency(product.price * item.quantity)}
                            </span>
                          </div>
                        </div>
                        <div class="relative flex items-center space-x-3">
                          {(() => {
                            const originalItem = editingOrder?.items.find(
                              (origItem) => origItem.productId === item.productId,
                            )
                            const canDecrease = item.quantity > (originalItem?.quantity || 1)

                            return (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => addItemToEditOrder(item.productId, -1)}
                                  disabled={!canDecrease}
                                  class="w-10 h-10 p-0 flex items-center justify-center backdrop-blur-sm bg-white/70 border-white/60 hover:bg-white/90 hover:shadow-lg transition-all duration-200 hover:scale-110 disabled:opacity-50 disabled:hover:scale-100"
                                >
                                  <span class="drop-shadow-sm">➖</span>
                                </Button>
                                <div class="w-14 text-center font-bold text-xl backdrop-blur-sm bg-gradient-to-r from-emerald-100/80 to-green-100/80 px-3 py-2 rounded-lg border border-white/40 shadow-md">
                                  {item.quantity}
                                  {originalItem && item.quantity > originalItem.quantity && (
                                    <div class="text-xs text-emerald-600 font-medium">
                                      +{item.quantity - originalItem.quantity}
                                    </div>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => addItemToEditOrder(item.productId, 1)}
                                  disabled={item.quantity >= product.stock}
                                  class="w-10 h-10 p-0 flex items-center justify-center backdrop-blur-sm bg-white/70 border-white/60 hover:bg-white/90 hover:shadow-lg transition-all duration-200 hover:scale-110 disabled:opacity-50 disabled:hover:scale-100"
                                >
                                  <span class="drop-shadow-sm">➕</span>
                                </Button>
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    ) : null
                  })}

                  {/* Updated Order Totals */}
                  <div class="border-t border-white/40 pt-4 mt-6">
                    {(() => {
                      const subtotal = editOrderItems.reduce((total, item) => {
                        const product = products.find((p) => p.id === item.productId)
                        return total + (product ? product.price * item.quantity : 0)
                      }, 0)
                      const tax = taxEnabled ? subtotal * taxRate : 0
                      const total = subtotal + tax

                      return (
                        <div
                          class={`backdrop-blur-md rounded-xl p-5 border shadow-lg ${
                            taxEnabled ? 'bg-white/60 border-white/50' : 'bg-gray-50/60 border-gray-200/50'
                          }`}
                        >
                          <div class="space-y-3">
                            <div class="flex justify-between text-gray-700 text-lg">
                              <span class="font-medium">{t('common.subtotal')}:</span>
                              <span class="font-semibold drop-shadow-sm">{formatCurrency(subtotal)}</span>
                            </div>
                            {taxEnabled && (
                              <div class="flex justify-between text-gray-700 text-lg">
                                <span class="font-medium">
                                  {t('common.tax')} ({(taxRate * 100).toFixed(1)}%):
                                </span>
                                <span class="font-semibold drop-shadow-sm">{formatCurrency(tax)}</span>
                              </div>
                            )}
                            {!taxEnabled && (
                              <div class="text-sm text-gray-500 italic text-center py-2">{t('orders.taxDisabled')}</div>
                            )}
                            <div class="border-t border-white/40 pt-3">
                              <div class="flex justify-between text-2xl font-bold text-gray-900 backdrop-blur-sm bg-gradient-to-r from-emerald-100/60 to-green-100/40 px-4 py-3 rounded-lg border border-emerald-200/50 shadow-md">
                                <span class="drop-shadow-sm">{t('orders.newTotal')}:</span>
                                <span class="drop-shadow-sm text-emerald-700">{formatCurrency(total)}</span>
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
                    { value: 'cash', label: `💵 ${t('orders.cash')}` },
                    { value: 'card', label: `💳 ${t('orders.card')}` },
                    { value: 'transfer', label: `🔄 ${t('orders.transfer')}` },
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
        </DialogBody>

        <DialogFooter>
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
        </DialogFooter>
      </Dialog>

      {/* Order Details Modal */}
      {selectedOrder && (
        <Dialog
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          title={t('orders.orderDetailsTitle', { id: selectedOrder.id })}
          size="lg"
        >
          <DialogBody>
            <div class="space-y-6">
              {/* Order Header */}
              <div class="flex justify-between items-start pb-4 border-b border-gray-200">
                <div>
                  <div class="flex items-center space-x-3 mb-2">
                    <div
                      class={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold uppercase tracking-wide ${getStatusColor(selectedOrder.status)} transition-all`}
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
                      <div class="flex items-center text-gray-600">
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
                  <div class="text-sm text-gray-600">
                    {t('orders.created')}: {new Date(selectedOrder.createdAt).toLocaleString()}
                  </div>
                  {selectedOrder.completedAt && (
                    <div class="text-sm text-gray-600">
                      {t('orders.completed')}: {new Date(selectedOrder.completedAt).toLocaleString()}
                    </div>
                  )}
                  {selectedOrder.userId && users[selectedOrder.userId] && (
                    <div class="text-sm text-gray-600">
                      {t('orders.createdBy')}:{' '}
                      <span class="font-medium text-gray-700">{users[selectedOrder.userId]}</span>
                    </div>
                  )}
                </div>
                <div class="text-right">
                  <div class="text-3xl font-bold text-gray-900">
                    {formatCurrency(taxEnabled ? selectedOrder.total : selectedOrder.subtotal)}
                  </div>
                  <div class="text-sm text-gray-500">{t('orders.totalAmount')}</div>
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h4 class="text-lg font-semibold text-gray-900 mb-3">{t('orders.orderItems')}</h4>
                <div class="space-y-3">
                  {selectedOrder.items.map((item, index) => (
                    <div
                      key={`${item.productId}-${index}`}
                      class="flex justify-between items-center bg-gray-50 rounded-lg p-4"
                    >
                      <div class="flex-1">
                        <div class="font-semibold text-gray-900">{item.productName}</div>
                        <div class="text-sm text-gray-600">
                          {t('orders.productId')}: {item.productId}
                        </div>
                      </div>
                      <div class="text-center mx-4">
                        <div class="font-semibold text-gray-900">×{item.quantity}</div>
                        <div class="text-sm text-gray-500">{t('common.quantity')}</div>
                      </div>
                      <div class="text-right">
                        <div class="font-semibold text-gray-900">{formatCurrency(item.unitPrice)}</div>
                        <div class="text-sm text-gray-500">{t('orders.unitPrice')}</div>
                      </div>
                      <div class="text-right ml-4 min-w-0">
                        <div class="font-bold text-lg text-gray-900">{formatCurrency(item.totalPrice)}</div>
                        <div class="text-sm text-gray-500">{t('orders.itemTotal')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Summary */}
              <div class="bg-blue-50 rounded-lg p-4">
                <h4 class="text-lg font-semibold text-gray-900 mb-3">{t('orders.orderSummary')}</h4>
                <div class="space-y-2">
                  {/* Only show subtotal and tax breakdown when tax is enabled */}
                  {taxEnabled && (
                    <>
                      <div class="flex justify-between text-gray-700">
                        <span>{t('common.subtotal')}:</span>
                        <span class="font-semibold">{formatCurrency(selectedOrder.subtotal)}</span>
                      </div>
                      {/* Only show tax line if the order actually has tax applied */}
                      {selectedOrder.tax > 0 && (
                        <div class="flex justify-between text-gray-700">
                          <span>
                            {t('common.tax')} ({((selectedOrder.tax / selectedOrder.subtotal) * 100).toFixed(1)}%):
                          </span>
                          <span class="font-semibold">{formatCurrency(selectedOrder.tax)}</span>
                        </div>
                      )}
                      <div class="border-t border-blue-200 pt-2">
                        <div class="flex justify-between text-xl font-bold text-gray-900">
                          <span>{t('common.total')}:</span>
                          <span>{formatCurrency(selectedOrder.total)}</span>
                        </div>
                      </div>
                    </>
                  )}
                  {/* When tax is disabled, only show the total */}
                  {!taxEnabled && (
                    <div class="flex justify-between text-xl font-bold text-gray-900">
                      <span>{t('common.total')}:</span>
                      <span>{formatCurrency(selectedOrder.subtotal)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div>
                  <h4 class="text-lg font-semibold text-gray-900 mb-3">{t('orders.notes')}</h4>
                  <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p class="text-gray-800">{selectedOrder.notes}</p>
                  </div>
                </div>
              )}

              {/* Order Actions */}
              <div class="border-t border-gray-200 pt-4">
                <h4 class="text-lg font-semibold text-gray-900 mb-3">{t('common.actions')}</h4>
                <div class="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleThermalPrint(selectedOrder)}
                    disabled={isPrinting}
                    class="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    🖨️ {isPrinting ? 'Printing...' : 'Print Receipt'}
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
                        ✏️ {t('orders.updateOrder')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          handleUpdateStatus(selectedOrder.id, 'paid')
                          setSelectedOrder(null)
                        }}
                        class="bg-green-600 hover:bg-green-700 text-white"
                      >
                        💰 {t('orders.markAsPaid')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          handleUpdateStatus(selectedOrder.id, 'cancelled')
                          setSelectedOrder(null)
                        }}
                        class="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        ❌ {t('orders.cancelOrder')}
                      </Button>
                    </>
                  )}
                  {selectedOrder.status === 'paid' && (
                    <Button
                      size="sm"
                      onClick={() => {
                        handleUpdateStatus(selectedOrder.id, 'completed')
                        setSelectedOrder(null)
                      }}
                      class="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      ✅ {t('orders.markComplete')}
                    </Button>
                  )}
                  {(currentUserRole === 'admin' || currentUserRole === 'manager') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDeleteConfirm(selectedOrder.id)
                        setSelectedOrder(null)
                      }}
                      class="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      🗑️ {t('orders.deleteOrder')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedOrder(null)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
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
    </Container>
  )
}
