import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { VStack } from '@astryxdesign/core/Stack'
import { useState } from 'react'
import { Page } from '../../components/page/Page'
import { useTranslation } from '../../hooks/useTranslation'
import { hrefFor, navigate } from '../../lib/router'
import { toast } from '../../lib/toast'
import { productService } from '../../services/products-turso'
import { ProductLoadingPage, ProductNotFoundPage } from './ProductPageStates'
import { useAttributes, useProduct } from './useProductData'

/** Turns a simple product into one sold in variants, choosing the attributes it varies by. */
export default function EnableVariantsPage({ productId }: { productId: string }) {
  const { t } = useTranslation()
  const { product, isLoading } = useProduct(productId)
  const { attributes, isLoading: isLoadingAttributes } = useAttributes()
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const productPath = `products/${productId}`
  const title = t('products.enableVariants')
  const breadcrumbs = [
    { label: t('products.title'), to: 'products' },
    { label: product?.name ?? t('products.product'), to: productPath },
    { label: title },
  ]

  if (isLoading || isLoadingAttributes) {
    return <ProductLoadingPage title={title} breadcrumbs={breadcrumbs} width={720} />
  }
  if (!product) return <ProductNotFoundPage />

  if (product.variantType === 'configurable') {
    return (
      <Page title={title} breadcrumbs={breadcrumbs} width={720}>
        <EmptyState
          title={t('products.variantsAlreadyOnTitle')}
          description={t('products.variantsAlreadyOnDescription')}
          actions={<Button label={t('products.backToProduct')} href={hrefFor(productPath)} />}
        />
      </Page>
    )
  }

  const enable = async () => {
    if (selected.length === 0) {
      setError(t('products.chooseAttributeFirst'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const result = await productService.convertToConfigurable(productId, selected)
      if (result.success) {
        toast.success(t('products.variantsEnabled'))
        navigate(productPath)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch {
      setError(t('errors.generic'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Page
      title={title}
      description={t('products.enableVariantsHint', { product: product.name })}
      breadcrumbs={breadcrumbs}
      width={720}
      actions={
        <>
          <Button label={t('common.cancel')} href={hrefFor(productPath)} isDisabled={isSaving} />
          <Button
            label={t('products.enableVariants')}
            variant="primary"
            isLoading={isSaving}
            isDisabled={selected.length === 0}
            onClick={() => void enable()}
          />
        </>
      }
    >
      <Banner status="info" title={t('products.enableVariantsInfo')} collapsible={false} />
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

      <Card>
        {attributes.length === 0 ? (
          <EmptyState
            isCompact
            title={t('products.noAttributesTitle')}
            description={t('products.noAttributesDescription')}
          />
        ) : (
          <VStack gap={4}>
            <CheckboxList
              label={t('products.variesBy')}
              description={t('products.variesByHint')}
              value={selected}
              onChange={setSelected}
              hasDividers
            >
              {attributes.map((attribute) => (
                <CheckboxListItem
                  key={attribute.id}
                  value={attribute.id}
                  label={attribute.name}
                  description={attribute.values.join(', ')}
                />
              ))}
            </CheckboxList>
          </VStack>
        )}
      </Card>
    </Page>
  )
}
