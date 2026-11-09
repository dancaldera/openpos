import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Heading } from '@astryxdesign/core/Heading'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { useState } from 'react'
import { Page } from '../../components/page/Page'
import { useTranslation } from '../../hooks/useTranslation'
import { hrefFor, navigate } from '../../lib/router'
import { toast } from '../../lib/toast'
import { productVariantsService } from '../../services/product-variants-turso'
import { ProductLoadingPage, ProductNotFoundPage } from './ProductPageStates'
import { useCurrencySymbol, useProduct, useVariantAttributes } from './useProductData'

/** Creates one variant for every combination of the chosen attribute values. */
export default function GenerateVariantsPage({ productId }: { productId: string }) {
  const { t } = useTranslation()
  const currencySymbol = useCurrencySymbol()
  const { product, isLoading } = useProduct(productId)
  const { attributes, isLoading: isLoadingAttributes } = useVariantAttributes(productId)
  const [selection, setSelection] = useState<Record<string, string[]>>({})
  const [price, setPrice] = useState(0)
  const [cost, setCost] = useState(0)
  const [stock, setStock] = useState(0)
  const [error, setError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const productPath = `products/${productId}`
  const title = t('products.generateVariants')
  const breadcrumbs = [
    { label: t('products.title'), to: 'products' },
    { label: product?.name ?? t('products.product'), to: productPath },
    { label: title },
  ]

  if (isLoading || isLoadingAttributes) {
    return <ProductLoadingPage title={title} breadcrumbs={breadcrumbs} width={720} />
  }
  if (!product) return <ProductNotFoundPage />

  if (product.variantType !== 'configurable') {
    return (
      <Page title={title} breadcrumbs={breadcrumbs} width={720}>
        <EmptyState
          title={t('products.variantsOffTitle')}
          description={t('products.variantsOffDescription')}
          actions={<Button label={t('products.enableVariants')} href={hrefFor(`${productPath}/variants/enable`)} />}
        />
      </Page>
    )
  }

  const chosen = Object.fromEntries(Object.entries(selection).filter(([, values]) => values.length > 0))
  const combinationCount =
    Object.keys(chosen).length === 0 ? 0 : Object.values(chosen).reduce((total, values) => total * values.length, 1)

  const generate = async () => {
    if (combinationCount === 0) {
      setError(t('products.chooseValuesFirst'))
      return
    }
    if (price <= 0) {
      setError(t('products.priceRequired'))
      return
    }
    setIsGenerating(true)
    setError('')
    try {
      const result = await productVariantsService.generateVariants(productId, chosen, { price, cost, stock })
      if (result.success) {
        toast.success(t('products.variantsGenerated', { count: result.variants?.length ?? 0 }))
        navigate(productPath)
      } else {
        setError(result.error || t('errors.generic'))
      }
    } catch {
      setError(t('errors.generic'))
    } finally {
      setIsGenerating(false)
    }
  }

  const generateLabel =
    combinationCount > 0 ? t('products.generateCount', { count: combinationCount }) : t('products.generateVariants')

  return (
    <Page
      title={title}
      description={t('products.generateHint', { product: product.name })}
      breadcrumbs={breadcrumbs}
      width={720}
      actions={
        <>
          <Button label={t('common.cancel')} href={hrefFor(productPath)} isDisabled={isGenerating} />
          <Button
            label={generateLabel}
            variant="primary"
            isLoading={isGenerating}
            isDisabled={combinationCount === 0 || price <= 0}
            onClick={() => void generate()}
          />
        </>
      }
    >
      {error && (
        <Banner
          status="error"
          title={t('products.generateFailed')}
          description={error}
          collapsible={false}
          isDismissable
          onDismiss={() => setError('')}
        />
      )}

      <VStack gap={3}>
        <VStack gap={1}>
          <Heading level={2}>{t('products.attributesHeading')}</Heading>
          <Text type="supporting">{t('products.generateValuesHint')}</Text>
        </VStack>
        {attributes.length === 0 ? (
          <Card>
            <EmptyState
              isCompact
              title={t('products.noAttributesTitle')}
              description={t('products.noAttributesDescription')}
            />
          </Card>
        ) : (
          attributes.map((attribute) => (
            <Card key={attribute.id}>
              <CheckboxList
                label={attribute.name}
                value={selection[attribute.id] ?? []}
                onChange={(values) => setSelection((previous) => ({ ...previous, [attribute.id]: values }))}
                density="compact"
              >
                {attribute.values.map((value) => (
                  <CheckboxListItem key={value} value={value} label={value} />
                ))}
              </CheckboxList>
            </Card>
          ))
        )}
      </VStack>

      <Card>
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={2}>{t('products.startingValues')}</Heading>
            <Text type="supporting">{t('products.startingValuesHint')}</Text>
          </VStack>
          <FormLayout direction="horizontal">
            <NumberInput
              label={t('products.price')}
              value={price}
              onChange={(value) => setPrice(value ?? 0)}
              min={0}
              step={0.01}
              units={currencySymbol}
              isRequired
            />
            <NumberInput
              label={t('products.cost')}
              value={cost}
              onChange={(value) => setCost(value ?? 0)}
              min={0}
              step={0.01}
              units={currencySymbol}
            />
            <NumberInput
              label={t('products.stock')}
              value={stock}
              onChange={(value) => setStock(value ?? 0)}
              min={0}
              isIntegerOnly
            />
          </FormLayout>
          <Text type="supporting" hasTabularNumbers>
            {t('products.combinationCount', { count: combinationCount })}
          </Text>
        </VStack>
      </Card>
    </Page>
  )
}
