import { useEffect, useRef, useState } from 'preact/hooks'
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
  Textarea,
} from '../components/ui'
import {
  EditVariantModal,
  ProductVariantRow,
  VariantGenerator,
  VariantSettingsModal,
} from '../components/VariantManagement'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { normalizeBarcode } from '../lib/barcodes'
import {
  DESKTOP_REMOTE_SESSION_UNAVAILABLE_MESSAGE,
  deleteProductImage,
  extractDesktopApiConfigPath,
  extractDesktopRemoteSessionDetails,
  resolveProductImageUrls,
  uploadProductImage,
  validateProductImageFile,
} from '../services/product-images'
import { type ProductVariant, productVariantsService } from '../services/product-variants-turso'
import { PRODUCT_CATEGORIES, type Product, type ProductWithVariants, productService } from '../services/products-turso'

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

const getCategoryOptions = (t: TranslateFunction) =>
  PRODUCT_CATEGORIES.map((category) => ({
    value: category,
    label: `${getCategoryIcon(category)} ${getCategoryLabel(category, t)}`,
  }))

interface EditProductModalProps {
  product: Product | null
  isOpen: boolean
  resolvedImageUrl?: string
  onClose: () => void
  onSave: (product: Product, options?: { warning?: string }) => void
}

function getErrorMessage(message: string, t: TranslateFunction): string {
  const configPath = extractDesktopApiConfigPath(message)
  if (configPath) {
    return t('errors.desktopApiNotConfigured', { path: configPath })
  }

  const remoteSessionDetails = extractDesktopRemoteSessionDetails(message)
  if (remoteSessionDetails) {
    return t('errors.remoteSessionUnavailableWithDetails', { details: remoteSessionDetails })
  }

  if (message === DESKTOP_REMOTE_SESSION_UNAVAILABLE_MESSAGE || message === 'No auth token available for API call') {
    return t('errors.remoteSessionUnavailable')
  }

  if (message === 'Failed to upload product image.') {
    return t('products.imageUploadFailed')
  }

  if (message === 'Unsupported image type. Allowed types: JPEG, PNG, WEBP.') {
    return t('products.invalidImageType')
  }

  if (message === 'Image exceeds maximum size of 5 MB.') {
    return t('products.imageTooLarge')
  }

  return message || t('errors.generic')
}

function EditProductModal({ product, isOpen, resolvedImageUrl, onClose, onSave }: EditProductModalProps) {
  const { t } = useTranslation()
  const panelClass = 'rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900'

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0,
    cost: 0,
    stock: 0,
    category: '',
    barcode: '',
    image: '',
    isActive: true,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [temporaryPreviewUrl, setTemporaryPreviewUrl] = useState<string | null>(null)
  const [removeExistingImage, setRemoveExistingImage] = useState(false)

  const clearTemporaryPreview = () => {
    if (temporaryPreviewUrl) {
      URL.revokeObjectURL(temporaryPreviewUrl)
      setTemporaryPreviewUrl(null)
    }
  }

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
        image: product.image || '',
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
        image: '',
        isActive: true,
      })
    }
    clearTemporaryPreview()
    setSelectedImageFile(null)
    setImagePreviewUrl(resolvedImageUrl || '')
    setRemoveExistingImage(false)
    setError('')
  }, [product, isOpen, resolvedImageUrl])

  useEffect(() => {
    if (!isOpen || selectedImageFile || !product?.image || resolvedImageUrl || removeExistingImage) {
      return
    }

    let isCancelled = false

    void (async () => {
      try {
        const urls = await resolveProductImageUrls([product.image || ''])
        if (!isCancelled && product.image && urls[product.image]) {
          setImagePreviewUrl(urls[product.image])
        }
      } catch (err) {
        console.error('Failed to resolve product image preview:', err)
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [isOpen, product, removeExistingImage, resolvedImageUrl, selectedImageFile])

  useEffect(
    () => () => {
      if (temporaryPreviewUrl) {
        URL.revokeObjectURL(temporaryPreviewUrl)
      }
    },
    [temporaryPreviewUrl],
  )

  const handleImageSelection = (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]

    if (!file) {
      return
    }

    const validationError = validateProductImageFile(file)
    if (validationError) {
      setError(getErrorMessage(validationError, t))
      input.value = ''
      return
    }

    clearTemporaryPreview()
    const nextPreviewUrl = URL.createObjectURL(file)
    setTemporaryPreviewUrl(nextPreviewUrl)
    setSelectedImageFile(file)
    setImagePreviewUrl(nextPreviewUrl)
    setRemoveExistingImage(false)
    setError('')
    input.value = ''
  }

  const handleRemoveImage = () => {
    clearTemporaryPreview()
    setSelectedImageFile(null)
    setImagePreviewUrl('')
    setRemoveExistingImage(Boolean(product?.image))
    setFormData({
      ...formData,
      image: '',
    })
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const previousImageKey = product?.image?.trim() || ''
      let uploadedImageKey: string | undefined
      let nextImageKey = previousImageKey

      if (selectedImageFile) {
        const uploaded = await uploadProductImage(selectedImageFile)
        uploadedImageKey = uploaded.key
        nextImageKey = uploaded.key
        setImagePreviewUrl(uploaded.url)
      } else if (removeExistingImage) {
        nextImageKey = ''
      }

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
          image: selectedImageFile || removeExistingImage ? nextImageKey : undefined,
          isActive: formData.isActive,
          variantType: product.variantType,
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
          image: nextImageKey || undefined,
          isActive: formData.isActive,
          variantType: 'simple',
        })
      }

      if (result.success && result.product) {
        let warning: string | undefined
        const shouldDeletePreviousImage =
          Boolean(previousImageKey) &&
          ((Boolean(uploadedImageKey) && previousImageKey !== uploadedImageKey) || removeExistingImage)

        if (shouldDeletePreviousImage && previousImageKey) {
          try {
            await deleteProductImage(previousImageKey)
          } catch (deleteError) {
            console.error('Failed to delete previous product image:', deleteError)
            warning = removeExistingImage ? t('products.imageDeleteOnRemoveFailed') : t('products.imageDeleteFailed')
          }
        }

        onSave(result.product, { warning })
        onClose()
      } else {
        if (uploadedImageKey) {
          try {
            await deleteProductImage(uploadedImageKey)
          } catch (cleanupError) {
            console.error('Failed to clean up uploaded image after product save failure:', cleanupError)
          }
        }
        setError(result.error || t('errors.generic'))
      }
    } catch (err) {
      setError(getErrorMessage(err instanceof Error ? err.message : t('errors.generic'), t))
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
          <div class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            <div class="flex items-center">
              <span class="text-red-500 mr-2">⚠️</span>
              {error}
            </div>
          </div>
        )}

        <div class={panelClass}>
          <form onSubmit={handleSubmit} class="space-y-6">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <Input
                  label={t('products.productName')}
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
                  label={t('products.category')}
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      category: (e.target as HTMLSelectElement).value,
                    })
                  }
                  required
                  placeholder={t('products.selectCategory')}
                  options={getCategoryOptions(t)}
                  class="bg-white/80"
                />
              </div>
            </div>

            <div>
              <Textarea
                label={t('products.description')}
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

            <div>
              <div class="mb-2 flex items-center justify-between">
                <div class="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t('products.productImage')}
                </div>
                {(imagePreviewUrl || product?.image) && (
                  <Button type="button" variant="outline" size="sm" onClick={handleRemoveImage} disabled={isLoading}>
                    {t('products.removeImage')}
                  </Button>
                )}
              </div>

              <div class="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
                <div class="flex flex-col gap-4 md:flex-row md:items-center">
                  <div class="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                    {imagePreviewUrl ? (
                      <img src={imagePreviewUrl} alt={t('products.imagePreview')} class="h-full w-full object-cover" />
                    ) : (
                      <div class="flex flex-col items-center gap-1 text-gray-400 dark:text-gray-500">
                        <span class="text-3xl">🖼️</span>
                        <span class="text-xs font-medium">{t('products.noImage')}</span>
                      </div>
                    )}
                  </div>

                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {selectedImageFile ? t('products.changeImage') : t('products.uploadImage')}
                    </p>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('products.imageHelp')}</p>
                    {selectedImageFile && (
                      <p class="mt-2 text-xs font-medium text-blue-700 dark:text-blue-300">
                        {t('products.imageSelected', { fileName: selectedImageFile.name })}
                      </p>
                    )}

                    <label class="mt-3 inline-flex cursor-pointer items-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50">
                      <span>
                        {selectedImageFile || imagePreviewUrl ? t('products.changeImage') : t('products.uploadImage')}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        class="sr-only"
                        onChange={handleImageSelection}
                        disabled={isLoading}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Input
                  label={t('products.priceLabel')}
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
                  label={t('products.cost')}
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
                  label={t('products.stockLabel')}
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

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <Input
                  label={t('products.barcodeOptional')}
                  value={formData.barcode}
                  onInput={(e) =>
                    setFormData({
                      ...formData,
                      barcode: (e.target as HTMLInputElement).value,
                    })
                  }
                  placeholder={t('products.enterBarcode')}
                  class="bg-white/80 text-gray-900"
                  helperText={
                    normalizeBarcode(formData.barcode)
                      ? product?.variantType === 'configurable'
                        ? t('products.parentBarcodeHelpConfigurable', {
                            normalized: normalizeBarcode(formData.barcode) || '',
                          })
                        : t('products.barcodeNormalizedHelp', {
                            normalized: normalizeBarcode(formData.barcode) || '',
                          })
                      : product?.variantType === 'configurable'
                        ? t('products.parentBarcodeHintConfigurable')
                        : t('products.barcodeHelp')
                  }
                />
              </div>

              <div>
                <Select
                  label={t('products.status')}
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
                      label: t('products.activeStatus'),
                    },
                    {
                      value: 'inactive',
                      label: t('products.inactiveStatus'),
                    },
                  ]}
                  class="bg-white/80"
                />
              </div>
            </div>

            {/* Profit Margin Preview */}
            {formData.price > 0 && formData.cost > 0 && (
              <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                <div class="flex justify-between items-center">
                  <span class="font-semibold text-emerald-800 dark:text-emerald-300">
                    {t('products.profitMarginLabel')}
                  </span>
                  <span class="text-xl font-bold text-emerald-600 dark:text-emerald-300">
                    {(((formData.price - formData.cost) / formData.cost) * 100).toFixed(1)}%
                  </span>
                </div>
                <div class="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                  {t('products.profitPerUnit', { amount: `$${(formData.price - formData.cost).toFixed(2)}` })}
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-800">
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          {t('common.cancel')}
        </Button>
        <Button type="button" onClick={() => handleSubmit(new Event('submit'))} disabled={isLoading}>
          {isLoading
            ? selectedImageFile
              ? t('products.uploadingImage')
              : t('common.loading')
            : product
              ? t('common.edit')
              : t('common.add')}
        </Button>
      </div>
    </Dialog>
  )
}

export default function Products() {
  const { t } = useTranslation()
  const panelClass = 'rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'

  const [products, setProducts] = useState<Product[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [productsWithVariants, setProductsWithVariants] = useState<Record<string, ProductWithVariants>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
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
    setEditingProduct(null)
    setIsModalOpen(true)
  }

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product)
    setIsModalOpen(true)
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
    // Reload data to reflect changes with proper pagination
    if (searchQuery.trim()) {
      await performSearch(searchQuery, currentPage)
    } else {
      await loadProducts(currentPage)
    }
    if (options?.warning) {
      setError(options.warning)
    }
    setIsModalOpen(false)
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

  const handleGenerateVariants = (_productId: string) => {
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
      return 'border border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
    }
    if (stock < 10) {
      return 'border border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900/60 dark:bg-yellow-950/30 dark:text-yellow-300'
    }
    return 'border border-green-200 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300'
  }

  const getStatusColor = (isActive: boolean) => {
    return isActive
      ? 'border border-green-200 bg-green-50 text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-300'
      : 'border border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
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
            <div class="text-6xl mb-6 drop-shadow-lg">🔒</div>
            <h3 class="mb-3 text-2xl font-bold text-gray-900 dark:text-gray-100">{t('products.accessDenied')}</h3>
            <p class="mx-auto max-w-md text-gray-600 dark:text-gray-400">{t('products.noPermission')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading && products.length === 0) {
    return <PageLoader message={t('products.loadingCatalog')} />
  }

  return (
    <div class="max-w-6xl mx-auto">
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <p class="text-sm text-gray-500 dark:text-gray-400">
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
        <div class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <div class="flex items-center">
            <span class="text-red-500 mr-2">⚠️</span>
            {error}
          </div>
        </div>
      )}

      <div class={`${panelClass} overflow-hidden`}>
        <Table dense striped>
          <TableHead>
            <TableRow class="bg-gray-50 dark:bg-gray-800/60">
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
                        <div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 text-sm text-white shadow-sm">
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
                            <span class="truncate font-semibold text-gray-900 dark:text-gray-100">{product.name}</span>
                            {isConfigurable && (
                              <button
                                type="button"
                                onClick={() => handleToggleExpand(product.id)}
                                class="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-800 transition-colors hover:bg-purple-200 dark:border-purple-900/60 dark:bg-purple-950/30 dark:text-purple-300 dark:hover:bg-purple-950/50"
                              >
                                🏷️ {variantCount} {t('variants.variants')}
                                <span class={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                  ▼
                                </span>
                              </button>
                            )}
                          </div>
                          {product.description && (
                            <div class="mt-0.5 max-w-xs truncate text-xs text-gray-600 dark:text-gray-400">
                              {product.description}
                            </div>
                          )}
                          {product.barcode && (
                            <div class="mt-1 inline-flex w-fit items-center rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                              📊 {product.barcode}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div class="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300">
                        <span class="mr-1">{getCategoryIcon(product.category)}</span>
                        {getCategoryLabel(product.category, t)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {productWithVariants?.minPrice !== undefined && productWithVariants?.maxPrice !== undefined ? (
                        <div class="space-y-0.5">
                          <div class="text-base font-bold text-emerald-600 dark:text-emerald-300">
                            {formatCurrency(productWithVariants.minPrice)}
                          </div>
                          {productWithVariants.minPrice !== productWithVariants.maxPrice && (
                            <div class="text-[11px] leading-tight text-gray-500 dark:text-gray-400">
                              {t('variants.priceRange', {
                                min: formatCurrency(productWithVariants.minPrice),
                                max: formatCurrency(productWithVariants.maxPrice),
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div class="text-base font-bold text-emerald-600 dark:text-emerald-300">
                          {formatCurrency(product.price)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div class="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {formatCurrency(product.cost)}
                      </div>
                      <div class="mt-0.5 text-[11px] leading-tight text-gray-500 dark:text-gray-400">
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
                                <span class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200">
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
                    <TableRow key={`${product.id}-variants`} class="bg-gray-50 dark:bg-gray-800/40">
                      <TableCell colSpan={7} class="px-4 py-3">
                        <div class="space-y-2">
                          <div class="flex items-center justify-between">
                            <h4 class="font-semibold text-gray-900 dark:text-gray-100">{t('variants.variants')}</h4>
                            <div class="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingVariant(null)
                                  setIsVariantModalOpen(true)
                                }}
                              >
                                {t('variants.addVariant')}
                              </Button>
                            </div>
                          </div>
                          {productWithVariants.variants.length === 0 ? (
                            <div class="rounded-lg bg-white py-8 text-center dark:bg-gray-900">
                              <div class="text-4xl mb-2">📦</div>
                              <p class="text-gray-600 dark:text-gray-400">{t('variants.noVariants')}</p>
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
            <h3 class="mb-3 text-2xl font-bold text-gray-900 dark:text-gray-100">
              {searchQuery ? t('products.noProducts') : t('products.noProducts')}
            </h3>
            <p class="mx-auto mb-6 max-w-md text-gray-600 dark:text-gray-400">
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

      <EditProductModal
        product={editingProduct}
        isOpen={isModalOpen}
        resolvedImageUrl={editingProduct?.image ? resolvedImageUrls[editingProduct.image] : undefined}
        onClose={() => {
          setIsModalOpen(false)
          setEditingProduct(null)
        }}
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
