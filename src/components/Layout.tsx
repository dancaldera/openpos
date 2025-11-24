/**
 * Props for the Layout component
 * @interface LayoutProps
 * @property {any} children - The content to be rendered within the layout
 * @property {string} currentPage - The currently active page identifier
 * @property {(page: string) => void} onNavigate - Callback function for navigation events
 */
import type { ComponentChildren } from 'preact'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { Button } from './ui'
import Sidebar from './ui/Sidebar'

interface LayoutProps {
  children: ComponentChildren
  currentPage: string
  onNavigate: (page: string) => void
}

/**
 * Main application layout component that provides the overall structure
 * including sidebar navigation, header with user controls, and content area.
 *
 * Features:
 * - Responsive sidebar with collapsible navigation
 * - Role-based menu item filtering (e.g., Members section for admins/managers only)
 * - User profile dropdown with settings and logout
 * - Notification bell with badge indicator
 * - Dynamic page title based on current route
 *
 * @component
 * @param {LayoutProps} props - Component properties
 * @returns {JSX.Element} The complete application layout structure
 */
export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  /**
   * State for controlling the user profile dropdown visibility
   * @type {[boolean, function]} isDropdownOpen - Dropdown open state and setter
   */

  /**
   * Authentication context providing user information and signOut function
   * @type {object} auth - Authentication context object
   * @property {object|null} user - Current authenticated user information
   * @property {function} signOut - Function to sign out the current user
   */
  const { user, signOut } = useAuth()

  /**
   * Translation hook providing translation function and language utilities
   */
  const { t } = useTranslation()

  /**
   * Navigation menu items configuration with role-based filtering
   * Filters out 'Members' menu item for non-admin/non-manager users
   * @type {Array<{id: string, label: string, icon: string}>}
   */
  const menuItems = [
    {
      id: 'dashboard',
      label: t('navigation.dashboard'),
      icon: '📊',
      description: t('dashboard.subtitle'),
    },
    {
      id: 'orders',
      label: t('navigation.orders'),
      icon: '📋',
      description: t('orders.subtitle'),
    },
    {
      id: 'products',
      label: t('navigation.products'),
      icon: '📦',
      description: t('products.subtitle'),
    },
    {
      id: 'members',
      label: t('navigation.members'),
      icon: '👤',
      description: t('members.subtitle'),
    },
    {
      id: 'analytics',
      label: t('navigation.analytics'),
      icon: '📈',
      description: t('analytics.subtitle'),
    },
    {
      id: 'settings',
      label: t('navigation.settings'),
      icon: '⚙️',
      description: t('settings.subtitle'),
    },
  ].filter((item) => {
    // Filter out Members section for non-admin/non-manager users
    if (item.id === 'members') {
      return user && (user.role === 'admin' || user.role === 'manager')
    }
    // Filter out Analytics section for non-admin users
    if (item.id === 'analytics') {
      return user && user.role === 'admin'
    }
    return true
  })

  return (
    // Main layout container with sidebar and content area
    // Uses flexbox for responsive sidebar + content layout
    <div class="flex h-screen bg-gray-100">
      {/*
        Sidebar component with dark theme and collapsible functionality
        @param {string} width - Sidebar width (md: medium)
        @param {string} backgroundColor - Background color theme
        @param {boolean} collapsible - Whether sidebar can be collapsed
        @param {boolean} defaultCollapsed - Initial collapsed state
      */}
      <Sidebar
        items={menuItems.map((item) => ({
          id: item.id,
          label: item.label,
          icon: item.icon,
          active: currentPage === item.id,
          onClick: () => onNavigate(item.id),
        }))}
      />

      {/* Main content area with header and scrollable content */}
      <div class="flex-1 flex flex-col overflow-hidden">
        {/*
          Application header with page title, notifications, and user profile
          Features white background with subtle shadow and border
        */}
        <header class="bg-white shadow-sm border-b border-gray-200">
          <div class="flex items-center justify-between px-6 py-4">
            <div>
              <h1 class="text-lg font-semibold text-gray-900">
                {menuItems.find((item) => item.id === currentPage)?.label}
              </h1>
              <p class="text-sm text-gray-600">{menuItems.find((item) => item.id === currentPage)?.description}</p>
            </div>

            {/* Header right section with user info and logout */}
            <div class="flex items-center space-x-4">
              {/* User info display */}
              <div class="flex items-center space-x-3">
                <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold text-white">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div class="flex flex-col items-start">
                  <span class="font-medium text-gray-900">{user?.name || 'User'}</span>
                  <span class="text-xs text-gray-500">{user?.email}</span>
                </div>
              </div>

              {/* Visual separator */}
              <div class="h-8 w-px bg-gray-300"></div>

              {/* Logout button */}
              <Button
                variant="outline"
                size="sm"
                onClick={signOut}
                class="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
              >
                {t('navigation.signOut')}
              </Button>
            </div>
          </div>
        </header>

        {/*
          Main content area with scrollable container
          Uses container class for proper horizontal centering and padding
        */}
        <main class="flex-1 overflow-x-hidden overflow-y-auto">
          <div class="container mx-auto px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
