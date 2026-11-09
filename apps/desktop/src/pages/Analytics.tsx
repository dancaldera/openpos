import { Avatar } from '@astryxdesign/core/Avatar'
import { Button } from '@astryxdesign/core/Button'
import type { ISODateString } from '@astryxdesign/core/Calendar'
import { Card } from '@astryxdesign/core/Card'
import { type DateRange, DateRangeInput } from '@astryxdesign/core/DateRangeInput'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Grid } from '@astryxdesign/core/Grid'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { StatusDot, type StatusDotVariant } from '@astryxdesign/core/StatusDot'
import { pixel, proportional, Table, type TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Lock, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Page } from '../components/page/Page'
import { StatTile } from '../components/page/StatTile'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { formatDateTime, formatMoney, shortId } from '../lib/format'
import { hrefFor } from '../lib/router'
import { toast } from '../lib/toast'
import {
  type AnalyticsMetrics,
  analyticsService,
  type RecentActivity,
  type SalesByMember,
  type SalesByPeriod,
  type TopProduct,
} from '../services/analytics-turso'
import { companySettingsService } from '../services/company-settings-turso'
import { fromISODate, InsightSection, RowsSkeleton, StatGridSkeleton, toISODate } from './insights/InsightParts'
import { SalesTrendChart, type TrendBucket } from './insights/SalesTrendChart'

type RangePreset = '7d' | '30d' | '90d' | 'custom'

const PRESET_DAYS: Record<Exclude<RangePreset, 'custom'>, number> = { '7d': 7, '30d': 30, '90d': 90 }
const TOP_PRODUCT_LIMIT = 10
const ACTIVITY_LIMIT = 10
/** Longest stretch of days the trend chart draws, so bars stay readable. */
const MAX_TREND_DAYS = 120

interface AnalyticsData {
  metrics: AnalyticsMetrics | null
  members: SalesByMember[]
  topProducts: TopProduct[]
  periods: SalesByPeriod[]
  activity: RecentActivity[]
}

const EMPTY_DATA: AnalyticsData = { metrics: null, members: [], topProducts: [], periods: [], activity: [] }

interface MemberRow extends Record<string, unknown> {
  id: string
  name: string
  orders: number
  revenue: number
}

interface ProductRow extends Record<string, unknown> {
  id: string
  rank: number
  name: string
  sold: number
  revenue: number
}

const ACTIVITY: Record<RecentActivity['type'], { dot: StatusDotVariant; event: string; title: string }> = {
  order_created: { dot: 'warning', event: 'insights.eventCreated', title: 'insights.activityCreated' },
  order_completed: { dot: 'success', event: 'insights.eventCompleted', title: 'insights.activityCompleted' },
  order_cancelled: { dot: 'neutral', event: 'insights.eventCancelled', title: 'insights.activityCancelled' },
}

function daysAgo(days: number): DateRange {
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - days)
  return { start: toISODate(start) as ISODateString, end: toISODate(end) as ISODateString }
}

/** ISO bounds the analytics queries take for a preset or a custom calendar range. */
function rangeBounds(preset: RangePreset, custom: DateRange | null): { start: string; end: string } {
  if (preset === 'custom' && custom) {
    const start = fromISODate(custom.start)
    const endDay = fromISODate(custom.end)
    const end = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() + 1)
    return { start: start.toISOString(), end: end.toISOString() }
  }
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - (preset === 'custom' ? PRESET_DAYS['30d'] : PRESET_DAYS[preset]))
  return { start: start.toISOString(), end: now.toISOString() }
}

/**
 * One bucket per calendar day between the bounds, so quiet days show as gaps
 * instead of disappearing. Days come from SQLite `DATE(created_at)`, which is UTC.
 */
function fillDays(periods: SalesByPeriod[], bounds: { start: string; end: string }): TrendBucket[] {
  const byDay = new Map(periods.map((period) => [period.period, period]))
  const buckets: TrendBucket[] = []
  const cursor = new Date(`${bounds.start.slice(0, 10)}T00:00:00.000Z`)
  const last = new Date(`${bounds.end.slice(0, 10)}T00:00:00.000Z`)
  while (cursor <= last) {
    const day = cursor.toISOString().slice(0, 10)
    const period = byDay.get(day)
    buckets.push({ day, revenue: period?.revenue ?? 0, orders: period?.orders ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return buckets.slice(-MAX_TREND_DAYS)
}

/** SQLite `SUM` over no rows is NULL, so empty periods come back with null counts. */
function withZeroes(metrics: AnalyticsMetrics): AnalyticsMetrics {
  return Object.fromEntries(
    Object.entries(metrics).map(([key, value]) => [key, typeof value === 'number' ? value : 0]),
  ) as unknown as AnalyticsMetrics
}

export default function Analytics() {
  const { t, getCurrentLocale } = useTranslation()
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')

  const [preset, setPreset] = useState<RangePreset>('30d')
  const [customRange, setCustomRange] = useState<DateRange | null>(null)
  const [data, setData] = useState<AnalyticsData>(EMPTY_DATA)
  const [isLoading, setIsLoading] = useState(true)
  const [currencySymbol, setCurrencySymbol] = useState('$')
  const requestId = useRef(0)

  const bounds = useMemo(() => rangeBounds(preset, customRange), [preset, customRange])

  // Currency symbol rarely changes, so load it once instead of on every range change.
  useEffect(() => {
    companySettingsService
      .getSettings()
      .then((settings) => setCurrencySymbol(settings.currencySymbol))
      .catch(() => {})
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `t` is recreated every render; the locale does not change these queries.
  const load = useCallback(async () => {
    if (!isAdmin) {
      setIsLoading(false)
      return
    }
    const current = ++requestId.current
    setIsLoading(true)
    try {
      const [metrics, members, topProducts, periods, activity] = await Promise.all([
        analyticsService.getOverallMetrics(bounds.start, bounds.end),
        analyticsService.getSalesByMembers(bounds.start, bounds.end),
        analyticsService.getTopProducts(TOP_PRODUCT_LIMIT, bounds.start, bounds.end),
        analyticsService.getSalesByPeriod('day', bounds.start, bounds.end),
        analyticsService.getRecentActivity(ACTIVITY_LIMIT),
      ])
      if (current === requestId.current) {
        setData({ metrics: withZeroes(metrics), members, topProducts, periods, activity })
      }
    } catch (error) {
      if (current === requestId.current) toast.error(error instanceof Error ? error.message : t('errors.generic'))
    } finally {
      if (current === requestId.current) setIsLoading(false)
    }
  }, [bounds, isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  const money = (amount: number) => formatMoney(amount, currencySymbol)

  const formatDay = (day: string) =>
    new Intl.DateTimeFormat(getCurrentLocale(), { month: 'short', day: 'numeric' }).format(fromISODate(day))

  const trend = useMemo(() => fillDays(data.periods, bounds), [data.periods, bounds])
  const trendTotal = trend.reduce((sum, bucket) => sum + bucket.revenue, 0)

  const memberRows = useMemo<MemberRow[]>(
    () =>
      data.members.map((member) => ({
        id: member.userId,
        name: member.userName,
        orders: member.totalOrders,
        revenue: member.totalRevenue,
      })),
    [data.members],
  )
  const memberRevenue = memberRows.reduce((sum, row) => sum + row.revenue, 0)

  const productRows = useMemo<ProductRow[]>(
    () =>
      data.topProducts.map((product, index) => ({
        id: product.productId,
        rank: index + 1,
        name: product.productName,
        sold: product.totalSold,
        revenue: product.totalRevenue,
      })),
    [data.topProducts],
  )

  if (!isAdmin) {
    return (
      <Page title={t('analytics.title')}>
        <Card>
          <EmptyState
            icon={<Lock size={24} />}
            title={t('insights.adminOnlyTitle')}
            description={t('insights.adminOnlyDescription')}
          />
        </Card>
      </Page>
    )
  }

  const metrics = data.metrics
  const profitMargin = metrics && metrics.totalRevenue > 0 ? (metrics.totalProfit / metrics.totalRevenue) * 100 : 0

  const memberColumns: TableColumn<MemberRow>[] = [
    {
      key: 'name',
      header: t('insights.member'),
      width: proportional(1, { minWidth: 160 }),
      renderCell: (row) => (
        <HStack gap={2} vAlign="center">
          <Avatar name={row.name} size="sm" tooltip={false} />
          <Text maxLines={1}>{row.name}</Text>
        </HStack>
      ),
    },
    {
      key: 'orders',
      header: t('insights.ordersColumn'),
      width: pixel(90),
      align: 'end',
      renderCell: (row) => <Text hasTabularNumbers>{row.orders}</Text>,
    },
    {
      key: 'revenue',
      header: t('insights.revenue'),
      width: pixel(150),
      renderCell: (row) => (
        <VStack gap={1}>
          <Text weight="medium" hasTabularNumbers>
            {money(row.revenue)}
          </Text>
          <ProgressBar
            label={t('insights.shareOfRevenue', {
              value: memberRevenue > 0 ? ((row.revenue / memberRevenue) * 100).toFixed(0) : '0',
            })}
            isLabelHidden
            value={row.revenue}
            max={memberRevenue || 1}
          />
        </VStack>
      ),
    },
  ]

  const productColumns: TableColumn<ProductRow>[] = [
    {
      key: 'rank',
      header: '#',
      width: pixel(48),
      renderCell: (row) => (
        <Text color="secondary" hasTabularNumbers>
          {row.rank}
        </Text>
      ),
    },
    {
      key: 'name',
      header: t('insights.product'),
      width: proportional(1, { minWidth: 160 }),
      renderCell: (row) => (
        <Link href={hrefFor(`products/${row.id}`)}>
          <Text type="inherit" maxLines={1}>
            {row.name}
          </Text>
        </Link>
      ),
    },
    {
      key: 'sold',
      header: t('insights.sold'),
      width: pixel(80),
      align: 'end',
      renderCell: (row) => <Text hasTabularNumbers>{row.sold}</Text>,
    },
    {
      key: 'revenue',
      header: t('insights.revenue'),
      width: pixel(120),
      align: 'end',
      renderCell: (row) => (
        <Text weight="medium" hasTabularNumbers>
          {money(row.revenue)}
        </Text>
      ),
    },
  ]

  return (
    <Page
      title={t('analytics.title')}
      description={t('insights.analyticsDescription')}
      actions={<Button label={t('insights.refresh')} icon={<RefreshCw size={16} />} clickAction={load} />}
    >
      <HStack gap={3} vAlign="end" wrap="wrap">
        <SegmentedControl
          label={t('insights.period')}
          value={preset}
          onChange={(value) => {
            const next = value as RangePreset
            setPreset(next)
            if (next === 'custom' && !customRange) setCustomRange(daysAgo(PRESET_DAYS['30d']))
          }}
        >
          <SegmentedControlItem value="7d" label={t('insights.last7Days')} />
          <SegmentedControlItem value="30d" label={t('insights.last30Days')} />
          <SegmentedControlItem value="90d" label={t('insights.last90Days')} />
          <SegmentedControlItem value="custom" label={t('insights.customRange')} />
        </SegmentedControl>
        {preset === 'custom' && (
          <DateRangeInput
            label={t('insights.dateRange')}
            isLabelHidden
            value={customRange}
            onChange={(value) => setCustomRange(value ?? daysAgo(PRESET_DAYS['30d']))}
            max={toISODate(new Date()) as ISODateString}
            hasClear={false}
            width={300}
          />
        )}
      </HStack>

      {isLoading || !metrics ? (
        <StatGridSkeleton count={6} minWidth={160} />
      ) : (
        <Grid columns={{ minWidth: 160 }} gap={4}>
          <StatTile label={t('insights.revenue')} value={money(metrics.totalRevenue)} />
          <StatTile
            label={t('insights.profit')}
            value={money(metrics.totalProfit)}
            detail={t('insights.marginDetail', { value: profitMargin.toFixed(1) })}
          />
          <StatTile label={t('insights.completedOrders')} value={metrics.completedOrders} />
          <StatTile label={t('insights.averageOrder')} value={money(metrics.averageOrderValue)} />
          <StatTile label={t('insights.pendingOrders')} value={metrics.pendingOrders} />
          <StatTile label={t('insights.cancelledOrders')} value={metrics.cancelledOrders} />
        </Grid>
      )}

      <InsightSection title={t('insights.salesTrend')} description={t('insights.salesTrendHint')}>
        <Card>
          {isLoading ? (
            <Skeleton height={200} />
          ) : trendTotal === 0 ? (
            <EmptyState
              isCompact
              title={t('insights.noSalesInPeriod')}
              description={t('insights.noSalesInPeriodHint')}
            />
          ) : (
            <SalesTrendChart
              buckets={trend}
              label={t('insights.chartSummary', { days: trend.length, total: money(trendTotal) })}
              formatDay={formatDay}
              formatValue={money}
              describeBucket={(bucket) =>
                t('insights.trendBar', {
                  date: formatDay(bucket.day),
                  revenue: money(bucket.revenue),
                  count: bucket.orders,
                })
              }
            />
          )}
        </Card>
      </InsightSection>

      <Grid columns={{ minWidth: 380 }} gap={6} align="start">
        <InsightSection title={t('insights.salesByMember')}>
          {isLoading ? (
            <RowsSkeleton rows={3} />
          ) : memberRows.length === 0 ? (
            <Card>
              <EmptyState isCompact title={t('insights.noMemberSales')} />
            </Card>
          ) : (
            <Card padding={0}>
              <Table<MemberRow> data={memberRows} columns={memberColumns} idKey="id" density="balanced" />
            </Card>
          )}
        </InsightSection>

        <InsightSection title={t('insights.topProducts')} description={t('insights.topProductsByUnits')}>
          {isLoading ? (
            <RowsSkeleton rows={3} />
          ) : productRows.length === 0 ? (
            <Card>
              <EmptyState isCompact title={t('insights.noProductSales')} />
            </Card>
          ) : (
            <Card padding={0}>
              <Table<ProductRow> data={productRows} columns={productColumns} idKey="id" density="balanced" />
            </Card>
          )}
        </InsightSection>
      </Grid>

      <InsightSection title={t('insights.recentActivity')}>
        {isLoading ? (
          <RowsSkeleton rows={4} />
        ) : data.activity.length === 0 ? (
          <Card>
            <EmptyState isCompact title={t('insights.noRecentActivity')} />
          </Card>
        ) : (
          <Card>
            <List hasDividers edge="outset">
              {data.activity.map((activity) => (
                <ListItem
                  key={`${activity.id}-${activity.type}`}
                  href={hrefFor(`orders/${activity.id}`)}
                  startContent={
                    <StatusDot variant={ACTIVITY[activity.type].dot} label={t(ACTIVITY[activity.type].event)} />
                  }
                  label={t(ACTIVITY[activity.type].title, { id: shortId(activity.id) })}
                  description={
                    activity.userName
                      ? t('insights.activityBy', { user: activity.userName, time: formatDateTime(activity.timestamp) })
                      : formatDateTime(activity.timestamp)
                  }
                  endContent={
                    activity.amount !== undefined ? (
                      <Text weight="medium" hasTabularNumbers>
                        {money(activity.amount)}
                      </Text>
                    ) : undefined
                  }
                />
              ))}
            </List>
          </Card>
        )}
      </InsightSection>
    </Page>
  )
}
