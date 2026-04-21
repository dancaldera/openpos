import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import {
  Button,
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
  type TopProduct,
} from '../services/analytics-turso'
import { companySettingsService } from '../services/company-settings-turso'

export default function Analytics() {
  const { t } = useTranslation()
  const panelClass = 'rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
  const metricCardClass = 'rounded-xl border p-6 transition-colors'

  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null)
  const [salesByMembers, setSalesByMembers] = useState<SalesByMember[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
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
      toast.error("You don't have permission to view analytics")
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      const { start, end } = getDateRange()

      const [metricsData, salesData, productsData, activityData, settings] = await Promise.all([
        analyticsService.getOverallMetrics(start, end),
        analyticsService.getSalesByMembers(start, end),
        analyticsService.getTopProducts(10, start, end),
        analyticsService.getRecentActivity(10),
        companySettingsService.getSettings(),
      ])

      setMetrics(metricsData)
      setSalesByMembers(salesData)
      setTopProducts(productsData)
      setRecentActivity(activityData)
      setCurrencySymbol(settings.currencySymbol)
    } catch (err: unknown) {
      toast.error((err as Error)?.message || 'Failed to load analytics')
    } finally {
      setIsLoading(false)
    }
  }

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

  if (!isAdmin) {
    return (
      <div class="max-w-6xl mx-auto">
        <div class={`${panelClass} p-12`}>
          <div class="text-center">
            <div class="text-6xl mb-6 drop-shadow-lg">🔒</div>
            <h2 class="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">{t('errors.unauthorized')}</h2>
            <p class="text-gray-600 dark:text-gray-400 max-w-md mx-auto">{t('analytics.adminOnly')}</p>
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
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('analytics.dateRange')}</h3>
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
                <label
                  for="analytics-start-date"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  {t('analytics.startDate')}
                </label>
                <input
                  id="analytics-start-date"
                  type="date"
                  value={startDate}
                  onInput={(e) => setStartDate((e.target as HTMLInputElement).value)}
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <div class="flex-1 min-w-40">
                <label for="analytics-end-date" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('analytics.endDate')}
                </label>
                <input
                  id="analytics-end-date"
                  type="date"
                  value={endDate}
                  onInput={(e) => setEndDate((e.target as HTMLInputElement).value)}
                  class="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      {metrics && (
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div class={`${metricCardClass} bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/60`}>
            <div class="flex items-center justify-between">
              <div>
                <div class="text-2xl font-semibold text-blue-700 dark:text-blue-300">
                  {formatCurrency(metrics.totalRevenue)}
                </div>
                <div class="mt-1 text-sm text-blue-700 dark:text-blue-300">{t('analytics.totalRevenue')}</div>
              </div>
              <div class="text-blue-300 dark:text-blue-500 text-2xl">💰</div>
            </div>
          </div>

          <div class={`${metricCardClass} bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900/60`}>
            <div class="flex items-center justify-between">
              <div>
                <div class="text-2xl font-semibold text-green-700 dark:text-green-300">
                  {formatCurrency(metrics.totalProfit)}
                </div>
                <div class="mt-1 text-sm text-green-700 dark:text-green-300">{t('analytics.totalProfit')}</div>
              </div>
              <div class="text-green-300 dark:text-green-500 text-2xl">💵</div>
            </div>
          </div>

          <div
            class={`${metricCardClass} bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-900/60`}
          >
            <div class="flex items-center justify-between">
              <div>
                <div class="text-2xl font-semibold text-purple-700 dark:text-purple-300">{metrics.completedOrders}</div>
                <div class="mt-1 text-sm text-purple-700 dark:text-purple-300">{t('analytics.completedOrders')}</div>
              </div>
              <div class="text-purple-300 dark:text-purple-500 text-2xl">✅</div>
            </div>
          </div>

          <div
            class={`${metricCardClass} bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900/60`}
          >
            <div class="flex items-center justify-between">
              <div>
                <div class="text-2xl font-semibold text-orange-700 dark:text-orange-300">
                  {formatCurrency(metrics.averageOrderValue)}
                </div>
                <div class="mt-1 text-sm text-orange-700 dark:text-orange-300">{t('analytics.averageOrderValue')}</div>
              </div>
              <div class="text-orange-300 dark:text-orange-500 text-2xl">📊</div>
            </div>
          </div>
        </div>
      )}

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Sales by Members */}
        <div class={`${panelClass} overflow-hidden`}>
          <div class="p-6 border-b border-gray-200 dark:border-gray-800">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('analytics.salesByMembers')}</h3>
          </div>
          <div class="max-h-96 overflow-y-auto">
            <Table striped>
              <TableHead>
                <TableRow class="bg-gray-50 dark:bg-gray-800/60">
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
                        <div class="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                          {member.userName.charAt(0).toUpperCase()}
                        </div>
                        <div class="font-medium text-gray-900 dark:text-gray-100">{member.userName}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div class="font-semibold text-gray-900 dark:text-gray-100">{member.totalOrders}</div>
                    </TableCell>
                    <TableCell>
                      <div class="font-semibold text-green-600 dark:text-green-400">
                        {formatCurrency(member.totalRevenue)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {salesByMembers.length === 0 && (
              <div class="p-8 text-center text-gray-500 dark:text-gray-400">
                <div class="text-4xl mb-2">👥</div>
                <p>{t('analytics.noSalesData')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Top Products */}
        <div class={`${panelClass} overflow-hidden`}>
          <div class="p-6 border-b border-gray-200 dark:border-gray-800">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('analytics.topProducts')}</h3>
          </div>
          <div class="max-h-96 overflow-y-auto">
            <Table striped>
              <TableHead>
                <TableRow class="bg-gray-50 dark:bg-gray-800/60">
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
                        <div class="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                          {index + 1}
                        </div>
                        <div class="font-medium text-gray-900 dark:text-gray-100">{product.productName}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div class="font-semibold text-gray-900 dark:text-gray-100">{product.totalSold}</div>
                    </TableCell>
                    <TableCell>
                      <div class="font-semibold text-green-600 dark:text-green-400">
                        {formatCurrency(product.totalRevenue)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {topProducts.length === 0 && (
              <div class="p-8 text-center text-gray-500 dark:text-gray-400">
                <div class="text-4xl mb-2">📦</div>
                <p>{t('analytics.noProductSales')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div class={`${panelClass} p-6`}>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('analytics.recentActivity')}</h3>
        <div class="space-y-3 max-h-96 overflow-y-auto">
          {recentActivity.map((activity) => (
            <div
              key={`${activity.id}-${activity.type}`}
              class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/60"
            >
              <div class="flex items-center">
                <span class="text-xl mr-3">{getActivityIcon(activity.type)}</span>
                <div>
                  <div class="font-medium text-gray-900 dark:text-gray-100">{activity.description}</div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    {t('analytics.by')} {activity.userName} • {new Date(activity.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
              {activity.amount && (
                <div class="font-semibold text-green-600 dark:text-green-400">{formatCurrency(activity.amount)}</div>
              )}
            </div>
          ))}
        </div>
        {recentActivity.length === 0 && (
          <div class="py-8 text-center text-gray-500 dark:text-gray-400">
            <div class="text-4xl mb-2">🕒</div>
            <p>{t('analytics.noRecentActivity')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
