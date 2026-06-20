import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import {
  Button,
  MetricCard,
  PageLoader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import {
  type AnalyticsMetrics,
  analyticsService,
  type RecentActivity,
  type SalesByMember,
  type SalesByPeriod,
  type TopProduct,
} from '../services/analytics-turso'
import { companySettingsService } from '../services/company-settings-turso'

export default function Analytics() {
  const { t, getCurrentLocale } = useTranslation()
  const panelClass = 'rounded-cards border border-fog-border bg-canvas '

  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null)
  const [salesByMembers, setSalesByMembers] = useState<SalesByMember[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [salesByPeriod, setSalesByPeriod] = useState<SalesByPeriod[]>([])
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currencySymbol, setCurrencySymbol] = useState('$')

  // Date filters
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'custom'>('30d')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [customDateRange, setCustomDateRange] = useState(false)

  const { hasRole } = useAuth()

  // Check if user is admin
  const isAdmin = hasRole('admin')

  const formatCurrency = (amount: number) => {
    return `${currencySymbol}${amount.toFixed(2)}`
  }

  const getDateRange = () => {
    const now = new Date()
    const start = new Date()

    if (customDateRange && startDate && endDate) {
      return { start: startDate, end: endDate }
    }

    switch (dateRange) {
      case '7d':
        start.setDate(now.getDate() - 7)
        break
      case '30d':
        start.setDate(now.getDate() - 30)
        break
      case '90d':
        start.setDate(now.getDate() - 90)
        break
      default:
        start.setDate(now.getDate() - 30)
    }

    return {
      start: start.toISOString(),
      end: now.toISOString(),
    }
  }

  const loadAnalytics = async () => {
    if (!isAdmin) {
      toast.error(t('analytics.permissionDenied'))
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      const { start, end } = getDateRange()

      const [metricsData, salesData, productsData, periodData, activityData] = await Promise.all([
        analyticsService.getOverallMetrics(start, end),
        analyticsService.getSalesByMembers(start, end),
        analyticsService.getTopProducts(10, start, end),
        analyticsService.getSalesByPeriod('day', start, end),
        analyticsService.getRecentActivity(10),
      ])

      setMetrics(metricsData)
      setSalesByMembers(salesData)
      setTopProducts(productsData)
      setSalesByPeriod(periodData)
      setRecentActivity(activityData)
    } catch (err: unknown) {
      toast.error((err as Error)?.message || t('errors.generic'))
    } finally {
      setIsLoading(false)
    }
  }

  // Currency symbol rarely changes, so load it once instead of on every range change.
  useEffect(() => {
    companySettingsService
      .getSettings()
      .then((settings) => setCurrencySymbol(settings.currencySymbol))
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadAnalytics()
  }, [dateRange, startDate, endDate, isAdmin])

  const handleDateRangeChange = (newRange: '7d' | '30d' | '90d' | 'custom') => {
    setDateRange(newRange)
    setCustomDateRange(newRange === 'custom')
    if (newRange !== 'custom') {
      setStartDate('')
      setEndDate('')
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'order_created':
        return '📝'
      case 'order_completed':
        return '✅'
      case 'order_cancelled':
        return '❌'
      default:
        return '📊'
    }
  }

  // Trend bars: service returns most-recent-first, so reverse to chronological
  // and cap to the most recent buckets to keep the chart readable.
  const trendBuckets = [...salesByPeriod].reverse().slice(-30)
  const maxTrendRevenue = trendBuckets.reduce((max, b) => Math.max(max, b.revenue), 0)
  const formatPeriodLabel = (period: string) => {
    const parsed = new Date(period)
    if (Number.isNaN(parsed.getTime())) return period
    return new Intl.DateTimeFormat(getCurrentLocale(), { month: 'short', day: 'numeric' }).format(parsed)
  }

  const profitMargin = metrics && metrics.totalRevenue > 0 ? (metrics.totalProfit / metrics.totalRevenue) * 100 : 0

  if (!isAdmin) {
    return (
      <div class="max-w-6xl mx-auto">
        <div class={`${panelClass} p-12`}>
          <div class="text-center">
            <div class="text-6xl mb-6 drop-shadow-sm">🔒</div>
            <h2 class="text-lg font-semibold mb-3 text-void ">{t('errors.unauthorized')}</h2>
            <p class="text-graphite max-w-md mx-auto">{t('analytics.adminOnly')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <PageLoader message={t('analytics.loadingAnalytics')} />
  }

  return (
    <div class="max-w-6xl mx-auto">
      <div class="flex justify-end mb-6">
        <Button class="w-full sm:w-auto" onClick={loadAnalytics} disabled={isLoading}>
          {t('analytics.refreshData')}
        </Button>
      </div>

      {/* Date Range Filters */}
      <div class={`${panelClass} p-6 mb-6`}>
        <h3 class="text-lg font-semibold text-void mb-4">{t('analytics.dateRange')}</h3>
        <div class="flex flex-wrap gap-4 items-end">
          <div class="flex-1 min-w-48">
            <Select
              label={t('analytics.timePeriod')}
              value={dateRange}
              onChange={(e) =>
                handleDateRangeChange((e.target as HTMLSelectElement).value as '7d' | '30d' | '90d' | 'custom')
              }
              options={[
                { value: '7d', label: t('analytics.last7Days') },
                { value: '30d', label: t('analytics.last30Days') },
                { value: '90d', label: t('analytics.last90Days') },
                { value: 'custom', label: t('analytics.customRange') },
              ]}
            />
          </div>
          {customDateRange && (
            <>
              <div class="flex-1 min-w-40">
                <label for="analytics-start-date" class="block text-sm font-medium text-void mb-2">
                  {t('analytics.startDate')}
                </label>
                <input
                  id="analytics-start-date"
                  type="date"
                  value={startDate}
                  onInput={(e) => setStartDate((e.target as HTMLInputElement).value)}
                  class="w-full rounded-cards border border-fog-border bg-canvas px-4 py-2.5 text-sm text-void focus:border-fog-border focus:outline-none focus:ring-2 focus:ring-void "
                />
              </div>
              <div class="flex-1 min-w-40">
                <label for="analytics-end-date" class="block text-sm font-medium text-void mb-2">
                  {t('analytics.endDate')}
                </label>
                <input
                  id="analytics-end-date"
                  type="date"
                  value={endDate}
                  onInput={(e) => setEndDate((e.target as HTMLInputElement).value)}
                  class="w-full rounded-cards border border-fog-border bg-canvas px-4 py-2.5 text-sm text-void focus:border-fog-border focus:outline-none focus:ring-2 focus:ring-void "
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      {metrics && (
        <>
          <div class="mb-3 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
            <MetricCard label={t('analytics.totalRevenue')} value={formatCurrency(metrics.totalRevenue)} />
            <MetricCard
              label={t('analytics.totalProfit')}
              value={formatCurrency(metrics.totalProfit)}
              description={t('analytics.margin', { value: profitMargin.toFixed(1) })}
            />
            <MetricCard label={t('analytics.completedOrders')} value={metrics.completedOrders} />
            <MetricCard label={t('analytics.averageOrderValue')} value={formatCurrency(metrics.averageOrderValue)} />
          </div>

          {/* Order status breakdown */}
          <div class="mb-6 grid grid-cols-2 gap-3 sm:gap-6">
            <MetricCard label={t('analytics.pendingOrders')} value={metrics.pendingOrders} />
            <MetricCard label={t('analytics.cancelledOrders')} value={metrics.cancelledOrders} />
          </div>
        </>
      )}

      {/* Sales Trend */}
      <div class={`${panelClass} p-6 mb-6`}>
        <h3 class="text-lg font-semibold text-void mb-4">{t('analytics.salesTrends')}</h3>
        {trendBuckets.length > 0 ? (
          <div class="flex h-40 items-end gap-1">
            {trendBuckets.map((bucket) => (
              <div
                key={bucket.period}
                class="flex h-full flex-1 items-end"
                title={`${formatPeriodLabel(bucket.period)} • ${formatCurrency(bucket.revenue)} • ${bucket.orders} ${t('analytics.orders').toLowerCase()}`}
              >
                <div
                  class="w-full rounded-t-sm bg-void transition-all hover:opacity-80"
                  style={{
                    height: maxTrendRevenue > 0 ? `${Math.max((bucket.revenue / maxTrendRevenue) * 100, 2)}%` : '2%',
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div class="py-8 text-center text-graphite ">
            <div class="text-4xl mb-2">📈</div>
            <p>{t('analytics.noData')}</p>
          </div>
        )}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Sales by Members */}
        <div class={`${panelClass} overflow-hidden`}>
          <div class="p-6 border-b border-fog-border ">
            <h3 class="text-lg font-semibold text-void ">{t('analytics.salesByMembers')}</h3>
          </div>
          <div class="max-h-96 overflow-y-auto">
            <Table striped>
              <TableHead>
                <TableRow class="bg-chalk ">
                  <TableHeader class="font-semibold">{t('analytics.member')}</TableHeader>
                  <TableHeader class="font-semibold">{t('analytics.orders')}</TableHeader>
                  <TableHeader class="font-semibold">{t('analytics.revenue')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {salesByMembers.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell>
                      <div class="flex items-center">
                        <div class="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-chalk text-sm font-semibold text-void ">
                          {member.userName.charAt(0).toUpperCase()}
                        </div>
                        <div class="font-medium text-void ">{member.userName}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div class="font-semibold text-void ">{member.totalOrders}</div>
                    </TableCell>
                    <TableCell>
                      <div class="font-semibold text-void ">{formatCurrency(member.totalRevenue)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {salesByMembers.length === 0 && (
              <div class="p-8 text-center text-graphite ">
                <div class="text-4xl mb-2">👥</div>
                <p>{t('analytics.noSalesData')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Top Products */}
        <div class={`${panelClass} overflow-hidden`}>
          <div class="p-6 border-b border-fog-border ">
            <h3 class="text-lg font-semibold text-void ">{t('analytics.topProducts')}</h3>
          </div>
          <div class="max-h-96 overflow-y-auto">
            <Table striped>
              <TableHead>
                <TableRow class="bg-chalk ">
                  <TableHeader class="font-semibold">{t('analytics.product')}</TableHeader>
                  <TableHeader class="font-semibold">{t('analytics.sold')}</TableHeader>
                  <TableHeader class="font-semibold">{t('analytics.revenue')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {topProducts.map((product, index) => (
                  <TableRow key={product.productId}>
                    <TableCell>
                      <div class="flex items-center">
                        <div class="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-chalk text-sm font-semibold text-void ">
                          {index + 1}
                        </div>
                        <div class="font-medium text-void ">{product.productName}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div class="font-semibold text-void ">{product.totalSold}</div>
                    </TableCell>
                    <TableCell>
                      <div class="font-semibold text-void ">{formatCurrency(product.totalRevenue)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {topProducts.length === 0 && (
              <div class="p-8 text-center text-graphite ">
                <div class="text-4xl mb-2">📦</div>
                <p>{t('analytics.noProductSales')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div class={`${panelClass} p-6`}>
        <h3 class="text-lg font-semibold text-void mb-4">{t('analytics.recentActivity')}</h3>
        <div class="space-y-3 max-h-96 overflow-y-auto">
          {recentActivity.map((activity) => (
            <div
              key={`${activity.id}-${activity.type}`}
              class="flex items-center justify-between rounded-cards border border-fog-border bg-chalk p-3 "
            >
              <div class="flex items-center">
                <span class="text-xl mr-3">{getActivityIcon(activity.type)}</span>
                <div>
                  <div class="font-medium text-void ">{activity.description}</div>
                  <div class="text-sm text-graphite ">
                    {t('analytics.by')} {activity.userName} • {new Date(activity.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
              {activity.amount && <div class="font-semibold text-void ">{formatCurrency(activity.amount)}</div>}
            </div>
          ))}
        </div>
        {recentActivity.length === 0 && (
          <div class="py-8 text-center text-graphite ">
            <div class="text-4xl mb-2">🕒</div>
            <p>{t('analytics.noRecentActivity')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
