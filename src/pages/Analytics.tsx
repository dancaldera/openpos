import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { Button, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import {
  type AnalyticsMetrics,
  analyticsService,
  type RecentActivity,
  type SalesByMember,
  type TopProduct,
} from '../services/analytics-sqlite'
import { companySettingsService } from '../services/company-settings-sqlite'

export default function Analytics() {
  const { t } = useTranslation()

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
      <div class="max-w-6xl mx-auto px-6 py-4">
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div class="text-center">
            <div class="text-6xl mb-6 drop-shadow-lg">🔒</div>
            <h2 class="text-lg font-semibold mb-3 text-gray-900">{t('errors.unauthorized')}</h2>
            <p class="text-gray-600 max-w-md mx-auto">{t('analytics.adminOnly')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div class="max-w-6xl mx-auto px-6 py-4">
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
          <div class="text-center">
            <div class="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full animate-spin border-4 border-transparent border-t-white mx-auto mb-6 shadow-lg"></div>
            <p class="text-gray-600 text-lg">{t('analytics.loadingAnalytics')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="max-w-6xl mx-auto px-6 py-4">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">📊 {t('analytics.dashboardTitle')}</h1>
          <p class="text-gray-600">{t('analytics.subtitle')}</p>
        </div>
        <Button onClick={loadAnalytics} disabled={isLoading}>
          <span class="mr-2">🔄</span>
          {t('analytics.refreshData')}
        </Button>
      </div>

      {/* Date Range Filters */}
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">📅 {t('analytics.dateRange')}</h3>
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
                <label for="analytics-start-date" class="block text-sm font-medium text-gray-700 mb-2">
                  {t('analytics.startDate')}
                </label>
                <input
                  id="analytics-start-date"
                  type="date"
                  value={startDate}
                  onInput={(e) => setStartDate((e.target as HTMLInputElement).value)}
                  class="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm backdrop-blur-md bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent"
                />
              </div>
              <div class="flex-1 min-w-40">
                <label for="analytics-end-date" class="block text-sm font-medium text-gray-700 mb-2">
                  {t('analytics.endDate')}
                </label>
                <input
                  id="analytics-end-date"
                  type="date"
                  value={endDate}
                  onInput={(e) => setEndDate((e.target as HTMLInputElement).value)}
                  class="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm backdrop-blur-md bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      {metrics && (
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div class="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-3xl font-bold text-blue-600">{formatCurrency(metrics.totalRevenue)}</div>
                <div class="text-sm font-medium text-blue-700">{t('analytics.totalRevenue')}</div>
              </div>
              <div class="text-blue-400 text-3xl">💰</div>
            </div>
          </div>

          <div class="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border border-green-200 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-3xl font-bold text-green-600">{formatCurrency(metrics.totalProfit)}</div>
                <div class="text-sm font-medium text-green-700">{t('analytics.totalProfit')}</div>
              </div>
              <div class="text-green-400 text-3xl">💵</div>
            </div>
          </div>

          <div class="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl border border-purple-200 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-3xl font-bold text-purple-600">{metrics.completedOrders}</div>
                <div class="text-sm font-medium text-purple-700">{t('analytics.completedOrders')}</div>
              </div>
              <div class="text-purple-400 text-3xl">✅</div>
            </div>
          </div>

          <div class="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-xl border border-orange-200 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-3xl font-bold text-orange-600">{formatCurrency(metrics.averageOrderValue)}</div>
                <div class="text-sm font-medium text-orange-700">{t('analytics.averageOrderValue')}</div>
              </div>
              <div class="text-orange-400 text-3xl">📊</div>
            </div>
          </div>
        </div>
      )}

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Sales by Members */}
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="p-6 border-b border-gray-200">
            <h3 class="text-lg font-semibold text-gray-900">👥 {t('analytics.salesByMembers')}</h3>
          </div>
          <div class="max-h-96 overflow-y-auto">
            <Table>
              <TableHead>
                <TableRow class="bg-gray-50">
                  <TableHeader class="font-semibold text-gray-900">{t('analytics.member')}</TableHeader>
                  <TableHeader class="font-semibold text-gray-900">{t('analytics.orders')}</TableHeader>
                  <TableHeader class="font-semibold text-gray-900">{t('analytics.revenue')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {salesByMembers.map((member) => (
                  <TableRow key={member.userId} class="hover:bg-gray-50">
                    <TableCell>
                      <div class="flex items-center">
                        <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold mr-3">
                          {member.userName.charAt(0).toUpperCase()}
                        </div>
                        <div class="font-medium text-gray-900">{member.userName}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div class="font-semibold text-gray-900">{member.totalOrders}</div>
                    </TableCell>
                    <TableCell>
                      <div class="font-bold text-green-600">{formatCurrency(member.totalRevenue)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {salesByMembers.length === 0 && (
              <div class="p-8 text-center text-gray-500">
                <div class="text-4xl mb-2">👥</div>
                <p>{t('analytics.noSalesData')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Top Products */}
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div class="p-6 border-b border-gray-200">
            <h3 class="text-lg font-semibold text-gray-900">🏆 {t('analytics.topProducts')}</h3>
          </div>
          <div class="max-h-96 overflow-y-auto">
            <Table>
              <TableHead>
                <TableRow class="bg-gray-50">
                  <TableHeader class="font-semibold text-gray-900">{t('analytics.product')}</TableHeader>
                  <TableHeader class="font-semibold text-gray-900">{t('analytics.sold')}</TableHeader>
                  <TableHeader class="font-semibold text-gray-900">{t('analytics.revenue')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {topProducts.map((product, index) => (
                  <TableRow key={product.productId} class="hover:bg-gray-50">
                    <TableCell>
                      <div class="flex items-center">
                        <div class="w-8 h-8 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold mr-3">
                          {index + 1}
                        </div>
                        <div class="font-medium text-gray-900">{product.productName}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div class="font-semibold text-gray-900">{product.totalSold}</div>
                    </TableCell>
                    <TableCell>
                      <div class="font-bold text-green-600">{formatCurrency(product.totalRevenue)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {topProducts.length === 0 && (
              <div class="p-8 text-center text-gray-500">
                <div class="text-4xl mb-2">📦</div>
                <p>{t('analytics.noProductSales')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">🕒 {t('analytics.recentActivity')}</h3>
        <div class="space-y-3 max-h-96 overflow-y-auto">
          {recentActivity.map((activity) => (
            <div
              key={`${activity.id}-${activity.type}`}
              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div class="flex items-center">
                <span class="text-xl mr-3">{getActivityIcon(activity.type)}</span>
                <div>
                  <div class="font-medium text-gray-900">{activity.description}</div>
                  <div class="text-sm text-gray-600">
                    {t('analytics.by')} {activity.userName} • {new Date(activity.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
              {activity.amount && <div class="font-bold text-green-600">{formatCurrency(activity.amount)}</div>}
            </div>
          ))}
        </div>
        {recentActivity.length === 0 && (
          <div class="text-center text-gray-500 py-8">
            <div class="text-4xl mb-2">🕒</div>
            <p>{t('analytics.noRecentActivity')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
