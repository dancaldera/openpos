import { useEffect, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { DashboardSkeleton } from '../components/ui/PageLoader'
import { useTranslation } from '../hooks/useTranslation'
import { dashboardService } from '../services/dashboard-turso'

interface DashboardProps {
  onNavigate?: (page: string) => void
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { t } = useTranslation()
  const statCardClass =
    'text-left bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 sm:p-5 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm transition-all'
  const statValueClass = 'text-xl font-semibold text-gray-900 sm:text-2xl dark:text-gray-100'

  const [stats, setStats] = useState({
    totalSales: 0,
    ordersToday: 0,
    averageOrderValue: 0,
    lowStockProducts: 0,
    pendingOrders: 0,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setIsLoading(true)
      const dashboardStats = await dashboardService.getDashboardStats()
      setStats(dashboardStats)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('errors.generic')
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`
  }

  if (isLoading) {
    return <DashboardSkeleton />
  }

  return (
    <div class="max-w-5xl mx-auto">
      {/* Main Stats */}
      <div class="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <button type="button" onClick={() => onNavigate?.('orders')} class={statCardClass}>
          <p class="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">
            {t('dashboard.dailySales')}
          </p>
          <p class={statValueClass}>{formatCurrency(stats.totalSales)}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('dashboard.completedPaid')}</p>
        </button>

        <button type="button" onClick={() => onNavigate?.('orders')} class={statCardClass}>
          <p class="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">
            {t('dashboard.orders')}
          </p>
          <p class={statValueClass}>{stats.ordersToday}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('dashboard.totalOrdersDesc')}</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate?.('orders')}
          class={`${statCardClass} col-span-2 lg:col-span-1`}
        >
          <p class="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">
            {t('dashboard.avgOrderValue')}
          </p>
          <p class={statValueClass}>{formatCurrency(stats.averageOrderValue)}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('dashboard.perOrder')}</p>
        </button>
      </div>

      {/* Secondary Stats */}
      <div class="grid grid-cols-2 gap-3 sm:gap-4">
        <button type="button" onClick={() => onNavigate?.('products')} class={statCardClass}>
          <p class="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1">
            {t('dashboard.lowStockAlert')}
          </p>
          <p class={statValueClass}>{stats.lowStockProducts}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('dashboard.needsRestocking')}</p>
        </button>

        <button type="button" onClick={() => onNavigate?.('orders')} class={statCardClass}>
          <p class="text-xs font-medium text-rose-600 dark:text-rose-400 uppercase tracking-wide mb-1">
            {t('dashboard.pendingOrders')}
          </p>
          <p class={statValueClass}>{stats.pendingOrders}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('dashboard.awaitingProcessing')}</p>
        </button>
      </div>
    </div>
  )
}
