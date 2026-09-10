import { normalizeBarcode } from '@openpos/domain'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { Button, DialogConfirm, Input, Select, Textarea } from '../components/ui'
import { ChevronLeftIcon } from '../components/ui/icons'
import { useTranslation } from '../hooks/useTranslation'
import {
  DESKTOP_REMOTE_SESSION_UNAVAILABLE_MESSAGE,
  deleteProductImage,
  extractDesktopApiConfigPath,
  extractDesktopRemoteSessionDetails,
  resolveProductImageUrls,
  uploadProductImage,
  validateProductImageFile,
} from '../services/product-images'
import { PRODUCT_CATEGORIES, type Product, productService } from '../services/products-turso'

type TranslateFunction = (key: string, params?: Record<string, string | number | boolean>) => string

interface ProductFormState {
  name: string
  description: string
  price: number
  cost: number
  stock: number
  category: string
  barcode: string
  image: string
  isActive: boolean
}

export interface ProductFormPageProps {
  product: Product | null
  resolvedImageUrl?: string
  onBack: () => void
  onSaved: (product: Product, options?: { warning?: string }) => void
}

const emptyForm = (): ProductFormState => ({
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

const formFromProduct = (product: Product): ProductFormState => ({
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

function serializeForm(form: ProductFormState): string {
  return JSON.stringify(form)
}

export function ProductFormPage({ product, resolvedImageUrl, onBack, onSaved }: ProductFormPageProps) {
  const { t } = useTranslation()
  const panelClass = 'rounded-cards border border-fog-border bg-canvas p-6'

  const [formData, setFormData] = useState<ProductFormState>(() => (product ? formFromProduct(product) : emptyForm()))
  const [initialFormSnapshot, setInitialFormSnapshot] = useState(() =>
    serializeForm(product ? formFromProduct(product) : emptyForm()),
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState(resolvedImageUrl || '')
  const [temporaryPreviewUrl, setTemporaryPreviewUrl] = useState<string | null>(null)
  const [removeExistingImage, setRemoveExistingImage] = useState(false)
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)

  const clearTemporaryPreview = () => {
    if (temporaryPreviewUrl) {
      URL.revokeObjectURL(temporaryPreviewUrl)
      setTemporaryPreviewUrl(null)
    }
  }

  useEffect(() => {
    const nextForm = product ? formFromProduct(product) : emptyForm()
    setFormData(nextForm)
    setInitialFormSnapshot(serializeForm(nextForm))
    clearTemporaryPreview()
    setSelectedImageFile(null)
    setImagePreviewUrl(resolvedImageUrl || '')
    setRemoveExistingImage(false)
    setError('')
    setShowUnsavedConfirm(false)
  }, [product, resolvedImageUrl])

  useEffect(() => {
    if (selectedImageFile || !product?.image || resolvedImageUrl || removeExistingImage) {
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
  }, [product, removeExistingImage, resolvedImageUrl, selectedImageFile])

  useEffect(
    () => () => {
      if (temporaryPreviewUrl) {
        URL.revokeObjectURL(temporaryPreviewUrl)
      }
    },
    [temporaryPreviewUrl],
  )

  const isDirty = useMemo(() => {
    if (selectedImageFile || removeExistingImage) return true
    return serializeForm(formData) !== initialFormSnapshot
  }, [formData, initialFormSnapshot, removeExistingImage, selectedImageFile])

  const requestBack = () => {
    if (isLoading) return
    if (isDirty) {
      setShowUnsavedConfirm(true)
      return
    }
    onBack()
  }

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

  const handleSubmit = async (e?: Event) => {
    e?.preventDefault()
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

        onSaved(result.product, { warning })
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

  const title = product ? t('products.editProduct') : t('products.addProduct')

  return (
    <div class="mx-auto max-w-3xl">
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
              <p class="text-sm text-graphite">{t('products.formPageHint')}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 sm:justify-end">
            <Button type="button" onClick={() => void handleSubmit()} disabled={isLoading}>
              {isLoading ? (selectedImageFile ? t('products.uploadingImage') : t('common.loading')) : t('common.save')}
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

      <div class={panelClass}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit(e)
          }}
          class="space-y-6"
        >
          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
                class="bg-canvas text-void"
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
                class="bg-canvas"
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
              class="bg-canvas text-void"
              placeholder={t('products.enterDescription')}
            />
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between">
              <div class="block text-sm font-medium text-void">{t('products.productImage')}</div>
              {(imagePreviewUrl || product?.image) && (
                <Button type="button" variant="outline" size="sm" onClick={handleRemoveImage} disabled={isLoading}>
                  {t('products.removeImage')}
                </Button>
              )}
            </div>

            <div class="rounded-cards border border-dashed border-fog-border bg-chalk p-4">
              <div class="flex flex-col gap-4 md:flex-row md:items-center">
                <div class="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-cards border border-fog-border bg-canvas">
                  {imagePreviewUrl ? (
                    <img src={imagePreviewUrl} alt={t('products.imagePreview')} class="h-full w-full object-cover" />
                  ) : (
                    <div class="flex flex-col items-center gap-1 text-graphite">
                      <span class="text-3xl">🖼️</span>
                      <span class="text-xs font-medium">{t('products.noImage')}</span>
                    </div>
                  )}
                </div>

                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-void">
                    {selectedImageFile ? t('products.changeImage') : t('products.uploadImage')}
                  </p>
                  <p class="mt-1 text-xs text-graphite">{t('products.imageHelp')}</p>
                  {selectedImageFile && (
                    <p class="mt-2 text-xs font-medium text-void">
                      {t('products.imageSelected', { fileName: selectedImageFile.name })}
                    </p>
                  )}

                  <label class="mt-3 inline-flex cursor-pointer items-center rounded-cards border border-fog-border bg-chalk px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-chalk">
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

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                class="bg-canvas text-void"
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
                class="bg-canvas text-void"
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
                class="bg-canvas text-void"
                placeholder="0"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
                class="bg-canvas text-void"
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
                class="bg-canvas"
              />
            </div>
          </div>

          {formData.price > 0 && formData.cost > 0 && (
            <div class="rounded-cards border border-fog-border bg-chalk p-4">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-void">{t('products.profitMarginLabel')}</span>
                <span class="text-xl font-bold text-void">
                  {(((formData.price - formData.cost) / formData.cost) * 100).toFixed(1)}%
                </span>
              </div>
              <div class="mt-1 text-sm text-void">
                {t('products.profitPerUnit', { amount: `$${(formData.price - formData.cost).toFixed(2)}` })}
              </div>
            </div>
          )}
        </form>
      </div>

      <DialogConfirm
        isOpen={showUnsavedConfirm}
        onClose={() => setShowUnsavedConfirm(false)}
        onConfirm={() => {
          setShowUnsavedConfirm(false)
          onBack()
        }}
        title={t('products.unsavedChangesTitle')}
        message={t('products.unsavedChangesMessage')}
        confirmText={t('products.discardChanges')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </div>
  )
}
