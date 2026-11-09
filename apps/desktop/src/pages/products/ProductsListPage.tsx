import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Link } from '@astryxdesign/core/Link'
import { Pagination } from '@astryxdesign/core/Pagination'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import {
  pixel,
  proportional,
  Table,
  type TableColumn,
  type TableSortComparator,
  useTableSortable,
  useTableSortableState,
} from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ProductThumb } from '../../components/ProductThumb'
import { Page } from '../../components/page/Page'
import { StatTile } from '../../components/page/StatTile'
import { useTranslation } from '../../hooks/useTranslation'
import { formatMoney } from '../../lib/format'
import { hrefFor } from '../../lib/router'
import { toast } from '../../lib/toast'
import { resolveProductImageUrls } from '../../services/product-images'
import { type ProductWithVariants, productService } from '../../services/products-turso'
import {
  categoryLabel,
  categoryOptions,
  effectiveStock,
  matchesSearch,
  type StockLevel,
  stockDot,
  stockLevel,
  stockLevelLabel,
} from './productMeta'
import { type ProductPermissions, useCurrencySymbol, useStableTranslate } from './useProductData'

const PAGE_SIZE = 15

type StatusFilter = 'all' | 'active' | 'inactive'
type StockFilter = 'all' | StockLevel

interface ProductRow extends Record<string, unknown> {
  id: string
  product: ProductWithVariants
  name: string
  category: string
  price: number
  stock: number
}

const COMPARATORS: Partial<Record<string, TableSortComparator<ProductRow>>> = {
  name: (a, b) => a.name.localeCompare(b.name),
  category: (a, b) => a.category.localeCompare(b.category),
  price: (a, b) => a.price - b.price,
  stock: (a, b) => a.stock - b.stock,
}

export default function ProductsListPage({ permissions }: { permissions: ProductPermissions }) {
  const { t } = useTranslation()
  const stableT = useStableTranslate()
  const currencySymbol = useCurrencySymbol()
  const [products, setProducts] = useState<ProductWithVariants[]>([])
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let isCancelled = false
    const load = async () => {
      try {
        const catalog = await productService.getProducts()
        const configurable = catalog.filter((product) => product.variantType === 'configurable')
        const withVariants = await Promise.all(
          configurable.map((product) => productService.getProductWithVariants(product.id).catch(() => null)),
        )
        const byId = new Map(withVariants.filter(Boolean).map((product) => [product?.id, product]))
        if (isCancelled) return
        setProducts(catalog.map((product) => byId.get(product.id) ?? product))

        const keys = Array.from(new Set(catalog.map((product) => product.image?.trim()).filter(Boolean))) as string[]
        if (keys.length > 0) {
          const urls = await resolveProductImageUrls(keys).catch(() => ({}) as Record<string, string>)
          if (!isCancelled) setImageUrls(urls)
        }
      } catch (error) {
        if (!isCancelled) toast.error(error instanceof Error ? error.message : stableT('errors.generic'))
      } finally {
        if (!isCancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      isCancelled = true
    }
  }, [stableT])

  /** Filter setters that also go back to the first page. */
  const filterBy =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value)
      setPage(1)
    }

  const counts = useMemo(() => {
    let active = 0
    let low = 0
    let out = 0
    for (const product of products) {
      if (product.isActive) active += 1
      const level = stockLevel(effectiveStock(product))
      if (level === 'low') low += 1
      if (level === 'out') out += 1
    }
    return { total: products.length, active, low, out }
  }, [products])

  const rows: ProductRow[] = products
    .filter((product) => category === 'all' || product.category === category)
    .filter((product) => statusFilter === 'all' || product.isActive === (statusFilter === 'active'))
    .filter((product) => stockFilter === 'all' || stockLevel(effectiveStock(product)) === stockFilter)
    .filter((product) => matchesSearch(product, query, t))
    .map((product) => ({
      id: product.id,
      product,
      name: product.name,
      category: categoryLabel(product.category, t),
      price: product.minPrice ?? product.price,
      stock: effectiveStock(product),
    }))

  const { sortedData, sortConfig } = useTableSortableState<ProductRow>({ data: rows, comparators: COMPARATORS })
  const sortPlugin = useTableSortable<ProductRow>(sortConfig)
  const pageRows = sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const money = (amount: number) => formatMoney(amount, currencySymbol)

  const columns: TableColumn<ProductRow>[] = [
    {
      key: 'name',
      header: t('products.product'),
      width: proportional(3, { minWidth: 240 }),
      sortable: true,
      renderCell: ({ product }) => (
        <HStack gap={3} vAlign="center">
          <ProductThumb name={product.name} imageUrl={product.image ? imageUrls[product.image] : undefined} size="sm" />
          <VStack gap={0.5}>
            <Link href={hrefFor(`products/${product.id}`)}>
              <Text type="inherit" weight="medium" maxLines={1}>
                {product.name}
              </Text>
            </Link>
            {(product.barcode || product.variantType === 'configurable') && (
              <Text type="supporting" maxLines={1}>
                {[
                  product.barcode,
                  product.variantType === 'configurable'
                    ? t('products.variantCount', { count: product.variantCount ?? 0 })
                    : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )}
          </VStack>
        </HStack>
      ),
    },
    {
      key: 'category',
      header: t('products.category'),
      width: proportional(1, { minWidth: 140 }),
      sortable: true,
      renderCell: (row) => (
        <Text color="secondary" maxLines={1}>
          {row.category}
        </Text>
      ),
    },
    {
      key: 'price',
      header: t('products.price'),
      width: pixel(150),
      align: 'end',
      sortable: true,
      renderCell: ({ product }) => {
        const hasRange =
          product.minPrice !== undefined && product.maxPrice !== undefined && product.minPrice !== product.maxPrice
        return (
          <Text weight="medium" hasTabularNumbers>
            {hasRange
              ? t('products.priceRange', { min: money(product.minPrice ?? 0), max: money(product.maxPrice ?? 0) })
              : money(product.minPrice ?? product.price)}
          </Text>
        )
      },
    },
    {
      key: 'stock',
      header: t('products.stock'),
      width: pixel(130),
      sortable: true,
      renderCell: (row) => {
        const level = stockLevel(row.stock)
        return (
          <HStack gap={2} vAlign="center">
            <StatusDot variant={stockDot(level)} label={stockLevelLabel(level, t)} />
            <Text hasTabularNumbers>{row.stock}</Text>
          </HStack>
        )
      },
    },
    {
      key: 'status',
      header: t('common.status'),
      width: pixel(120),
      renderCell: ({ product }) => {
        const label = product.isActive ? t('products.active') : t('products.inactive')
        return (
          <HStack gap={2} vAlign="center">
            <StatusDot variant={product.isActive ? 'success' : 'neutral'} label={label} />
            <Text>{label}</Text>
          </HStack>
        )
      },
    },
  ]

  const hasFilters = query.trim() !== '' || category !== 'all' || statusFilter !== 'all' || stockFilter !== 'all'
  const clearFilters = () => {
    setPage(1)
    setQuery('')
    setCategory('all')
    setStatusFilter('all')
    setStockFilter('all')
  }

  const usedCategories = useMemo(() => Array.from(new Set(products.map((product) => product.category))), [products])

  return (
    <Page
      title={t('products.title')}
      description={t('products.subtitle')}
      actions={
        permissions.canCreate ? (
          <Button
            label={t('products.newProduct')}
            variant="primary"
            icon={<Plus size={16} />}
            href={hrefFor('products/new')}
          />
        ) : undefined
      }
    >
      <Grid columns={{ minWidth: 180 }} gap={4}>
        <StatTile label={t('products.totalProducts')} value={counts.total} />
        <StatTile label={t('products.activeProducts')} value={counts.active} />
        <StatTile label={t('products.stockLow')} value={counts.low} />
        <StatTile label={t('products.stockOut')} value={counts.out} />
      </Grid>

      <Card padding={0}>
        <VStack>
          <HStack gap={3} vAlign="end" wrap="wrap" padding={4}>
            <StackItem size="fill">
              <TextInput
                label={t('common.search')}
                isLabelHidden
                type="search"
                value={query}
                onChange={filterBy(setQuery)}
                hasClear
                placeholder={t('products.searchPlaceholder')}
                startIcon={Search}
              />
            </StackItem>
            <Selector
              label={t('products.category')}
              isLabelHidden
              value={category}
              onChange={filterBy(setCategory)}
              options={[{ value: 'all', label: t('products.allCategories') }, ...categoryOptions(t, usedCategories)]}
              hasSearch
              width={200}
            />
            <Selector
              label={t('products.stock')}
              isLabelHidden
              value={stockFilter}
              onChange={filterBy((value: string) => setStockFilter(value as StockFilter))}
              options={[
                { value: 'all', label: t('products.allStock') },
                { value: 'in', label: t('products.stockIn') },
                { value: 'low', label: t('products.stockLow') },
                { value: 'out', label: t('products.stockOut') },
              ]}
              width={170}
            />
            <SegmentedControl
              label={t('common.status')}
              value={statusFilter}
              onChange={filterBy((value: string) => setStatusFilter(value as StatusFilter))}
            >
              <SegmentedControlItem value="all" label={t('products.allStatus')} />
              <SegmentedControlItem value="active" label={t('products.active')} />
              <SegmentedControlItem value="inactive" label={t('products.inactive')} />
            </SegmentedControl>
          </HStack>

          {isLoading ? (
            <VStack gap={3} padding={4}>
              <Skeleton height={36} />
              <Skeleton height={36} />
              <Skeleton height={36} />
            </VStack>
          ) : rows.length === 0 ? (
            <VStack padding={6}>
              <EmptyState
                title={hasFilters ? t('products.noMatchingProducts') : t('products.emptyTitle')}
                description={hasFilters ? t('products.noMatchingProductsHint') : t('products.emptyDescription')}
                actions={
                  hasFilters ? (
                    <Button label={t('products.clearFilters')} onClick={clearFilters} />
                  ) : permissions.canCreate ? (
                    <Button label={t('products.newProduct')} variant="primary" href={hrefFor('products/new')} />
                  ) : undefined
                }
              />
            </VStack>
          ) : (
            <Table<ProductRow>
              data={pageRows}
              columns={columns}
              idKey="id"
              density="balanced"
              hasHover
              plugins={{ sort: sortPlugin }}
            />
          )}

          {sortedData.length > PAGE_SIZE && (
            <HStack hAlign="between" vAlign="center" padding={4} wrap="wrap" gap={3}>
              <Text type="supporting">
                {t('products.showingRange', {
                  from: (page - 1) * PAGE_SIZE + 1,
                  to: Math.min(page * PAGE_SIZE, sortedData.length),
                  total: sortedData.length,
                })}
              </Text>
              <Pagination page={page} onChange={setPage} totalItems={sortedData.length} pageSize={PAGE_SIZE} />
            </HStack>
          )}
        </VStack>
      </Card>
    </Page>
  )
}
