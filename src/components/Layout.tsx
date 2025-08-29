/**
 * Props for the Layout component
 * @interface LayoutProps
 * @property {any} children - The content to be rendered within the layout
 * @property {string} currentPage - The currently active page identifier
 * @property {(page: string) => void} onNavigate - Callback function for navigation events
 */
import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { Dropdown, type DropdownItem, Heading, Text } from './ui'
import Sidebar, { SidebarGroup, SidebarItem, SidebarNav } from './ui/Sidebar'

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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

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
   * User dropdown menu items configuration
   * @type {DropdownItem[]}
   */
  const userDropdownItems: DropdownItem[] = [
    {
      id: 'settings',
      label: t('navigation.settings'),
      icon: '⚙️',
      onClick: () => onNavigate('settings'),
    },
    {
      id: 'signout',
      label: t('navigation.signOut'),
      icon: '🚪',
      onClick: signOut,
      variant: 'danger',
      separator: true,
    },
  ]

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
      <Sidebar width="md" backgroundColor="dark" collapsible defaultCollapsed={false}>
        {({ isCollapsed }: { isCollapsed: boolean }) => (
          <SidebarNav>
            <SidebarGroup title="" isCollapsed={isCollapsed}>
              {menuItems.map((item) => (
                <SidebarItem
                  key={item.id}
                  item={{
                    ...item,
                    active: currentPage === item.id,
                    onClick: () => onNavigate(item.id),
                  }}
                  isCollapsed={isCollapsed}
                />
              ))}
            </SidebarGroup>
          </SidebarNav>
        )}
      </Sidebar>

      {/* Main content area with header and scrollable content */}
      <div class="flex-1 flex flex-col overflow-hidden">
        {/*
          Application header with page title, notifications, and user profile
          Features white background with subtle shadow and border
        */}
        <header class="bg-white shadow-sm border-b border-gray-200">
          <div class="flex items-center justify-between px-6 py-4">
            <div>
              <Heading>{menuItems.find((item) => item.id === currentPage)?.label}</Heading>
              <Text>{menuItems.find((item) => item.id === currentPage)?.description}</Text>
            </div>

            {/* Header right section with notifications and user profile */}
            <div class="flex items-center space-x-4">
              {/*
                User profile dropdown component
                Contains user avatar, name, email, and dropdown menu
              */}
              <Dropdown
                items={userDropdownItems}
                isOpen={isDropdownOpen}
                onOpenChange={setIsDropdownOpen}
                trigger={
                  <div class="flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
                    <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-bold text-white">
                      A
                    </div>
                    <div class="flex flex-col items-start">
                      <span class="font-medium">{user?.name || 'User'}</span>
                      <span class="text-xs text-gray-500">{user?.email}</span>
                    </div>
                    <span class={`text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}>▼</span>
                  </div>
                }
              />
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
