import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { normalizeBarcode } from '@openpos/domain'
import { ScanBarcode } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ConfirmAction } from '../../components/page/ConfirmAction'
import { Page } from '../../components/page/Page'
import { useTranslation } from '../../hooks/useTranslation'
import { formatMoney } from '../../lib/format'
import { hrefFor, navigate } from '../../lib/router'
import { toast } from '../../lib/toast'
import { type ProductVariantInput, productVariantsService } from '../../services/product-variants-turso'
import { productService } from '../../services/products-turso'
import { ProductLoadingPage, ProductNotFoundPage } from './ProductPageStates'
import { marginPercent, variantLabel } from './productMeta'
import { useCurrencySymbol, useProduct, useVariantAttributes } from './useProductData'

interface VariantDraft {
  sku: string
  barcode: string
  price: number
  cost: number
  stock: number
  attributes: Record<string, string>
  isActive: boolean
}

const EMPTY_DRAFT: VariantDraft = { sku: '', barcode: '', price: 0, cost: 0, stock: 0, attributes: {}, isActive: true }

interface VariantFormPageProps {
  productId: string
  /** Variant to edit; omit to add a new one. */
  variantId?: string
}

export default function VariantFormPage({ productId, variantId }: VariantFormPageProps) {
  const { t } = useTranslation()
  const currencySymbol = useCurrencySymbol()
  const { product, isLoading: isLoadingProduct, reload } = useProduct(productId)
  const { attributes: fieldAttributes, isLoading: isLoadingAttributes } = useVariantAttributes(productId)
  const [draft, setDraft] = useState<VariantDraft>(EMPTY_DRAFT)
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(EMPTY_DRAFT))
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)
  const isEditing = Boolean(variantId)
  const variant = variantId ? product?.variants?.find((entry) => entry.id === variantId) : undefined
  const loadedVariantId = useRef<string | null>(null)

  // Fill the form once per variant; later reloads (e.g. after setting the default) keep the edits.
  useEffect(() => {
    if (!variant || loadedVariantId.current === variant.id) return
    loadedVariantId.current = variant.id
    const next: VariantDraft = {
      sku: variant.sku || '',
      barcode: variant.barcode || '',
      price: variant.price,
      cost: variant.cost,
      stock: variant.stock,
      attributes: { ...variant.attributes },
      isActive: variant.isActive,
    }
    setDraft(next)
    setSavedSnapshot(JSON.stringify(next))
  }, [variant])

  /** Values stored on the variant under keys that no current attribute covers; kept as they are. */
  const extraAttributes = Object.entries(draft.attributes).filter(
    ([key]) => !fieldAttributes.some((attribute) => attribute.slug === key),
  )

  const productPath = `products/${productId}`
  const title = isEditing ? t('products.editVariant') : t('products.newVariant')
  const breadcrumbs = [
    { label: t('products.title'), to: 'products' },
    { label: product?.name ?? t('products.product'), to: productPath },
    { label: isEditing && variant ? variantLabel(variant.attributes) : title },
  ]

  if (isLoadingProduct || isLoadingAttributes) {
    return <ProductLoadingPage title={title} breadcrumbs={breadcrumbs} width={720} />
  }
  if (!product) return <ProductNotFoundPage />

  if (product.variantType !== 'configurable' || (isEditing && !variant)) {
    return (
      <Page title={title} breadcrumbs={breadcrumbs} width={720}>
        <EmptyState
          title={
            product.variantType !== 'configurable' ? t('products.variantsOffTitle') : t('products.variantNotFound')
          }
          description={
            product.variantType !== 'configurable'
              ? t('products.variantsOffDescription')
              : t('products.variantNotFoundDescription')
          }
          actions={<Button label={t('products.backToProduct')} href={hrefFor(productPath)} />}
        />
      </Page>
    )
  }

  const isDirty = JSON.stringify(draft) !== savedSnapshot
  const money = (amount: number) => formatMoney(amount, currencySymbol)
  const margin = marginPercent(draft.price, draft.cost)
  const normalizedBarcode = normalizeBarcode(draft.barcode)
  const isDefault = Boolean(variant) && product.defaultVariantId === variant?.id

  const update = <K extends keyof VariantDraft>(key: K, value: VariantDraft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }))

  const setAttribute = (slug: string, value: string | null) =>
    setDraft((previous) => {
      const next = { ...previous.attributes }
      if (value) next[slug] = value
      else delete next[slug]
      return { ...previous, attributes: next }
    })

  const save = async () => {
    if (Object.keys(draft.attributes).length === 0) {
      setError(t('products.variantNeedsAttribute'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const payload: ProductVariantInput = {
        parentProductId: productId,
        sku: draft.sku.trim() || undefined,
        barcode: draft.barcode || undefined,
        price: draft.price,
        cost: draft.cost,
        stock: draft.stock,
        attributes: draft.attributes,
        image: variant?.image,
        isActive: draft.isActive,
        position: variant?.position ?? product.variants?.length ?? 0,
      }
      const result = variant
        ? await productVariantsService.updateVariant(variant.id, payload)
        : await productVariantsService.createVariant(payload)
      if (result.success) {
        toast.success(variant ? t('variants.variantUpdated') : t('variants.variantCreated'))
        setSavedSnapshot(JSON.stringify(draft))
        navigate(productPath)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('errors.generic'))
    } finally {
      setIsSaving(false)
    }
  }

  const setAsDefault = async () => {
    if (!variant) return
    const result = await productService.setDefaultVariant(productId, variant.id)
    if (result.success) {
      toast.success(t('products.defaultVariantSet'))
      await reload()
    } else {
      toast.error(result.error || t('errors.generic'))
    }
  }

  const deleteVariant = async () => {
    if (!variant) return
    const result = await productVariantsService.deleteVariant(variant.id)
    if (result.success) {
      toast.success(t('variants.variantDeleted'))
      navigate(productPath)
    } else {
      toast.error(result.error || t('errors.generic'))
    }
  }

  const leave = () => {
    if (isDirty && !isConfirmingDiscard) {
      setIsConfirmingDiscard(true)
      return
    }
    navigate(productPath)
  }

  const saveLabel = isEditing ? t('products.saveChanges') : t('products.createVariant')

  return (
    <Page
      title={title}
      description={t('products.variantFormHint', { product: product.name })}
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
                onClick={() => navigate(productPath)}
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
              <VStack gap={1}>
                <Heading level={2}>{t('products.attributesHeading')}</Heading>
                <Text type="supporting">{t('products.attributesHint')}</Text>
              </VStack>
              {fieldAttributes.length === 0 && extraAttributes.length === 0 ? (
                <EmptyState
                  isCompact
                  title={t('products.noAttributesTitle')}
                  description={t('products.noAttributesDescription')}
                />
              ) : (
                <FormLayout>
                  {fieldAttributes.map((attribute) => {
                    const current = draft.attributes[attribute.slug]
                    const values =
                      current && !attribute.values.includes(current) ? [...attribute.values, current] : attribute.values
                    return (
                      <Selector
                        key={attribute.id}
                        label={attribute.name}
                        value={current}
                        onChange={(value: string | null) => setAttribute(attribute.slug, value)}
                        options={values.map((value) => ({ value, label: value }))}
                        placeholder={t('products.chooseValue')}
                        hasClear
                        width="100%"
                      />
                    )
                  })}
                  {extraAttributes.map(([key, value]) => (
                    <TextInput key={key} label={key} value={value} onChange={() => {}} isReadOnly />
                  ))}
                </FormLayout>
              )}
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
                  : t('products.marginSummary', { margin: margin.toFixed(1), amount: money(draft.price - draft.cost) })}
              </Text>
            </VStack>
          </Card>

          <Card>
            <VStack gap={4}>
              <Heading level={2}>{t('products.identificationHeading')}</Heading>
              <FormLayout direction="horizontal">
                <TextInput
                  label={t('products.sku')}
                  value={draft.sku}
                  onChange={(value) => update('sku', value)}
                  isOptional
                  hasAutoCorrect={false}
                  hasSpellCheck={false}
                />
                <TextInput
                  label={t('products.barcode')}
                  value={draft.barcode}
                  onChange={(value) => update('barcode', value)}
                  startIcon={ScanBarcode}
                  isOptional
                  hasAutoCorrect={false}
                  hasSpellCheck={false}
                />
              </FormLayout>
              <Text type="supporting">
                {normalizedBarcode
                  ? t('variants.barcodeNormalizedHelp', { normalized: normalizedBarcode })
                  : t('variants.barcodeHelp')}
              </Text>
            </VStack>
          </Card>

          <Card>
            <VStack gap={4}>
              <Heading level={2}>{t('products.availabilityHeading')}</Heading>
              <CheckboxInput
                label={t('products.availableForSale')}
                description={t('products.variantAvailableHint')}
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

      {variant && (
        <VStack gap={3}>
          <Heading level={2}>{t('products.defaultVariant')}</Heading>
          <Card>
            <HStack gap={4} vAlign="center" wrap="wrap" hAlign="between">
              <Text type="supporting">
                {isDefault ? t('products.isDefaultVariant') : t('products.defaultVariantHint')}
              </Text>
              {!isDefault && <Button label={t('products.setDefaultVariant')} clickAction={setAsDefault} />}
            </HStack>
          </Card>
        </VStack>
      )}

      {variant && (
        <VStack gap={3}>
          <Heading level={2}>{t('products.dangerZone')}</Heading>
          <Card>
            <VStack gap={3}>
              <Text type="supporting">{t('products.deleteVariantMessage')}</Text>
              <HStack>
                <ConfirmAction
                  label={t('products.deleteVariant')}
                  title={t('products.deleteVariantTitle', { variant: variantLabel(variant.attributes) })}
                  description={t('products.deleteVariantMessage')}
                  confirmLabel={t('common.delete')}
                  cancelLabel={t('common.cancel')}
                  onConfirm={deleteVariant}
                />
              </HStack>
            </VStack>
          </Card>
        </VStack>
      )}
    </Page>
  )
}
