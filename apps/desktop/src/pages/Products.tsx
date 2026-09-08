import { useEffect, useRef, useState } from 'preact/hooks'
import { toast } from 'sonner'
import {
  Button,
  DialogConfirm,
  Dropdown,
  Input,
  PageLoader,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui'
import {
  EditVariantModal,
  ProductVariantRow,
  VariantGenerator,
  VariantSettingsModal,
} from '../components/VariantManagement'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { deleteProductImage, resolveProductImageUrls } from '../services/product-images'
import { type ProductVariant, productVariantsService } from '../services/product-variants-turso'
import { type Product, type ProductWithVariants, productService } from '../services/products-turso'
import { ProductFormPage } from './ProductFormPage'

type TranslateFunction = (key: string, params?: Record<string, string | number | boolean>) => string

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

const getCategoryLabel = (category: string, t: TranslateFunction): string => {
  const key = category.replace(/[^a-zA-Z0-9]/g, '').replace(/^([A-Z])/, (m) => m.toLowerCase())
  const translated = t(`categories.${key}`)
  return translated === `categories.${key}` ? category : translated
}

export default function Products() {
  const { t } = useTranslation()
  const panelClass = 'rounded-cards border border-fog-border bg-canvas '

  const [products, setProducts] = useState<Product[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [productsWithVariants, setProductsWithVariants] = useState<Record<string, ProductWithVariants>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const [error, setError] = useState('')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formProduct, setFormProduct] = useState<Product | null>(null)
  const [view, setView] = useState<'list' | 'form'>('list')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [pageSize] = useState(10)
  const [resolvedImageUrls, setResolvedImageUrls] = useState<Record<string, string>>({})

  // Variant state
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set())
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null)
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false)
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false)
  const [isVariantSettingsOpen, setIsVariantSettingsOpen] = useState(false)

  const { user: currentUser, hasRole, hasPermission } = useAuth()

  const canManageProducts = currentUser && (hasRole('admin') || hasRole('manager') || hasPermission('products.view'))

  useEffect(() => {
    loadProducts()
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

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
      console.error('Failed to resolve product image URLs:', err)
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    if (searchQuery.trim()) {
      performSearch(searchQuery, page)
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
      void syncResolvedImageUrls(paginatedResult.products)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('errors.generic')
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const performSearch = async (query: string, page: number) => {
    try {
      setIsSearching(true)
      setError('')
      const searchResults = await productService.searchProductsPaginated(query, page, pageSize)
      setProducts(searchResults.products)
      setTotalCount(searchResults.totalCount)
      setTotalPages(searchResults.totalPages)
      setCurrentPage(searchResults.currentPage)
      void syncResolvedImageUrls(searchResults.products)
    } catch (_err) {
      setError(t('errors.generic'))
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearchInput = (e: Event) => {
    const query = (e.target as HTMLInputElement).value
    setSearchQuery(query)
    setCurrentPage(1)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (query.trim() === '') {
      loadProducts(1)
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query, 1)
    }, 300)
  }

  const handleCreateProduct = () => {
    setFormProduct(null)
    setView('form')
  }

  const handleEditProduct = (product: Product) => {
    setFormProduct(product)
    setView('form')
  }

  const handleCloseProductForm = () => {
    setView('list')
    setFormProduct(null)
  }

  const handleDeleteProduct = async (productId: string) => {
    try {
      const productToDelete =
        allProducts.find((p) => p.id === productId) || products.find((p) => p.id === productId) || null
      const result = await productService.deleteProduct(productId)
      if (result.success) {
        if (productToDelete?.image) {
          try {
            await deleteProductImage(productToDelete.image)
          } catch (deleteError) {
            console.error('Failed to delete product image after deleting product:', deleteError)
            setError(t('products.imageDeleteOnProductDeleteFailed'))
          }
        }
        setAllProducts(allProducts.filter((p) => p.id !== productId))
        setProducts(products.filter((p) => p.id !== productId))
        setResolvedImageUrls((prev) => {
          if (!productToDelete?.image) {
            return prev
          }

          const next = { ...prev }
          delete next[productToDelete.image]
          return next
        })
        setDeleteConfirm(null)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    }
  }

  const handleSaveProduct = async (_savedProduct: Product, options?: { warning?: string }) => {
    const wasEditing = Boolean(formProduct)
    if (searchQuery.trim()) {
      await performSearch(searchQuery, currentPage)
    } else {
      await loadProducts(currentPage)
    }
    if (options?.warning) {
      setError(options.warning)
      toast.warning(options.warning)
    } else {
      toast.success(wasEditing ? t('products.productUpdated') : t('products.productAdded'))
    }
    handleCloseProductForm()
  }

  // Variant handlers
  const handleToggleExpand = async (productId: string) => {
    const newExpanded = new Set(expandedProductIds)
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId)
    } else {
      newExpanded.add(productId)
      // Load variants for this product if not already loaded
      if (!productsWithVariants[productId]) {
        try {
          const productWithVariants = await productService.getProductWithVariants(productId)
          if (productWithVariants) {
            setProductsWithVariants((prev) => ({
              ...prev,
              [productId]: productWithVariants,
            }))
          }
        } catch (err) {
          console.error('Failed to load variants:', err)
        }
      }
    }
    setExpandedProductIds(newExpanded)
  }

  const handleEditVariant = (variant: ProductVariant) => {
    const parent =
      products.find((item) => item.id === variant.parentProductId) ||
      allProducts.find((item) => item.id === variant.parentProductId) ||
      null
    if (parent) {
      setEditingProduct(parent)
    }
    setEditingVariant(variant)
    setIsVariantModalOpen(true)
  }

  const handleDeleteVariant = async (variantId: string) => {
    try {
      const result = await productVariantsService.deleteVariant(variantId)
      if (result.success) {
        // Reload variants for affected products
        const updated = { ...productsWithVariants }
        for (const productId in updated) {
          if (updated[productId].variants) {
            updated[productId].variants = updated[productId].variants?.filter((v) => v.id !== variantId)
          }
        }
        setProductsWithVariants(updated)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    }
  }

  const handleSaveVariant = async (variant: ProductVariant) => {
    // Reload variants for the product
    const productId = variant.parentProductId
    try {
      const productWithVariants = await productService.getProductWithVariants(productId)
      if (productWithVariants) {
        setProductsWithVariants((prev) => ({
          ...prev,
          [productId]: productWithVariants,
        }))
      }
    } catch (err) {
      console.error('Failed to reload variants:', err)
    }
    setIsVariantModalOpen(false)
    setEditingVariant(null)
  }

  const handleGenerateVariants = (productId: string) => {
    const parent =
      products.find((item) => item.id === productId) || allProducts.find((item) => item.id === productId) || null
    if (parent) {
      setEditingProduct(parent)
    }
    setIsGeneratorOpen(true)
  }

  const handleVariantsGenerated = async (variants: ProductVariant[]) => {
    // Reload the product with variants
    try {
      const productWithVariants = await productService.getProductWithVariants(variants[0]?.parentProductId || '')
      if (productWithVariants?.variants) {
        setProductsWithVariants((prev) => ({
          ...prev,
          [variants[0].parentProductId]: productWithVariants,
        }))
      }
    } catch (err) {
      console.error('Failed to reload variants:', err)
    }
  }

  const handleEnableVariants = (product: Product) => {
    setEditingProduct(product)
    setIsVariantSettingsOpen(true)
  }

  const handleDisableVariants = async (product: Product) => {
    try {
      const result = await productService.convertToSimple(product.id)
      if (result.success) {
        // Reload products
        if (searchQuery.trim()) {
          await performSearch(searchQuery, currentPage)
        } else {
          await loadProducts(currentPage)
        }
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (_err) {
      setError(t('errors.generic'))
    }
  }

  const getStockColor = (stock: number) => {
    if (stock === 0) {
      return 'border border-fog-border bg-chalk text-void '
    }
    if (stock < 10) {
      return 'border border-fog-border bg-chalk text-void '
    }
    return 'border border-fog-border bg-chalk text-void '
  }

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'border border-fog-border bg-chalk text-void ' : 'border border-fog-border bg-chalk text-void '
  }

  const getStockIcon = (stock: number) => {
    if (stock === 0) return '❌'
    if (stock < 10) return '⚠️'
    return '✅'
  }

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`
  }

  if (!canManageProducts) {
    return (
      <div class="max-w-6xl mx-auto">
        <div class={`${panelClass} p-12`}>
          <div class="text-center">
            <div class="text-6xl mb-6 drop-shadow-sm">🔒</div>
            <h3 class="mb-3 text-2xl font-bold text-void ">{t('products.accessDenied')}</h3>
            <p class="mx-auto max-w-md text-graphite ">{t('products.noPermission')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading && products.length === 0 && view === 'list') {
    return <PageLoader message={t('products.loadingCatalog')} />
  }

  if (view === 'form') {
    return (
      <ProductFormPage
        product={formProduct}
        resolvedImageUrl={formProduct?.image ? resolvedImageUrls[formProduct.image] : undefined}
        onBack={handleCloseProductForm}
        onSaved={handleSaveProduct}
      />
    )
  }

  return (
    <div class="max-w-6xl mx-auto">
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <p class="text-sm text-graphite ">
          {totalCount} {t('products.productsTotal')}
          {totalPages > 1 && ` • ${t('products.pageXofY', { current: currentPage, total: totalPages })}`}
          {searchQuery && ` • ${t('products.searchingFor')} "${searchQuery}"`}
        </p>
        {(hasPermission('products.create') || hasRole('admin') || hasRole('manager')) && (
          <Button class="w-full sm:w-auto" onClick={handleCreateProduct}>
            {t('products.addProduct')}
          </Button>
        )}
      </div>

      <div class="mb-6">
        <Input
          type="search"
          placeholder={t('products.searchProducts')}
          value={searchQuery}
          onInput={handleSearchInput}
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
            isSearching ? (
              <svg class="animate-spin" fill="none" viewBox="0 0 24 24" role="img" aria-label="Searching">
                <title>Searching</title>
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : searchQuery ? (
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" role="img" aria-label="Clear search">
                <title>Clear search</title>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : undefined
          }
          onRightIconClick={
            searchQuery
              ? () => {
                  setSearchQuery('')
                  setCurrentPage(1)
                  if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
                  loadProducts(1)
                }
              : undefined
          }
          class="w-full"
        />
      </div>

      {error && (
        <div class="mb-6 rounded-cards border border-fog-border bg-chalk px-4 py-3 text-void ">
          <div class="flex items-center">
            <span class="text-void mr-2">⚠️</span>
            {error}
          </div>
        </div>
      )}

      <div class={`${panelClass} overflow-hidden`}>
        <Table dense striped>
          <TableHead>
            <TableRow class="bg-chalk ">
              <TableHeader class="py-2 font-semibold">{t('common.name')}</TableHeader>
              <TableHeader class="py-2 font-semibold">{t('products.category')}</TableHeader>
              <TableHeader class="py-2 font-semibold">{t('common.price')}</TableHeader>
              <TableHeader class="py-2 font-semibold">{t('products.costPrice')}</TableHeader>
              <TableHeader class="py-2 font-semibold">{t('products.stock')}</TableHeader>
              <TableHeader class="py-2 font-semibold">{t('common.status')}</TableHeader>
              <TableHeader class="py-2 font-semibold">{t('common.actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {products.map((product, index) => {
              const productWithVariants = productsWithVariants[product.id]
              const isConfigurable = product.variantType === 'configurable'
              const isExpanded = expandedProductIds.has(product.id)
              const variantCount = productWithVariants?.variantCount || 0
              const canManageProduct = hasPermission('products.edit') || hasRole('admin') || hasRole('manager')
              const canDeleteProduct = hasPermission('products.delete') || hasRole('admin') || hasRole('manager')
              const actionItems = []

              if (canManageProduct) {
                actionItems.push({
                  id: `${product.id}-edit`,
                  label: t('common.edit'),
                  onClick: () => handleEditProduct(product),
                })
              }

              if (!isConfigurable && canManageProduct) {
                actionItems.push({
                  id: `${product.id}-enable-variants`,
                  label: t('variants.enableVariants'),
                  onClick: () => handleEnableVariants(product),
                })
              }

              if (isConfigurable) {
                actionItems.push({
                  id: `${product.id}-generate-variants`,
                  label: t('variants.generateVariants'),
                  onClick: () => handleGenerateVariants(product.id),
                })
                actionItems.push({
                  id: `${product.id}-disable-variants`,
                  label: t('variants.disableVariants'),
                  onClick: () => handleDisableVariants(product),
                })
              }

              if (canDeleteProduct) {
                actionItems.push({
                  id: `${product.id}-delete`,
                  label: t('common.delete'),
                  onClick: () => setDeleteConfirm(product.id),
                  variant: 'danger' as const,
                })
              }

              return (
                <>
                  <TableRow key={product.id} style={`animation-delay: ${index * 50}ms`}>
                    <TableCell>
                      <div class="flex items-start gap-2.5">
                        <div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-cards bg-chalk text-sm text-void">
                          {product.image && resolvedImageUrls[product.image] ? (
                            <img
                              src={resolvedImageUrls[product.image]}
                              alt={product.name}
                              class="h-full w-full object-cover"
                            />
                          ) : (
                            getCategoryIcon(product.category)
                          )}
                        </div>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-1.5">
                            <span class="truncate font-semibold text-void ">{product.name}</span>
                            {isConfigurable && (
                              <button
                                type="button"
                                onClick={() => handleToggleExpand(product.id)}
                                class="inline-flex items-center gap-1 rounded-full border border-fog-border bg-chalk px-2 py-0.5 text-[11px] font-medium text-void transition-colors hover:bg-chalk "
                              >
                                🏷️ {variantCount} {t('variants.variants')}
                                <span class={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                  ▼
                                </span>
                              </button>
                            )}
                          </div>
                          {product.description && (
                            <div class="mt-0.5 max-w-xs truncate text-xs text-graphite ">{product.description}</div>
                          )}
                          {product.barcode && (
                            <div class="mt-1 inline-flex w-fit items-center rounded-cards bg-chalk px-1.5 py-0.5 font-mono text-[11px] text-graphite ">
                              📊 {product.barcode}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div class="inline-flex items-center rounded-full border border-fog-border bg-chalk px-2 py-1 text-[11px] font-semibold text-void ">
                        <span class="mr-1">{getCategoryIcon(product.category)}</span>
                        {getCategoryLabel(product.category, t)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {productWithVariants?.minPrice !== undefined && productWithVariants?.maxPrice !== undefined ? (
                        <div class="space-y-0.5">
                          <div class="text-base font-bold text-void ">
                            {formatCurrency(productWithVariants.minPrice)}
                          </div>
                          {productWithVariants.minPrice !== productWithVariants.maxPrice && (
                            <div class="text-[11px] leading-tight text-graphite ">
                              {t('variants.priceRange', {
                                min: formatCurrency(productWithVariants.minPrice),
                                max: formatCurrency(productWithVariants.maxPrice),
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div class="text-base font-bold text-void ">{formatCurrency(product.price)}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div class="text-sm font-medium text-void ">{formatCurrency(product.cost)}</div>
                      <div class="mt-0.5 text-[11px] leading-tight text-graphite ">
                        {t('products.profitMargin')}:{' '}
                        {(((product.price - product.cost) / product.cost) * 100).toFixed(1)}%
                      </div>
                    </TableCell>
                    <TableCell>
                      {productWithVariants?.totalStock !== undefined ? (
                        <div
                          class={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${getStockColor(productWithVariants.totalStock)}`}
                        >
                          <span class="mr-1">{getStockIcon(productWithVariants.totalStock)}</span>
                          {productWithVariants.totalStock} {t('common.quantity').toLowerCase()}
                        </div>
                      ) : (
                        <div
                          class={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${getStockColor(product.stock)}`}
                        >
                          <span class="mr-1">{getStockIcon(product.stock)}</span>
                          {product.stock} {t('common.quantity').toLowerCase()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div
                        class={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${getStatusColor(product.isActive)}`}
                      >
                        <span class="mr-1">{product.isActive ? '✅' : '⛔'}</span>
                        {product.isActive ? t('members.active') : t('members.inactive')}
                      </div>
                    </TableCell>
                    <TableCell>
                      {actionItems.length > 0 && (
                        <div class="flex justify-center">
                          <Dropdown
                            align="right"
                            items={actionItems}
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
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Expandable variants row */}
                  {isExpanded && productWithVariants?.variants && (
                    <TableRow key={`${product.id}-variants`} class="bg-chalk ">
                      <TableCell colSpan={7} class="px-4 py-3">
                        <div class="space-y-2">
                          <div class="flex items-center justify-between">
                            <h4 class="font-semibold text-void ">{t('variants.variants')}</h4>
                            <div class="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingProduct(product)
                                  setEditingVariant(null)
                                  setIsVariantModalOpen(true)
                                }}
                              >
                                {t('variants.addVariant')}
                              </Button>
                            </div>
                          </div>
                          {productWithVariants.variants.length === 0 ? (
                            <div class="rounded-cards bg-canvas py-8 text-center ">
                              <div class="text-4xl mb-2">📦</div>
                              <p class="text-graphite ">{t('variants.noVariants')}</p>
                            </div>
                          ) : (
                            <div class="space-y-2">
                              {productWithVariants.variants.map((variant) => (
                                <ProductVariantRow
                                  key={variant.id}
                                  variant={variant}
                                  onEdit={handleEditVariant}
                                  onDelete={handleDeleteVariant}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )
            })}
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
        <div class={`${panelClass} p-12`}>
          <div class="text-center">
            <div class="text-6xl mb-6">{searchQuery ? '🔍' : '📦'}</div>
            <h3 class="mb-3 text-2xl font-bold text-void ">
              {searchQuery ? t('products.noProducts') : t('products.noProducts')}
            </h3>
            <p class="mx-auto mb-6 max-w-md text-graphite ">
              {searchQuery
                ? t('products.noProductsSearch', { query: searchQuery })
                : t('products.emptyProductsCatalog')}
            </p>
            {!searchQuery && (hasPermission('products.create') || hasRole('admin') || hasRole('manager')) && (
              <Button onClick={handleCreateProduct} class="mt-4">
                {t('products.addFirstProduct')}
              </Button>
            )}
          </div>
        </div>
      )}

      <DialogConfirm
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteProduct(deleteConfirm)}
        title={t('products.deleteConfirm')}
        message={t('products.deleteMessage')}
        confirmText={t('common.delete')}
        variant="danger"
      />

      {/* Variant Modals */}
      {editingProduct && (
        <>
          <EditVariantModal
            variant={editingVariant}
            productId={editingProduct.id}
            isOpen={isVariantModalOpen}
            onClose={() => {
              setIsVariantModalOpen(false)
              setEditingVariant(null)
            }}
            onSave={handleSaveVariant}
          />
          <VariantGenerator
            productId={editingProduct.id}
            isOpen={isGeneratorOpen}
            onClose={() => setIsGeneratorOpen(false)}
            onGenerated={handleVariantsGenerated}
          />
          <VariantSettingsModal
            productId={editingProduct.id}
            isOpen={isVariantSettingsOpen}
            onClose={() => setIsVariantSettingsOpen(false)}
            onSaved={async () => {
              // Reload products
              if (searchQuery.trim()) {
                await performSearch(searchQuery, currentPage)
              } else {
                await loadProducts(currentPage)
              }
            }}
          />
        </>
      )}
    </div>
  )
}
