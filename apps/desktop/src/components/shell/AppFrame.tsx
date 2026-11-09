import { AppShell } from '@astryxdesign/core/AppShell'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { NavIcon } from '@astryxdesign/core/NavIcon'
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { ChartColumn, CircleUser, LayoutDashboard, Package, ReceiptText, Settings, UserCog, Users } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { usePlatform } from '../../hooks/usePlatform'
import { useTranslation } from '../../hooks/useTranslation'
import { getDesktopApi } from '../../lib/desktop'
import { isDesktop } from '../../lib/platform'
import { hrefFor, navigate } from '../../lib/router'
import { appSettingsStore } from '../../stores/appSettings/appSettingsStore'
import { setSidebarCollapsed, sidebarCollapsed } from '../../stores/ui/sidebarStore'
import { SyncStatusItem } from './SyncStatusItem'
import { UpdateStatusItem } from './UpdateStatusItem'

interface AppFrameProps {
  /** Top-level section of the current route, e.g. `orders`. */
  section: string
  children: ReactNode
}

export function AppFrame({ section, children }: AppFrameProps) {
  const { user, signOut } = useAuth()
  const { isMac } = usePlatform()
  const { t } = useTranslation()
  const isCollapsed = sidebarCollapsed.value

  // The Electron app menu can jump between sections.
  useEffect(() => {
    const api = getDesktopApi()
    if (!api?.navigation) return
    return api.navigation.onNavigate((page) => navigate(page))
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setSidebarCollapsed(!sidebarCollapsed.value)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const canSeeMembers = user?.role === 'admin' || user?.role === 'manager'
  const canSeeAnalytics = user?.role === 'admin'

  const navItem = (id: string, label: string, icon: typeof LayoutDashboard) => (
    <SideNavItem key={id} label={label} icon={icon} href={hrefFor(id)} isSelected={section === id} />
  )

  return (
    <AppShell
      variant="elevated"
      sideNav={
        <SideNav
          aria-label={t('navigation.main')}
          collapsible={{
            isCollapsed,
            onCollapsedChange: setSidebarCollapsed,
            buttonLabel: t('navigation.toggleSidebar'),
          }}
          header={
            <div className={isMac ? 'drag-region pt-7' : undefined}>
              <div className="no-drag">
                <SideNavHeading
                  heading={appSettingsStore.appName.value}
                  icon={<NavIcon icon={<img src="/icon.png" alt="" className="h-full w-full" />} />}
                  headingHref={hrefFor('dashboard')}
                />
              </div>
            </div>
          }
          footer={
            <SideNavSection title={t('navigation.account')} isHeaderHidden>
              {isDesktop && <UpdateStatusItem />}
              <SyncStatusItem />
              <SideNavItem
                label={user?.name || t('navigation.account')}
                icon={CircleUser}
                actions={
                  <MoreMenu
                    size="sm"
                    label={t('navigation.accountMenu')}
                    placement="above"
                    items={[
                      { label: t('navigation.settings'), onClick: () => navigate('settings') },
                      { type: 'divider' },
                      { label: t('navigation.signOut'), variant: 'destructive', onClick: () => signOut() },
                    ]}
                  />
                }
              />
            </SideNavSection>
          }
        >
          <SideNavSection title={t('navigation.store')} isHeaderHidden>
            {navItem('dashboard', t('navigation.dashboard'), LayoutDashboard)}
            {navItem('orders', t('navigation.orders'), ReceiptText)}
            {navItem('products', t('navigation.products'), Package)}
            {navItem('customers', t('navigation.customers'), Users)}
          </SideNavSection>
          <SideNavSection title={t('navigation.manage')} isHeaderHidden>
            {canSeeMembers && navItem('members', t('navigation.members'), UserCog)}
            {canSeeAnalytics && navItem('analytics', t('navigation.analytics'), ChartColumn)}
            {navItem('settings', t('navigation.settings'), Settings)}
          </SideNavSection>
        </SideNav>
      }
    >
      {children}
    </AppShell>
  )
}
