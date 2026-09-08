import { useEffect, useRef, useState } from 'preact/hooks'
import { toast } from 'sonner'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/ui/icons'
import { DashboardSkeleton } from '../components/ui/PageLoader'
import { useTranslation } from '../hooks/useTranslation'
import { dashboardService } from '../services/dashboard-turso'

interface DashboardProps {
  onNavigate?: (page: string) => void
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseDateInputValue(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) {
    return new Date()
  }

  return new Date(year, month - 1, day)
}

function isSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function formatPickerLabel(date: Date, locale: string, todayLabel: string, yesterdayLabel: string): string {
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)

  if (isSameLocalDate(date, today)) {
    return todayLabel
  }

  if (isSameLocalDate(date, yesterday)) {
    return yesterdayLabel
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date)
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function buildCalendarDays(visibleMonth: Date): Date[] {
  const firstDayOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
  const calendarStart = new Date(firstDayOfMonth)
  calendarStart.setDate(firstDayOfMonth.getDate() - firstDayOfMonth.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart)
    date.setDate(calendarStart.getDate() + index)
    return date
  })
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { t, getCurrentLocale } = useTranslation()
  const statCardClass =
    'text-left bg-canvas rounded-cards border border-fog-border p-3 sm:p-5 hover:border-fog-border hover:shadow-sm transition-all'
  const statValueClass = 'text-xl font-semibold text-void sm:text-2xl '
  const datePickerClass =
    'relative inline-flex h-8 min-w-24 items-center justify-center rounded-cards border border-fog-border bg-canvas px-3 text-xs font-medium text-void shadow-sm transition-colors hover:border-fog-border hover:bg-chalk '
  const resetDateButtonClass =
    'inline-flex h-8 items-center justify-center rounded-cards border border-fog-border bg-canvas px-2 text-xs font-medium text-graphite shadow-sm transition-colors hover:border-fog-border hover:bg-chalk hover:text-void '
  const monthButtonClass =
    'inline-flex h-7 w-7 items-center justify-center rounded-cards text-graphite transition-colors hover:bg-chalk hover:text-void '

  const [stats, setStats] = useState({
    totalSales: 0,
    ordersToday: 0,
    averageOrderValue: 0,
    lowStockProducts: 0,
    pendingOrders: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => formatDateInputValue(new Date()))
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => parseDateInputValue(selectedDate))
  const datePickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let shouldUpdate = true

    const loadDashboardData = async () => {
      try {
        setIsLoading(true)
        const dashboardStats = await dashboardService.getDashboardStats({
          referenceDate: parseDateInputValue(selectedDate),
        })

        if (shouldUpdate) {
          setStats(dashboardStats)
        }
      } catch (err: unknown) {
        if (shouldUpdate) {
          const message = err instanceof Error ? err.message : t('errors.generic')
          toast.error(message)
        }
      } finally {
        if (shouldUpdate) {
          setIsLoading(false)
        }
      }
    }

    loadDashboardData()

    return () => {
      shouldUpdate = false
    }
  }, [selectedDate])

  useEffect(() => {
    if (!isDatePickerOpen) {
      return
    }

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (!datePickerRef.current?.contains(event.target as Node)) {
        setIsDatePickerOpen(false)
      }
    }

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDatePickerOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    document.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [isDatePickerOpen])

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`
  }

  const selectedDateLabel = formatPickerLabel(
    parseDateInputValue(selectedDate),
    getCurrentLocale(),
    t('dates.today'),
    t('dates.yesterday'),
  )

  const toggleDatePicker = () => {
    setVisibleMonth(parseDateInputValue(selectedDate))
    setIsDatePickerOpen((isOpen) => !isOpen)
  }

  const selectCalendarDate = (date: Date) => {
    setSelectedDate(formatDateInputValue(date))
    setIsDatePickerOpen(false)
  }

  const selectedDateValue = parseDateInputValue(selectedDate)
  const today = new Date()
  const todayInputValue = formatDateInputValue(today)
  const isTodaySelected = selectedDate === todayInputValue
  const calendarDays = buildCalendarDays(visibleMonth)
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(getCurrentLocale(), { weekday: 'narrow' }).format(new Date(2026, 1, index + 1)),
  )
  const visibleMonthLabel = new Intl.DateTimeFormat(getCurrentLocale(), {
    month: 'short',
    year: 'numeric',
  }).format(visibleMonth)
  const resetDateLabel = `${t('common.reset')} ${t('common.date').toLowerCase()}`

  if (isLoading) {
    return <DashboardSkeleton />
  }

  return (
    <div class="max-w-5xl mx-auto">
      <div ref={datePickerRef} class="relative mb-4 flex justify-end gap-2">
        {!isTodaySelected && (
          <button
            type="button"
            class={resetDateButtonClass}
            onClick={() => {
              setSelectedDate(todayInputValue)
              setVisibleMonth(today)
              setIsDatePickerOpen(false)
            }}
            aria-label={resetDateLabel}
          >
            {t('dates.today')}
          </button>
        )}

        <button type="button" class={datePickerClass} onClick={toggleDatePicker} aria-label={t('dates.selectDate')}>
          {selectedDateLabel}
        </button>

        {isDatePickerOpen && (
          <div class="absolute right-0 top-10 z-20 w-64 rounded-cards border border-fog-border bg-canvas p-3 shadow-sm ">
            <div class="mb-3 flex items-center justify-between">
              <button
                type="button"
                class={monthButtonClass}
                onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
                aria-label={t('common.previous')}
              >
                <ChevronLeftIcon class="h-4 w-4" />
              </button>
              <div class="text-sm font-medium text-void ">{visibleMonthLabel}</div>
              <button
                type="button"
                class={monthButtonClass}
                onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
                aria-label={t('common.next')}
              >
                <ChevronRightIcon class="h-4 w-4" />
              </button>
            </div>

            <div class="grid grid-cols-7 gap-1">
              {weekdayLabels.map((label, index) => (
                <div key={index} class="h-6 text-center text-[11px] font-medium text-graphite ">
                  {label}
                </div>
              ))}

              {calendarDays.map((date) => {
                const isVisibleMonth = date.getMonth() === visibleMonth.getMonth()
                const isSelectedDate = isSameLocalDate(date, selectedDateValue)
                const isToday = isSameLocalDate(date, today)

                return (
                  <button
                    key={formatDateInputValue(date)}
                    type="button"
                    onClick={() => selectCalendarDate(date)}
                    class={`h-8 rounded-cards text-xs transition-colors ${
                      isSelectedDate
                        ? 'bg-void font-semibold text-canvas '
                        : isToday
                          ? 'font-semibold text-void hover:bg-chalk '
                          : isVisibleMonth
                            ? 'text-void hover:bg-chalk '
                            : 'text-graphite hover:bg-chalk '
                    }`}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main Stats */}
      <div class="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <button type="button" onClick={() => onNavigate?.('orders')} class={statCardClass}>
          <p class="text-xs font-medium text-void uppercase tracking-wide mb-1">{t('dashboard.dailySales')}</p>
          <p class={statValueClass}>{formatCurrency(stats.totalSales)}</p>
          <p class="text-xs text-graphite mt-1">{t('dashboard.completedPaid')}</p>
        </button>

        <button type="button" onClick={() => onNavigate?.('orders')} class={statCardClass}>
          <p class="text-xs font-medium text-void uppercase tracking-wide mb-1">{t('dashboard.orders')}</p>
          <p class={statValueClass}>{stats.ordersToday}</p>
          <p class="text-xs text-graphite mt-1">{t('dashboard.totalOrdersDesc')}</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate?.('orders')}
          class={`${statCardClass} col-span-2 lg:col-span-1`}
        >
          <p class="text-xs font-medium text-void uppercase tracking-wide mb-1">{t('dashboard.avgOrderValue')}</p>
          <p class={statValueClass}>{formatCurrency(stats.averageOrderValue)}</p>
          <p class="text-xs text-graphite mt-1">{t('dashboard.perOrder')}</p>
        </button>
      </div>

      {/* Secondary Stats */}
      <div class="grid grid-cols-2 gap-3 sm:gap-4">
        <button type="button" onClick={() => onNavigate?.('products')} class={statCardClass}>
          <p class="text-xs font-medium text-void uppercase tracking-wide mb-1">{t('dashboard.lowStockAlert')}</p>
          <p class={statValueClass}>{stats.lowStockProducts}</p>
          <p class="text-xs text-graphite mt-1">{t('dashboard.needsRestocking')}</p>
        </button>

        <button type="button" onClick={() => onNavigate?.('orders')} class={statCardClass}>
          <p class="text-xs font-medium text-void uppercase tracking-wide mb-1">{t('dashboard.pendingOrders')}</p>
          <p class={statValueClass}>{stats.pendingOrders}</p>
          <p class="text-xs text-graphite mt-1">{t('dashboard.awaitingProcessing')}</p>
        </button>
      </div>
    </div>
  )
}
