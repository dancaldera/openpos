import { useEffect, useState } from 'preact/hooks'
import {
  Button,
  Dialog,
  DialogConfirm,
  Input,
  Pagination,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { PRODUCT_CATEGORIES, type Product, productService } from '../services/products-sqlite'

interface EditProductModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
  onSave: (product: Product) => void
}

function EditProductModal({ product, isOpen, onClose, onSave }: EditProductModalProps) {
  const { t } = useTranslation()

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0,
    cost: 0,
    stock: 0,
    category: '',
    barcode: '',
    isActive: true,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (product && isOpen) {
      setFormData({
        name: product.name,
        description: product.description,
        price: product.price,
        cost: product.cost,
        stock: product.stock,
        category: product.category,
        barcode: product.barcode || '',
        isActive: product.isActive,
      })
    } else if (isOpen) {
      setFormData({
        name: '',
        description: '',
        price: 0,
        cost: 0,
        stock: 0,
        category: '',
        barcode: '',
        isActive: true,
      })
    }
    setError('')
  }, [product, isOpen])

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      let result: { success: boolean; product?: Product; error?: string }
      if (product) {
        result = await productService.updateProduct(product.id, {
          name: formData.name,
          description: formData.description,
          price: formData.price,
          cost: formData.cost,
          stock: formData.stock,
          category: formData.category,
          barcode: formData.barcode || undefined,
          isActive: formData.isActive,
        })
      } else {
        result = await productService.createProduct({
          name: formData.name,
          description: formData.description,
          price: formData.price,
          cost: formData.cost,
          stock: formData.stock,
          category: formData.category,
          barcode: formData.barcode || undefined,
          isActive: formData.isActive,
        })
      }

      if (result.success && result.product) {
        onSave(result.product)
        onClose()
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={product ? t('products.editProduct') : t('products.addProduct')}
      size="md"
    >
      <div>
        {error && (
          <div class="bg-red-500/10 backdrop-blur-sm border border-red-400/20 text-red-700 px-4 py-3 rounded-xl mb-6">
            <div class="flex items-center">
              <span class="text-red-500 mr-2">⚠️</span>
              {error}
            </div>
          </div>
        )}

        <div class="backdrop-blur-lg bg-gradient-to-br from-indigo-50/60 to-purple-50/40 border border-indigo-200/50 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} class="space-y-6">
            <div class="grid grid-cols-2 gap-6">
              <div>
                <Input
                  label={`📦 ${t('products.productName')}`}
                  value={formData.name}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      name: (e.target as HTMLInputElement).value,
                    })
                  }
                  required
                  class="bg-white/80 text-gray-900"
                  placeholder={t('products.productName')}
                />
              </div>

              <div>
                <Select
                  label={`🏷️ ${t('products.category')}`}
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      category: (e.target as HTMLSelectElement).value,
                    })
                  }
                  required
                  placeholder={t('products.selectCategory')}
                  options={PRODUCT_CATEGORIES.map((category) => ({
                    value: category,
                    label: category,
                  }))}
                  class="bg-white/80"
                />
              </div>
            </div>

            <div>
              <Textarea
                label={`📝 ${t('products.description')}`}
                value={formData.description}
                onInput={(e) =>
                  setFormData({
                    ...formData,
                    description: (e.target as HTMLTextAreaElement).value,
                  })
                }
                rows={3}
                class="bg-white/80 text-gray-900"
                placeholder={t('products.enterDescription')}
              />
            </div>

            <div class="grid grid-cols-3 gap-4">
              <div>
                <Input
                  label={`💰 ${t('products.priceLabel')}`}
                  type="number"
                  value={formData.price.toString()}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      price: parseFloat((e.target as HTMLInputElement).value) || 0,
                    })
                  }
                  required
                  class="bg-white/80 text-gray-900"
                  placeholder="0.00"
                />
              </div>

              <div>
                <Input
                  label={`🏭 ${t('products.cost')}`}
                  type="number"
                  value={formData.cost.toString()}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      cost: parseFloat((e.target as HTMLInputElement).value) || 0,
                    })
                  }
                  required
                  class="bg-white/80 text-gray-900"
                  placeholder="0.00"
                />
              </div>

              <div>
                <Input
                  label={`📊 ${t('products.stockLabel')}`}
                  type="number"
                  value={formData.stock.toString()}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      stock: parseInt((e.target as HTMLInputElement).value, 10) || 0,
                    })
                  }
                  required
                  class="bg-white/80 text-gray-900"
                  placeholder="0"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-6">
              <div>
                <Input
                  label={`📊 ${t('products.barcodeOptional')}`}
                  value={formData.barcode}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      barcode: (e.target as HTMLInputElement).value,
                    })
                  }
                  placeholder={t('products.enterBarcode')}
                  class="bg-white/80 text-gray-900"
                />
              </div>

              <div>
                <Select
                  label={`✅ ${t('products.status')}`}
                  value={formData.isActive ? 'active' : 'inactive'}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      isActive: (e.target as HTMLSelectElement).value === 'active',
                    })
                  }
                  options={[
                    {
                      value: 'active',
                      label: `✅ ${t('products.activeStatus')}`,
                    },
                    {
                      value: 'inactive',
                      label: `⛔ ${t('products.inactiveStatus')}`,
                    },
                  ]}
                  class="bg-white/80"
                />
              </div>
            </div>

            {/* Profit Margin Preview */}
            {formData.price > 0 && formData.cost > 0 && (
              <div class="backdrop-blur-md bg-emerald-100/60 rounded-xl p-4 border border-emerald-200/50 shadow-md">
                <div class="flex justify-between items-center">
                  <span class="font-semibold text-emerald-800">{t('products.profitMarginLabel')}</span>
                  <span class="text-xl font-bold text-emerald-600">
                    {(((formData.price - formData.cost) / formData.cost) * 100).toFixed(1)}%
                  </span>
                </div>
                <div class="text-sm text-emerald-700 mt-1">
                  {t('products.profitPerUnit', { amount: `$${(formData.price - formData.cost).toFixed(2)}` })}
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      <div class="flex justify-end gap-3 pt-6 border-t border-gray-200">
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          {t('common.cancel')}
        </Button>
        <Button type="button" onClick={() => handleSubmit(new Event('submit'))} disabled={isLoading}>
          {isLoading ? t('common.loading') : product ? t('common.edit') : t('common.add')}
        </Button>
      </div>
    </Dialog>
  )
}

export default function Products() {
  const { t } = useTranslation()

  const [products, setProducts] = useState<Product[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [pageSize] = useState(10)

  const { user: currentUser, hasRole, hasPermission } = useAuth()

  const canManageProducts = currentUser && (hasRole('admin') || hasRole('manager') || hasPermission('products.view'))

  useEffect(() => {
    loadProducts()
  }, [])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    if (searchQuery.trim()) {
      handleSearch(searchQuery, page)
    } else {
      loadProducts(page)
    }
  }

  const loadProducts = async (page: number = 1) => {
    if (!canManageProducts) {
      setError(t('errors.unauthorized'))
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      const [paginatedResult, allProductsList] = await Promise.all([
        productService.getProductsPaginated(page, pageSize),
        productService.getProducts(), // For total count and filtering
      ])

      setProducts(paginatedResult.products)
      setAllProducts(allProductsList)
      setTotalCount(paginatedResult.totalCount)
      setTotalPages(paginatedResult.totalPages)
      setCurrentPage(paginatedResult.currentPage)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('errors.generic')
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = async (query: string, page: number = 1) => {
    setSearchQuery(query)
    if (query.trim() === '') {
      await loadProducts(page)
      return
    }

    try {
      setIsLoading(true)
      const searchResults = await productService.searchProductsPaginated(query, page, pageSize)
      setProducts(searchResults.products)
      setTotalCount(searchResults.totalCount)
      setTotalPages(searchResults.totalPages)
      setCurrentPage(searchResults.currentPage)
    } catch (_err) {
      setError(t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateProduct = () => {
    setEditingProduct(null)
    setIsModalOpen(true)
  }

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product)
    setIsModalOpen(true)
  }

  const handleDeleteProduct = async (productId: string) => {
    try {
      const result = await productService.deleteProduct(productId)
      if (result.success) {
        setAllProducts(allProducts.filter((p) => p.id !== productId))
        setProducts(products.filter((p) => p.id !== productId))
        setDeleteConfirm(null)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    }
  }

  const handleSaveProduct = async (_savedProduct: Product) => {
    // Reload data to reflect changes with proper pagination
    if (searchQuery.trim()) {
      await handleSearch(searchQuery, currentPage)
    } else {
      await loadProducts(currentPage)
    }
    setIsModalOpen(false)
  }

  const getStockColor = (stock: number) => {
    if (stock === 0) return 'bg-gradient-to-r from-red-100 to-red-200 text-red-800 border border-red-300'
    if (stock < 10) return 'bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 border border-yellow-300'
    return 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border border-green-300'
  }

  const getStatusColor = (isActive: boolean) => {
    return isActive
      ? 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border border-green-300 shadow-sm'
      : 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 border border-gray-300 shadow-sm'
  }

  const getStockIcon = (stock: number) => {
    if (stock === 0) return '❌'
    if (stock < 10) return '⚠️'
    return '✅'
  }

  const getCategoryIcon = (category: string) => {
    const icons: { [key: string]: string } = {
      Beverages: '🥤',
      Bakery: '🍞',
      'Coffee & Tea': '☕',
      Dairy: '🥛',
      Snacks: '🍫',
      Seafood: '🐟',
      'Frozen Foods': '🧊',
      'Fresh Produce': '🍎',
      'Household Items': '🧽',
      'Personal Care': '🧴',
    }
    return icons[category] || '📦'
  }

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`
  }

  if (!canManageProducts) {
    return (
      <div class="max-w-6xl mx-auto">
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div class="text-center">
            <div class="text-6xl mb-6 drop-shadow-lg">🔒</div>
            <h3 class="text-2xl font-bold text-gray-900 mb-3">{t('products.accessDenied')}</h3>
            <p class="text-gray-600 max-w-md mx-auto">{t('products.noPermission')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div class="max-w-6xl mx-auto">
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div class="text-center">
            <div class="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full animate-spin border-4 border-transparent border-t-white mx-auto mb-6 shadow-lg"></div>
            <p class="text-gray-600 text-lg">{t('products.loadingCatalog')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="max-w-6xl mx-auto">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">{t('products.title')}</h1>
          <p class="text-gray-600">
            {totalCount} {t('products.productsTotal')}
            {totalPages > 1 && ` • ${t('products.pageXofY', { current: currentPage, total: totalPages })}`}
            {searchQuery && ` • ${t('products.searchingFor')} "${searchQuery}"`}
          </p>
        </div>
        {(hasPermission('products.create') || hasRole('admin') || hasRole('manager')) && (
          <Button onClick={handleCreateProduct}>
            <span class="mr-2">➕</span>
            {t('products.addProduct')}
          </Button>
        )}
      </div>

      <div class="mb-6">
        <Input
          type="search"
          placeholder={t('products.searchProducts')}
          value={searchQuery}
          onInput={(e) => {
            setCurrentPage(1)
            handleSearch((e.target as HTMLInputElement).value, 1)
          }}
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
            searchQuery ? (
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" role="img" aria-label="Clear search">
                <title>Clear search</title>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : undefined
          }
          onRightIconClick={
            searchQuery
              ? () => {
                  setCurrentPage(1)
                  handleSearch('', 1)
                }
              : undefined
          }
          class="w-full bg-white text-gray-900 placeholder-gray-500"
        />
      </div>

      {error && (
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 backdrop-blur-sm">
          <div class="flex items-center">
            <span class="text-red-500 mr-2">⚠️</span>
            {error}
          </div>
        </div>
      )}

      <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <Table>
          <TableHead>
            <TableRow class="bg-gray-50">
              <TableHeader class="font-semibold text-gray-900">{t('common.name')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('products.category')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('common.price')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('products.costPrice')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('products.stock')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('common.status')}</TableHeader>
              <TableHeader class="font-semibold text-gray-900">{t('common.actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {products.map((product, index) => (
              <TableRow
                key={product.id}
                class="hover:bg-gray-50 transition-all duration-200 hover:shadow-sm"
                style={`animation-delay: ${index * 50}ms`}
              >
                <TableCell>
                  <div class="flex items-start">
                    <div class="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-lg font-bold mr-3 shadow-md">
                      {getCategoryIcon(product.category)}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="font-semibold text-gray-900 truncate">{product.name}</div>
                      {product.description && (
                        <div class="text-sm text-gray-600 truncate max-w-xs mt-1">{product.description}</div>
                      )}
                      {product.barcode && (
                        <div class="text-xs text-gray-500 mt-1 font-mono bg-gray-100 px-2 py-1 rounded w-fit">
                          📊 {product.barcode}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="inline-flex items-center px-3 py-2 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-100 to-indigo-200 text-blue-800 border border-blue-300 shadow-sm">
                    <span class="mr-1">{getCategoryIcon(product.category)}</span>
                    {product.category}
                  </div>
                </TableCell>
                <TableCell>
                  <div class="text-lg font-bold text-emerald-600 drop-shadow-sm">{formatCurrency(product.price)}</div>
                </TableCell>
                <TableCell>
                  <div class="text-gray-600 font-medium">{formatCurrency(product.cost)}</div>
                  <div class="text-xs text-gray-500">
                    {t('products.profitMargin')}: {(((product.price - product.cost) / product.cost) * 100).toFixed(1)}%
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    class={`inline-flex items-center px-3 py-2 rounded-full text-xs font-semibold transition-all hover:scale-105 ${getStockColor(product.stock)} shadow-sm`}
                  >
                    <span class="mr-1">{getStockIcon(product.stock)}</span>
                    {product.stock} {t('common.quantity').toLowerCase()}
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    class={`inline-flex items-center px-3 py-2 rounded-full text-xs font-semibold uppercase tracking-wide ${getStatusColor(product.isActive)} transition-all hover:scale-105`}
                  >
                    <span class="mr-1">{product.isActive ? '✅' : '⛔'}</span>
                    {product.isActive ? t('members.active') : t('members.inactive')}
                  </div>
                </TableCell>
                <TableCell>
                  <div class="flex space-x-2">
                    {(hasPermission('products.edit') || hasRole('admin') || hasRole('manager')) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditProduct(product)}
                        class="text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300 transition-all hover:shadow-md mr-2"
                      >
                        ✏️ {t('common.edit')}
                      </Button>
                    )}
                    {(hasPermission('products.delete') || hasRole('admin') || hasRole('manager')) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeleteConfirm(product.id)}
                        class="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 transition-all hover:shadow-md"
                      >
                        🗑️ {t('common.delete')}
                      </Button>
                    )}
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

      {products.length === 0 && (
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div class="text-center">
            <div class="text-6xl mb-6">{searchQuery ? '🔍' : '📦'}</div>
            <h3 class="text-2xl font-bold text-gray-900 mb-3">
              {searchQuery ? t('products.noProducts') : t('products.noProducts')}
            </h3>
            <p class="text-gray-600 mb-6 max-w-md mx-auto">
              {searchQuery
                ? t('products.noProductsSearch', { query: searchQuery })
                : t('products.emptyProductsCatalog')}
            </p>
            {!searchQuery && (hasPermission('products.create') || hasRole('admin') || hasRole('manager')) && (
              <Button onClick={handleCreateProduct} class="mt-4">
                <span class="mr-2">➕</span>
                {t('products.addFirstProduct')}
              </Button>
            )}
          </div>
        </div>
      )}

      <EditProductModal
        product={editingProduct}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProduct}
      />

      <DialogConfirm
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteProduct(deleteConfirm)}
        title={t('products.deleteConfirm')}
        message={t('products.deleteMessage')}
        confirmText={t('common.delete')}
        variant="danger"
      />
    </div>
  )
}
