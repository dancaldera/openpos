import { Button } from '@astryxdesign/core/Button'
import type { ISODateString } from '@astryxdesign/core/Calendar'
import { Card } from '@astryxdesign/core/Card'
import { DateInput } from '@astryxdesign/core/DateInput'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { pixel, proportional, Table, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ProductThumb } from '../components/ProductThumb'
import { Page } from '../components/page/Page'
import { useTranslation } from '../hooks/useTranslation'
import { formatDate, formatMoney, formatTime, shortId } from '../lib/format'
import { hrefFor } from '../lib/router'
import { toast } from '../lib/toast'
import { companySettingsService } from '../services/company-settings-turso'
import { type DashboardStats, dashboardService, type TopProduct } from '../services/dashboard-turso'
import type { Order } from '../services/orders-turso'
import { resolveProductImageUrls } from '../services/product-images'
import { type Product, productService } from '../services/products-turso'
import {
  fromISODate,
  InsightSection,
  LinkedStat,
  RowsSkeleton,
  StatGridSkeleton,
  toISODate,
} from './insights/InsightParts'
import { type OrderStatus, orderStatusDot, orderStatusLabel } from './orders/orderMeta'

/** Same threshold the dashboard stats query uses for "low stock". */
const LOW_STOCK_THRESHOLD = 10
const RECENT_ORDER_LIMIT = 6
const LIST_LIMIT = 5

interface RecentOrderRow extends Record<string, unknown> {
  id: string
  createdAt: string
  itemSummary: string
  status: OrderStatus
  amount: number
}

interface Overview {
  recentOrders: Order[]
  lowStock: Product[]
  topProducts: TopProduct[]
  imageUrls: Record<string, string>
}

const EMPTY_OVERVIEW: Overview = { recentOrders: [], lowStock: [], topProducts: [], imageUrls: {} }

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export default function Dashboard() {
  const { t } = useTranslation()
  const today = toISODate(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isStatsLoading, setIsStatsLoading] = useState(true)
  const [overview, setOverview] = useState<Overview>(EMPTY_OVERVIEW)
  const [isOverviewLoading, setIsOverviewLoading] = useState(true)
  const [currencySymbol, setCurrencySymbol] = useState('$')
  const [taxEnabled, setTaxEnabled] = useState(true)

  useEffect(() => {
    companySettingsService
      .getSettings()
      .then((settings) => {
        setCurrencySymbol(settings.currencySymbol)
        setTaxEnabled(settings.taxEnabled)
      })
      .catch(() => {})
  }, [])

  // Day figures follow the selected date.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `t` is recreated every render; the locale does not change these queries.
  useEffect(() => {
    let isCancelled = false
    setIsStatsLoading(true)
    dashboardService
      .getDashboardStats({ referenceDate: fromISODate(selectedDate) })
      .then((result) => {
        if (!isCancelled) setStats(result)
      })
      .catch((error: unknown) => {
        if (!isCancelled) toast.error(errorMessage(error, t('errors.generic')))
      })
      .finally(() => {
        if (!isCancelled) setIsStatsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [selectedDate])

  // Recent orders, stock and best sellers are not tied to a single day.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `t` is recreated every render; the locale does not change these queries.
  useEffect(() => {
    let isCancelled = false
    const load = async () => {
      try {
        const [recentOrders, products, topProducts] = await Promise.all([
          dashboardService.getRecentOrders(RECENT_ORDER_LIMIT),
          productService.getProducts(),
          dashboardService.getTopProducts(LIST_LIMIT),
        ])
        const lowStock = products
          .filter((product) => product.isActive && product.stock > 0 && product.stock < LOW_STOCK_THRESHOLD)
          .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name))
          .slice(0, LIST_LIMIT)
        const imageKeys = Array.from(
          new Set(lowStock.map((product) => product.image?.trim()).filter(Boolean)),
        ) as string[]
        const imageUrls = imageKeys.length > 0 ? await resolveProductImageUrls(imageKeys).catch(() => ({})) : {}
        if (!isCancelled) setOverview({ recentOrders, lowStock, topProducts, imageUrls })
      } catch (error) {
        if (!isCancelled) toast.error(errorMessage(error, t('errors.generic')))
      } finally {
        if (!isCancelled) setIsOverviewLoading(false)
      }
    }
    void load()
    return () => {
      isCancelled = true
    }
  }, [])

  const money = (amount: number) => formatMoney(amount, currencySymbol)
  const isToday = selectedDate === today

  const recentRows = useMemo<RecentOrderRow[]>(
    () =>
      overview.recentOrders.map((order) => ({
        id: order.id,
        createdAt: order.createdAt,
        itemSummary: order.items.map((item) => item.productName).join(', '),
        status: order.status,
        amount: taxEnabled ? order.total : order.subtotal,
      })),
    [overview.recentOrders, taxEnabled],
  )

  const recentColumns: TableColumn<RecentOrderRow>[] = [
    {
      key: 'reference',
      header: t('orders.orderHeader'),
      width: pixel(120),
      renderCell: (row) => (
        <Link href={hrefFor(`orders/${row.id}`)}>
          <Text type="inherit" weight="medium" hasTabularNumbers>
            #{shortId(row.id)}
          </Text>
        </Link>
      ),
    },
    {
      key: 'date',
      header: t('common.date'),
      width: pixel(150),
      renderCell: (row) => (
        <VStack gap={0.5}>
          <Text>{formatDate(row.createdAt)}</Text>
          <Text type="supporting">{formatTime(row.createdAt)}</Text>
        </VStack>
      ),
    },
    {
      key: 'items',
      header: t('orders.items'),
      width: proportional(1, { minWidth: 180 }),
      renderCell: (row) => <Text maxLines={1}>{row.itemSummary}</Text>,
    },
    {
      key: 'status',
      header: t('common.status'),
      width: pixel(130),
      renderCell: (row) => (
        <HStack gap={2} vAlign="center">
          <StatusDot variant={orderStatusDot(row.status)} label={orderStatusLabel(row.status, t)} />
          <Text>{orderStatusLabel(row.status, t)}</Text>
        </HStack>
      ),
    },
    {
      key: 'total',
      header: t('common.total'),
      width: pixel(120),
      align: 'end',
      renderCell: (row) => (
        <Text weight="medium" hasTabularNumbers>
          {money(row.amount)}
        </Text>
      ),
    },
  ]

  const maxSold = overview.topProducts.reduce((max, product) => Math.max(max, product.sales), 0)

  return (
    <Page
      title={t('dashboard.title')}
      description={t('insights.dashboardDescription')}
      actions={
        <>
          {!isToday && <Button label={t('dates.today')} variant="ghost" onClick={() => setSelectedDate(today)} />}
          <DateInput
            label={t('insights.reportDate')}
            isLabelHidden
            value={selectedDate as ISODateString}
            onChange={(value) => setSelectedDate(value ?? today)}
            max={today as ISODateString}
            format="date"
            width={180}
          />
          <Button
            label={t('orders.newOrder')}
            variant="primary"
            icon={<Plus size={16} />}
            href={hrefFor('orders/new')}
          />
        </>
      }
    >
      {isStatsLoading || !stats ? (
        <StatGridSkeleton count={5} />
      ) : (
        <Grid columns={{ minWidth: 180 }} gap={4}>
          <LinkedStat
            label={t('insights.sales')}
            value={money(stats.totalSales)}
            detail={t('insights.salesDetail')}
            href={hrefFor('orders')}
          />
          <LinkedStat
            label={t('insights.orders')}
            value={stats.ordersToday}
            detail={isToday ? t('insights.ordersTodayDetail') : formatDate(fromISODate(selectedDate))}
            href={hrefFor('orders')}
          />
          <LinkedStat
            label={t('insights.averageOrder')}
            value={money(stats.averageOrderValue)}
            detail={t('insights.averageOrderDetail')}
            href={hrefFor('orders')}
          />
          <LinkedStat
            label={t('insights.pendingOrders')}
            value={stats.pendingOrders}
            detail={t('insights.pendingOrdersDetail')}
            href={hrefFor('orders')}
          />
          <LinkedStat
            label={t('insights.lowStock')}
            value={stats.lowStockProducts}
            detail={t('insights.lowStockDetail', { count: LOW_STOCK_THRESHOLD })}
            href={hrefFor('products')}
          />
        </Grid>
      )}

      <InsightSection
        title={t('insights.recentOrders')}
        action={<Link href={hrefFor('orders')}>{t('insights.viewAllOrders')}</Link>}
      >
        {isOverviewLoading ? (
          <RowsSkeleton rows={4} />
        ) : recentRows.length === 0 ? (
          <Card>
            <EmptyState
              isCompact
              title={t('insights.noRecentOrders')}
              description={t('insights.noRecentOrdersHint')}
              actions={<Button label={t('orders.newOrder')} variant="primary" href={hrefFor('orders/new')} />}
            />
          </Card>
        ) : (
          <Card padding={0}>
            <Table<RecentOrderRow> data={recentRows} columns={recentColumns} idKey="id" density="balanced" hasHover />
          </Card>
        )}
      </InsightSection>

      <Grid columns={{ minWidth: 340 }} gap={6} align="start">
        <InsightSection
          title={t('insights.lowStockProducts')}
          description={t('insights.lowStockDetail', { count: LOW_STOCK_THRESHOLD })}
          action={<Link href={hrefFor('products')}>{t('insights.viewAllProducts')}</Link>}
        >
          {isOverviewLoading ? (
            <RowsSkeleton rows={3} />
          ) : overview.lowStock.length === 0 ? (
            <Card>
              <EmptyState
                isCompact
                title={t('insights.noLowStock')}
                description={t('insights.noLowStockHint', { count: LOW_STOCK_THRESHOLD })}
              />
            </Card>
          ) : (
            <Card>
              <List hasDividers edge="outset">
                {overview.lowStock.map((product) => (
                  <ListItem
                    key={product.id}
                    href={hrefFor(`products/${product.id}`)}
                    label={product.name}
                    description={product.category}
                    startContent={
                      <ProductThumb
                        name={product.name}
                        imageUrl={product.image ? overview.imageUrls[product.image.trim()] : undefined}
                        size="sm"
                      />
                    }
                    endContent={
                      <HStack gap={2} vAlign="center">
                        <StatusDot variant="warning" label={t('insights.lowStock')} />
                        <Text hasTabularNumbers>{t('insights.unitsLeft', { count: product.stock })}</Text>
                      </HStack>
                    }
                  />
                ))}
              </List>
            </Card>
          )}
        </InsightSection>

        <InsightSection title={t('insights.topProducts')} description={t('insights.topProductsHint')}>
          {isOverviewLoading ? (
            <RowsSkeleton rows={3} />
          ) : overview.topProducts.length === 0 ? (
            <Card>
              <EmptyState isCompact title={t('insights.noTopProducts')} description={t('insights.noTopProductsHint')} />
            </Card>
          ) : (
            <Card>
              <List hasDividers edge="outset">
                {overview.topProducts.map((product) => (
                  <ListItem
                    key={product.id}
                    href={hrefFor(`products/${product.id}`)}
                    label={product.name}
                    description={
                      <VStack gap={1}>
                        <ProgressBar
                          label={t('insights.unitsSold', { count: product.sales })}
                          isLabelHidden
                          value={product.sales}
                          max={maxSold || 1}
                        />
                        <Text type="supporting" hasTabularNumbers>
                          {t('insights.unitsSold', { count: product.sales })}
                        </Text>
                      </VStack>
                    }
                    endContent={
                      <Text weight="medium" hasTabularNumbers>
                        {money(product.revenue)}
                      </Text>
                    }
                  />
                ))}
              </List>
            </Card>
          )}
        </InsightSection>
      </Grid>
    </Page>
  )
}
