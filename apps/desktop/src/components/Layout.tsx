import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { useAuth } from '../hooks/useAuth'
import { usePlatform } from '../hooks/usePlatform'
import { useTranslation } from '../hooks/useTranslation'
import { getDesktopApi } from '../lib/desktop'
import { appSettingsStore } from '../stores/appSettings/appSettingsStore'
import { Button, DbStatusBadge, DialogConfirm, UpdateBadge } from './ui'
import {
  AnalyticsIcon,
  CustomersIcon,
  DashboardIcon,
  MembersIcon,
  OrdersIcon,
  ProductsIcon,
  SettingsIcon,
} from './ui/icons'
import { Sidebar } from './ui/Sidebar'

interface LayoutProps {
  children: ComponentChildren
  currentPage: string
  onNavigate: (page: string) => void
}

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { user, signOut } = useAuth()
  const { t } = useTranslation()
  const { appName } = appSettingsStore
  const { isMac } = usePlatform()
  const [isSignOutDialogOpen, setIsSignOutDialogOpen] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  useEffect(() => {
    const api = getDesktopApi()
    if (!api?.navigation) return
    return api.navigation.onNavigate(onNavigate)
  }, [onNavigate])

  const menuItems = [
    {
      id: 'dashboard',
      label: t('navigation.dashboard'),
      icon: <DashboardIcon class="w-5 h-5" />,
      description: t('dashboard.subtitle'),
    },
    {
      id: 'orders',
      label: t('navigation.orders'),
      icon: <OrdersIcon class="w-5 h-5" />,
      description: t('orders.subtitle'),
    },
    {
      id: 'products',
      label: t('navigation.products'),
      icon: <ProductsIcon class="w-5 h-5" />,
      description: t('products.subtitle'),
    },
    {
      id: 'customers',
      label: t('navigation.customers'),
      icon: <CustomersIcon class="w-5 h-5" />,
      description: t('customers.subtitle'),
    },
    {
      id: 'members',
      label: t('navigation.members'),
      icon: <MembersIcon class="w-5 h-5" />,
      description: t('members.subtitle'),
    },
    {
      id: 'analytics',
      label: t('navigation.analytics'),
      icon: <AnalyticsIcon class="w-5 h-5" />,
      description: t('analytics.subtitle'),
    },
    {
      id: 'settings',
      label: t('navigation.settings'),
      icon: <SettingsIcon class="w-5 h-5" />,
      description: t('settings.subtitle'),
    },
  ].filter((item) => {
    if (item.id === 'members') {
      return user && (user.role === 'admin' || user.role === 'manager')
    }
    if (item.id === 'analytics') {
      return user && user.role === 'admin'
    }
    return true
  })

  const currentItem = menuItems.find((item) => item.id === currentPage)

  return (
    <div class="flex h-screen bg-gray-100 dark:bg-gray-950">
      <Sidebar
        title={appName.value}
        isMac={isMac}
        mobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
        items={menuItems.map((item) => ({
          id: item.id,
          label: item.label,
          icon: item.icon,
          active: currentPage === item.id,
          onClick: () => onNavigate(item.id),
        }))}
      />

      <div class="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header: full-width drag region, content is no-drag */}
        <header class="drag-region bg-white/80 dark:bg-gray-900/92 backdrop-blur-xl border-b border-gray-200/60 dark:border-gray-800/60 shrink-0">
          <div class="no-drag flex items-center justify-between px-4 md:px-6 py-3 gap-3">
            <div class="flex items-center gap-3 min-w-0">
              {/* Hamburger — mobile only */}
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                class="md:hidden p-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                aria-label="Open menu"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div class="min-w-0">
                <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight truncate">
                  {currentItem?.label}
                </h1>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 hidden sm:block">
                  {currentItem?.description}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 md:gap-3 flex-shrink-0">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 bg-gray-400 dark:bg-gray-600 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div class="hidden sm:flex flex-col items-start leading-tight">
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name || 'User'}</span>
                  <span class="text-xs text-gray-500 dark:text-gray-400">{user?.email}</span>
                </div>
              </div>

              <div class="h-6 w-px bg-gray-200 dark:bg-gray-700" />

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSignOutDialogOpen(true)}
                class="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/50"
              >
                {t('navigation.signOut')}
              </Button>
            </div>
          </div>
        </header>

        <main class="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-gray-950">
          <div class="container mx-auto px-4 md:px-6 py-4 md:py-6">{children}</div>
        </main>
      </div>

      <UpdateBadge />
      <DbStatusBadge />

      <DialogConfirm
        isOpen={isSignOutDialogOpen}
        onClose={() => setIsSignOutDialogOpen(false)}
        onConfirm={signOut}
        title={t('auth.signOutConfirmTitle')}
        message={t('auth.signOutConfirmMessage')}
        confirmText={t('navigation.signOut')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </div>
  )
}
