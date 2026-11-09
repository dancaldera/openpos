import { Avatar } from '@astryxdesign/core/Avatar'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Divider } from '@astryxdesign/core/Divider'
import { FileInput } from '@astryxdesign/core/FileInput'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { normalizeBarcode } from '@openpos/domain'
import { ScanBarcode } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Page } from '../../components/page/Page'
import { useTranslation } from '../../hooks/useTranslation'
import { formatMoney } from '../../lib/format'
import { navigate } from '../../lib/router'
import { toast } from '../../lib/toast'
import {
  deleteProductImage,
  resolveProductImageUrls,
  uploadProductImage,
  validateProductImageFile,
} from '../../services/product-images'
import { type Product, productService } from '../../services/products-turso'
import { ProductLoadingPage, ProductNotFoundPage } from './ProductPageStates'
import { categoryOptions, IMAGE_ACCEPT, marginPercent, productErrorMessage } from './productMeta'
import { useCurrencySymbol, useStableTranslate } from './useProductData'

interface ProductDraft {
  name: string
  description: string
  price: number
  cost: number
  stock: number
  category: string
  barcode: string
  isActive: boolean
}

type FieldErrors = Partial<Record<'name' | 'category' | 'price', string>>

const EMPTY_DRAFT: ProductDraft = {
  name: '',
  description: '',
  price: 0,
  cost: 0,
  stock: 0,
  category: '',
  barcode: '',
  isActive: true,
}

function draftFromProduct(product: Product): ProductDraft {
  return {
    name: product.name,
    description: product.description,
    price: product.price,
    cost: product.cost,
    stock: product.stock,
    category: product.category,
    barcode: product.barcode || '',
    isActive: product.isActive,
  }
}

interface ProductFormPageProps {
  /** Product to edit; omit to create a new one. */
  productId?: string
}

export default function ProductFormPage({ productId }: ProductFormPageProps) {
  const { t } = useTranslation()
  const stableT = useStableTranslate()
  const currencySymbol = useCurrencySymbol()
  const isEditing = Boolean(productId)
  const [product, setProduct] = useState<Product | null>(null)
  const [isLoading, setIsLoading] = useState(isEditing)
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT)
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(EMPTY_DRAFT))
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [isRemovingImage, setIsRemovingImage] = useState(false)
  const [imageError, setImageError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)

  useEffect(() => {
    if (!productId) return
    let isCancelled = false
    const load = async () => {
      try {
        const loaded = await productService.getProduct(productId)
        if (isCancelled || !loaded) return
        const next = draftFromProduct(loaded)
        setProduct(loaded)
        setDraft(next)
        setSavedSnapshot(JSON.stringify(next))
        const key = loaded.image?.trim()
        if (key) {
          const urls = await resolveProductImageUrls([key]).catch(() => ({}) as Record<string, string>)
          if (!isCancelled && urls[key]) setImagePreviewUrl(urls[key])
        }
      } catch (loadError) {
        if (!isCancelled) toast.error(loadError instanceof Error ? loadError.message : stableT('errors.generic'))
      } finally {
        if (!isCancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      isCancelled = true
    }
  }, [productId, stableT])

  // Object URLs for a picked file are released when the preview changes or the page unmounts.
  useEffect(() => {
    if (!imagePreviewUrl.startsWith('blob:')) return
    return () => URL.revokeObjectURL(imagePreviewUrl)
  }, [imagePreviewUrl])

  const isDirty = Boolean(imageFile) || isRemovingImage || JSON.stringify(draft) !== savedSnapshot
  const backTo = productId ? `products/${productId}` : 'products'
  const money = (amount: number) => formatMoney(amount, currencySymbol)
  const margin = marginPercent(draft.price, draft.cost)
  const isConfigurable = product?.variantType === 'configurable'
  const normalizedBarcode = normalizeBarcode(draft.barcode)
  const hasImage = Boolean(imagePreviewUrl) || (Boolean(product?.image) && !isRemovingImage)

  const update = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }))
    if (key in fieldErrors) setFieldErrors((previous) => ({ ...previous, [key]: undefined }))
  }

  const pickImage = (files: File | File[] | null) => {
    const file = Array.isArray(files) ? (files[0] ?? null) : files
    if (!file) {
      setImageFile(null)
      setImageError('')
      return
    }
    const validationError = validateProductImageFile(file)
    if (validationError) {
      setImageError(productErrorMessage(validationError, t))
      return
    }
    setImageError('')
    setImageFile(file)
    setImagePreviewUrl(URL.createObjectURL(file))
    setIsRemovingImage(false)
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreviewUrl('')
    setImageError('')
    setIsRemovingImage(Boolean(product?.image))
  }

  const validate = (): boolean => {
    const errors: FieldErrors = {}
    if (!draft.name.trim()) errors.name = t('products.nameRequired')
    if (!draft.category) errors.category = t('products.categoryRequired')
    if (draft.price <= 0) errors.price = t('products.priceRequired')
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const save = async () => {
    if (!validate()) return
    setIsSaving(true)
    setError('')

    const previousImageKey = product?.image?.trim() || ''
    let uploadedImageKey: string | undefined
    try {
      let nextImageKey = previousImageKey
      if (imageFile) {
        const uploaded = await uploadProductImage(imageFile)
        uploadedImageKey = uploaded.key
        nextImageKey = uploaded.key
      } else if (isRemovingImage) {
        nextImageKey = ''
      }

      const fields = {
        name: draft.name,
        description: draft.description,
        price: draft.price,
        cost: draft.cost,
        stock: draft.stock,
        category: draft.category,
        barcode: draft.barcode || undefined,
        isActive: draft.isActive,
      }
      const result = product
        ? await productService.updateProduct(product.id, {
            ...fields,
            image: imageFile || isRemovingImage ? nextImageKey : undefined,
            variantType: product.variantType,
          })
        : await productService.createProduct({ ...fields, image: nextImageKey || undefined, variantType: 'simple' })

      if (!result.success || !result.product) {
        if (uploadedImageKey) {
          await deleteProductImage(uploadedImageKey).catch((cleanupError: unknown) => {
            console.error('Failed to clean up uploaded image after product save failure:', cleanupError)
          })
        }
        setError(result.error || t('errors.generic'))
        return
      }

      let warning: string | undefined
      const replacedImage = Boolean(uploadedImageKey) && previousImageKey !== uploadedImageKey
      if (previousImageKey && (replacedImage || isRemovingImage)) {
        try {
          await deleteProductImage(previousImageKey)
        } catch (deleteError) {
          console.error('Failed to delete previous product image:', deleteError)
          warning = isRemovingImage ? t('products.imageDeleteOnRemoveFailed') : t('products.imageDeleteFailed')
        }
      }

      if (warning) toast.warning(warning)
      else toast.success(product ? t('products.productUpdated') : t('products.productAdded'))
      setSavedSnapshot(JSON.stringify(draft))
      setImageFile(null)
      setIsRemovingImage(false)
      navigate(`products/${result.product.id}`)
    } catch (saveError) {
      setError(productErrorMessage(saveError instanceof Error ? saveError.message : '', t))
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

  const title = isEditing ? t('products.editProduct') : t('products.newProduct')
  const breadcrumbs = isEditing
    ? [
        { label: t('products.title'), to: 'products' },
        { label: product?.name ?? t('products.product'), to: `products/${productId}` },
        { label: t('common.edit') },
      ]
    : [{ label: t('products.title'), to: 'products' }, { label: t('products.newProduct') }]

  if (isLoading) return <ProductLoadingPage title={title} breadcrumbs={breadcrumbs} width={720} />
  if (isEditing && !product) return <ProductNotFoundPage />

  const saveLabel = isEditing ? t('products.saveChanges') : t('products.createProduct')

  return (
    <Page
      title={title}
      description={t('products.formHint')}
      breadcrumbs={breadcrumbs}
      width={720}
      actions={
        <>
          <Button label={t('common.cancel')} onClick={leave} isDisabled={isSaving} />
          <Button label={saveLabel} variant="primary" isLoading={isSaving} onClick={() => void save()} />
        </>
      }
    >
      {isConfirmingDiscard && (
        <Banner
          status="warning"
          title={t('products.unsavedChangesTitle')}
          description={t('products.unsavedChangesMessage')}
          collapsible={false}
          endContent={
            <HStack gap={2}>
              <Button label={t('products.keepEditing')} size="sm" onClick={() => setIsConfirmingDiscard(false)} />
              <Button
                label={t('products.discardChanges')}
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
          title={t('products.saveFailed')}
          description={error}
          collapsible={false}
          isDismissable
          onDismiss={() => setError('')}
        />
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <VStack gap={6}>
          <Card>
            <VStack gap={4}>
              <Heading level={2}>{t('products.detailsHeading')}</Heading>
              <FormLayout>
                <TextInput
                  label={t('products.name')}
                  value={draft.name}
                  onChange={(value) => update('name', value)}
                  isRequired
                  status={fieldErrors.name ? { type: 'error', message: fieldErrors.name } : undefined}
                />
                <Selector
                  label={t('products.category')}
                  value={draft.category || undefined}
                  onChange={(value) => update('category', value)}
                  options={categoryOptions(t, product ? [product.category] : [])}
                  placeholder={t('products.selectCategory')}
                  hasSearch
                  isRequired
                  width="100%"
                  status={fieldErrors.category ? { type: 'error', message: fieldErrors.category } : undefined}
                />
                <TextArea
                  label={t('products.description')}
                  value={draft.description}
                  onChange={(value) => update('description', value)}
                  placeholder={t('products.descriptionPlaceholder')}
                  isOptional
                  rows={3}
                />
              </FormLayout>
            </VStack>
          </Card>

          <Card>
            <VStack gap={4}>
              <Heading level={2}>{t('products.pricingAndStock')}</Heading>
              <FormLayout direction="horizontal">
                <NumberInput
                  label={t('products.price')}
                  value={draft.price}
                  onChange={(value) => update('price', value ?? 0)}
                  min={0}
                  step={0.01}
                  units={currencySymbol}
                  isRequired
                  status={fieldErrors.price ? { type: 'error', message: fieldErrors.price } : undefined}
                />
                <NumberInput
                  label={t('products.cost')}
                  value={draft.cost}
                  onChange={(value) => update('cost', value ?? 0)}
                  min={0}
                  step={0.01}
                  units={currencySymbol}
                />
                <NumberInput
                  label={t('products.stock')}
                  value={draft.stock}
                  onChange={(value) => update('stock', value ?? 0)}
                  min={0}
                  isIntegerOnly
                />
              </FormLayout>
              <Text type="supporting" hasTabularNumbers>
                {margin === null
                  ? t('products.marginHint')
                  : t('products.marginSummary', {
                      margin: margin.toFixed(1),
                      amount: money(draft.price - draft.cost),
                    })}
              </Text>
              {isConfigurable && <Text type="supporting">{t('products.configurableStockHint')}</Text>}
            </VStack>
          </Card>

          <Card>
            <VStack gap={4}>
              <Heading level={2}>{t('products.identificationHeading')}</Heading>
              <TextInput
                label={t('products.barcode')}
                value={draft.barcode}
                onChange={(value) => update('barcode', value)}
                placeholder={t('products.barcodePlaceholder')}
                startIcon={ScanBarcode}
                isOptional
                hasAutoCorrect={false}
                hasSpellCheck={false}
                description={
                  normalizedBarcode
                    ? isConfigurable
                      ? t('products.parentBarcodeHelpConfigurable', { normalized: normalizedBarcode })
                      : t('products.barcodeNormalizedHelp', { normalized: normalizedBarcode })
                    : isConfigurable
                      ? t('products.parentBarcodeHintConfigurable')
                      : t('products.barcodeHelp')
                }
              />
            </VStack>
          </Card>

          <Card>
            <VStack gap={4}>
              <Heading level={2}>{t('products.imageHeading')}</Heading>
              <HStack gap={4} vAlign="center" wrap="wrap">
                <Avatar
                  name={draft.name || t('products.product')}
                  src={imagePreviewUrl || undefined}
                  alt={t('products.imagePreview')}
                  size={96}
                  shape="rounded"
                  tooltip={false}
                />
                <StackItem size="fill">
                  <VStack gap={2}>
                    <FileInput
                      label={hasImage ? t('products.replaceImage') : t('products.uploadImage')}
                      description={t('products.imageHelp')}
                      value={imageFile}
                      onChange={pickImage}
                      accept={IMAGE_ACCEPT}
                      isDisabled={isSaving}
                      status={imageError ? { type: 'error', message: imageError } : undefined}
                      statusVariant="detached"
                      width="100%"
                    />
                    {hasImage && (
                      <HStack>
                        <Button
                          label={t('products.removeImage')}
                          size="sm"
                          variant="ghost"
                          isDisabled={isSaving}
                          onClick={removeImage}
                        />
                      </HStack>
                    )}
                  </VStack>
                </StackItem>
              </HStack>
            </VStack>
          </Card>

          <Card>
            <VStack gap={4}>
              <Heading level={2}>{t('products.availabilityHeading')}</Heading>
              <CheckboxInput
                label={t('products.availableForSale')}
                description={t('products.availableForSaleHint')}
                value={draft.isActive}
                onChange={(checked) => update('isActive', checked)}
              />
            </VStack>
          </Card>

          <Divider />
          <HStack gap={2} hAlign="end">
            <Button label={t('common.cancel')} onClick={leave} isDisabled={isSaving} />
            <Button label={saveLabel} variant="primary" type="submit" isLoading={isSaving} />
          </HStack>
        </VStack>
      </form>
    </Page>
  )
}
