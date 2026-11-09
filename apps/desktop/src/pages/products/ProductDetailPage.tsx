import { Avatar } from '@astryxdesign/core/Avatar'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Heading'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { Pencil } from 'lucide-react'
import { ConfirmAction } from '../../components/page/ConfirmAction'
import { Page } from '../../components/page/Page'
import { StatTile } from '../../components/page/StatTile'
import { useTranslation } from '../../hooks/useTranslation'
import { formatDateTime, formatMoney } from '../../lib/format'
import { hrefFor, navigate } from '../../lib/router'
import { toast } from '../../lib/toast'
import { deleteProductImage } from '../../services/product-images'
import { productService } from '../../services/products-turso'
import { ProductLoadingPage, ProductNotFoundPage } from './ProductPageStates'
import { ProductVariantsSection } from './ProductVariantsSection'
import { categoryLabel, effectiveStock, marginPercent, stockLevel, stockLevelLabel } from './productMeta'
import { type ProductPermissions, useCurrencySymbol, useProduct } from './useProductData'

interface ProductDetailPageProps {
  productId: string
  permissions: ProductPermissions
}

export default function ProductDetailPage({ productId, permissions }: ProductDetailPageProps) {
  const { t } = useTranslation()
  const currencySymbol = useCurrencySymbol()
  const { product, imageUrl, isLoading, reload } = useProduct(productId)

  if (isLoading) {
    return (
      <ProductLoadingPage
        title={t('products.title')}
        breadcrumbs={[{ label: t('products.title'), to: 'products' }, { label: t('common.loading') }]}
      />
    )
  }

  if (!product) return <ProductNotFoundPage />

  const money = (amount: number) => formatMoney(amount, currencySymbol)
  const isConfigurable = product.variantType === 'configurable'
  const stock = effectiveStock(product)
  const level = stockLevel(stock)
  const margin = marginPercent(product.price, product.cost)
  const { minPrice, maxPrice } = product
  let priceLabel = money(product.price)
  if (isConfigurable && minPrice !== undefined && maxPrice !== undefined) {
    priceLabel =
      minPrice === maxPrice ? money(minPrice) : t('products.priceRange', { min: money(minPrice), max: money(maxPrice) })
  }
  const statusLabel = product.isActive ? t('products.active') : t('products.inactive')

  const deleteProduct = async () => {
    const result = await productService.deleteProduct(product.id)
    if (!result.success) {
      toast.error(result.error || t('errors.generic'))
      return
    }
    if (product.image) {
      try {
        await deleteProductImage(product.image)
      } catch (error) {
        console.error('Failed to delete product image after deleting product:', error)
        toast.warning(t('products.imageDeleteOnProductDeleteFailed'))
      }
    }
    toast.success(t('products.productDeleted'))
    navigate('products')
  }

  return (
    <Page
      title={product.name}
      breadcrumbs={[{ label: t('products.title'), to: 'products' }, { label: product.name }]}
      width={960}
      meta={
        <HStack gap={2} vAlign="center">
          <StatusDot variant={product.isActive ? 'success' : 'neutral'} label={statusLabel} />
          <Text color="secondary">{statusLabel}</Text>
        </HStack>
      }
      actions={
        permissions.canEdit ? (
          <Button label={t('common.edit')} icon={<Pencil size={16} />} href={hrefFor(`products/${product.id}/edit`)} />
        ) : undefined
      }
    >
      <Card>
        <HStack gap={6} vAlign="start" wrap="wrap">
          <Avatar name={product.name} src={imageUrl} size={128} shape="rounded" tooltip={false} />
          <StackItem size="fill">
            <MetadataList columns="multi" label={{ position: 'top' }}>
              <MetadataListItem label={t('products.category')}>{categoryLabel(product.category, t)}</MetadataListItem>
              <MetadataListItem label={t('products.type')}>
                {isConfigurable ? t('products.typeConfigurable') : t('products.typeSimple')}
              </MetadataListItem>
              <MetadataListItem label={t('products.barcode')}>
                {product.barcode ? <Text type="code">{product.barcode}</Text> : t('products.none')}
              </MetadataListItem>
              <MetadataListItem label={t('products.created')}>{formatDateTime(product.createdAt)}</MetadataListItem>
              <MetadataListItem label={t('products.updated')}>{formatDateTime(product.updatedAt)}</MetadataListItem>
            </MetadataList>
          </StackItem>
        </HStack>
      </Card>

      {product.description && (
        <VStack gap={3}>
          <Heading level={2}>{t('products.description')}</Heading>
          <Card>
            <Text as="p">{product.description}</Text>
          </Card>
        </VStack>
      )}

      <VStack gap={3}>
        <Heading level={2}>{t('products.pricingAndStock')}</Heading>
        <Grid columns={{ minWidth: 180 }} gap={4}>
          <StatTile label={t('products.price')} value={priceLabel} />
          <StatTile label={t('products.cost')} value={money(product.cost)} />
          <StatTile
            label={t('products.margin')}
            value={margin === null ? t('products.none') : `${margin.toFixed(1)}%`}
            detail={
              margin === null ? undefined : t('products.profitPerUnit', { amount: money(product.price - product.cost) })
            }
          />
          <StatTile
            label={isConfigurable ? t('products.totalStock') : t('products.stock')}
            value={stock}
            detail={stockLevelLabel(level, t)}
          />
        </Grid>
      </VStack>

      <ProductVariantsSection
        product={product}
        currencySymbol={currencySymbol}
        canEdit={permissions.canEdit}
        onChanged={reload}
      />

      {permissions.canDelete && (
        <VStack gap={3}>
          <Heading level={2}>{t('products.dangerZone')}</Heading>
          <Card>
            <VStack gap={3}>
              <Text type="supporting">{t('products.deleteHint')}</Text>
              <HStack>
                <ConfirmAction
                  label={t('products.deleteProduct')}
                  title={t('products.deleteConfirmTitle')}
                  description={t('products.deleteMessage')}
                  confirmLabel={t('common.delete')}
                  cancelLabel={t('common.cancel')}
                  onConfirm={deleteProduct}
                />
              </HStack>
            </VStack>
          </Card>
        </VStack>
      )}
    </Page>
  )
}
