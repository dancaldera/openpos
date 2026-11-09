import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { Link } from '@astryxdesign/core/Link'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { pixel, proportional, Table, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ConfirmAction } from '../../components/page/ConfirmAction'
import { useTranslation } from '../../hooks/useTranslation'
import { formatMoney } from '../../lib/format'
import { hrefFor, navigate } from '../../lib/router'
import { toast } from '../../lib/toast'
import { type ProductVariant, productVariantsService } from '../../services/product-variants-turso'
import { type ProductWithVariants, productService } from '../../services/products-turso'
import { stockDot, stockLevel, stockLevelLabel, variantLabel } from './productMeta'

interface VariantRow extends Record<string, unknown> {
  id: string
  variant: ProductVariant
}

interface ProductVariantsSectionProps {
  product: ProductWithVariants
  currencySymbol: string
  canEdit: boolean
  onChanged: () => Promise<void>
}

/** Variant table and variant controls shown on the product page. */
export function ProductVariantsSection({ product, currencySymbol, canEdit, onChanged }: ProductVariantsSectionProps) {
  const { t } = useTranslation()
  const [pendingDelete, setPendingDelete] = useState<ProductVariant | null>(null)
  const isConfigurable = product.variantType === 'configurable'
  const variants = product.variants ?? []
  const base = `products/${product.id}/variants`

  if (!isConfigurable) {
    if (!canEdit) return null
    return (
      <VStack gap={3}>
        <Heading level={2}>{t('products.variantsHeading')}</Heading>
        <Card>
          <HStack gap={4} vAlign="center" wrap="wrap">
            <StackItem size="fill">
              <VStack gap={1}>
                <Text weight="medium">{t('products.variantsOffTitle')}</Text>
                <Text type="supporting">{t('products.variantsOffDescription')}</Text>
              </VStack>
            </StackItem>
            <Button label={t('products.enableVariants')} href={hrefFor(`${base}/enable`)} />
          </HStack>
        </Card>
      </VStack>
    )
  }

  const money = (amount: number) => formatMoney(amount, currencySymbol)

  const setDefault = async (variant: ProductVariant) => {
    const result = await productService.setDefaultVariant(product.id, variant.id)
    if (result.success) {
      toast.success(t('products.defaultVariantSet'))
      await onChanged()
    } else {
      toast.error(result.error || t('errors.generic'))
    }
  }

  const deleteVariant = async (variant: ProductVariant) => {
    const result = await productVariantsService.deleteVariant(variant.id)
    if (result.success) {
      toast.success(t('variants.variantDeleted'))
      setPendingDelete(null)
      await onChanged()
    } else {
      toast.error(result.error || t('errors.generic'))
    }
  }

  const disableVariants = async () => {
    const result = await productService.convertToSimple(product.id)
    if (result.success) {
      toast.success(t('products.variantsDisabled'))
      await onChanged()
    } else {
      toast.error(result.error || t('errors.generic'))
    }
  }

  const rows: VariantRow[] = variants.map((variant) => ({ id: variant.id, variant }))

  const columns: TableColumn<VariantRow>[] = [
    {
      key: 'variant',
      header: t('variants.variant'),
      width: proportional(3, { minWidth: 200 }),
      renderCell: ({ variant }) => {
        const label = variantLabel(variant.attributes) || t('products.unnamedVariant')
        return (
          <VStack gap={0.5}>
            <HStack gap={2} vAlign="center">
              {canEdit ? (
                <Link href={hrefFor(`${base}/${variant.id}`)}>
                  <Text type="inherit" weight="medium" maxLines={1}>
                    {label}
                  </Text>
                </Link>
              ) : (
                <Text weight="medium" maxLines={1}>
                  {label}
                </Text>
              )}
              {product.defaultVariantId === variant.id && <Badge label={t('products.defaultBadge')} />}
            </HStack>
            {variant.sku && <Text type="supporting">{t('products.skuValue', { sku: variant.sku })}</Text>}
          </VStack>
        )
      },
    },
    {
      key: 'barcode',
      header: t('products.barcode'),
      width: proportional(1, { minWidth: 120 }),
      renderCell: ({ variant }) =>
        variant.barcode ? (
          <Text type="code">{variant.barcode}</Text>
        ) : (
          <Text color="secondary">{t('products.none')}</Text>
        ),
    },
    {
      key: 'price',
      header: t('products.price'),
      width: pixel(110),
      align: 'end',
      renderCell: ({ variant }) => <Text hasTabularNumbers>{money(variant.price)}</Text>,
    },
    {
      key: 'stock',
      header: t('products.stock'),
      width: pixel(100),
      renderCell: ({ variant }) => {
        const level = stockLevel(variant.stock)
        return (
          <HStack gap={2} vAlign="center">
            <StatusDot variant={stockDot(level)} label={stockLevelLabel(level, t)} />
            <Text hasTabularNumbers>{variant.stock}</Text>
          </HStack>
        )
      },
    },
    {
      key: 'status',
      header: t('common.status'),
      width: pixel(110),
      renderCell: ({ variant }) => (
        <Text color={variant.isActive ? 'primary' : 'secondary'}>
          {variant.isActive ? t('products.active') : t('products.inactive')}
        </Text>
      ),
    },
  ]

  if (canEdit) {
    columns.push({
      key: 'actions',
      header: '',
      width: pixel(56),
      align: 'end',
      renderCell: ({ variant }) => (
        <MoreMenu
          label={t('products.variantActions', { variant: variantLabel(variant.attributes) })}
          size="sm"
          alignment="end"
          items={[
            { label: t('common.edit'), onClick: () => navigate(`${base}/${variant.id}`) },
            {
              label: t('products.setDefaultVariant'),
              isDisabled: product.defaultVariantId === variant.id,
              onClick: () => void setDefault(variant),
            },
            { type: 'divider' },
            { label: t('products.deleteVariant'), variant: 'destructive', onClick: () => setPendingDelete(variant) },
          ]}
        />
      ),
    })
  }

  return (
    <VStack gap={3}>
      <HStack gap={3} vAlign="center" wrap="wrap">
        <StackItem size="fill">
          <Heading level={2}>{t('products.variantsHeading')}</Heading>
        </StackItem>
        {canEdit && (
          <HStack gap={2} wrap="wrap">
            <Button label={t('products.generateVariants')} size="sm" href={hrefFor(`${base}/generate`)} />
            <Button
              label={t('products.addVariant')}
              size="sm"
              variant="primary"
              icon={<Plus size={16} />}
              href={hrefFor(`${base}/new`)}
            />
          </HStack>
        )}
      </HStack>

      {pendingDelete && (
        <Banner
          status="error"
          title={t('products.deleteVariantTitle', { variant: variantLabel(pendingDelete.attributes) })}
          description={t('products.deleteVariantMessage')}
          collapsible={false}
          endContent={
            <HStack gap={2}>
              <Button label={t('common.cancel')} size="sm" onClick={() => setPendingDelete(null)} />
              <Button
                label={t('common.delete')}
                size="sm"
                variant="destructive"
                clickAction={() => deleteVariant(pendingDelete)}
              />
            </HStack>
          }
        />
      )}

      <Card padding={0}>
        {rows.length === 0 ? (
          <VStack padding={6}>
            <EmptyState
              isCompact
              title={t('products.noVariantsTitle')}
              description={t('products.noVariantsDescription')}
              actions={
                canEdit ? (
                  <Button label={t('products.generateVariants')} href={hrefFor(`${base}/generate`)} />
                ) : undefined
              }
            />
          </VStack>
        ) : (
          <Table<VariantRow> data={rows} columns={columns} idKey="id" density="balanced" hasHover />
        )}
      </Card>

      {canEdit && (
        <Card>
          <HStack gap={4} vAlign="center" wrap="wrap">
            <StackItem size="fill">
              <VStack gap={1}>
                <Text weight="medium">{t('products.disableVariantsTitle')}</Text>
                <Text type="supporting">
                  {variants.length > 0 ? t('products.disableVariantsBlocked') : t('products.disableVariantsHint')}
                </Text>
              </VStack>
            </StackItem>
            <ConfirmAction
              label={t('products.disableVariants')}
              title={t('products.disableVariantsConfirmTitle')}
              description={t('products.disableVariantsConfirmMessage')}
              confirmLabel={t('products.disableVariants')}
              cancelLabel={t('common.cancel')}
              variant="secondary"
              isDisabled={variants.length > 0}
              onConfirm={disableVariants}
            />
          </HStack>
        </Card>
      )}
    </VStack>
  )
}
