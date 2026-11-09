import { Banner } from '@astryxdesign/core/Banner'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack } from '@astryxdesign/core/Stack'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { useEffect, useState } from 'react'
import { Page } from '../components/page/Page'
import { AdvancedSettings, type ConnectionInfo } from '../components/settings/AdvancedSettings'
import { ChangePasswordForm } from '../components/settings/ChangePasswordForm'
import { GeneralSettings } from '../components/settings/GeneralSettings'
import { PreferencesSettings } from '../components/settings/PreferencesSettings'
import { SettingsGroup } from '../components/settings/SettingsGroup'
import { useCompanySettingsForm } from '../components/settings/useCompanySettingsForm'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'
import { hrefFor, navigate, useRoute } from '../lib/router'
import { fetchCurrentStore, getStoredConnectionKey } from '../services/connections'

type SettingsTab = 'general' | 'preferences' | 'security' | 'advanced'

const TAB_LABEL_KEYS: Record<SettingsTab, string> = {
  general: 'settings.tabGeneral',
  preferences: 'settings.tabPreferences',
  security: 'settings.tabSecurity',
  advanced: 'settings.advanced',
}

/** Loads which store this device is bound to, if the user entered a connection key. */
function useConnectionInfo() {
  const [info, setInfo] = useState<ConnectionInfo | null>(null)

  useEffect(() => {
    let isCancelled = false
    const load = async (): Promise<ConnectionInfo | null> => {
      if (isDesktop) return requireDesktopApi().connection.getActive()
      // Web stores picked by host have no key on this device; only show keys the user entered.
      const key = getStoredConnectionKey()
      if (!key) return null
      const store = await fetchCurrentStore()
      return { key, storeName: store?.name }
    }
    load()
      .then((next) => {
        if (!isCancelled) setInfo(next)
      })
      .catch((error: unknown) => {
        console.error('Failed to load connection info:', error)
      })
    return () => {
      isCancelled = true
    }
  }, [])

  return info
}

/**
 * Settings, split into tabs that each have their own route
 * (`#/settings/preferences`, ...). Everything happens in the page: no dialogs.
 */
export default function Settings() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const route = useRoute()
  const form = useCompanySettingsForm()
  const connectionInfo = useConnectionInfo()
  const [isAdvancedUnlocked, setIsAdvancedUnlocked] = useState(false)

  const hasAdvanced = isDesktop || isAdmin || Boolean(connectionInfo?.key)
  const tabs: SettingsTab[] = ['general', 'preferences', 'security', ...(hasAdvanced ? (['advanced'] as const) : [])]
  const requested = route.params[0] as SettingsTab | undefined
  const activeTab: SettingsTab = requested && tabs.includes(requested) ? requested : 'general'

  const renderTab = () => {
    switch (activeTab) {
      case 'preferences':
        return <PreferencesSettings />
      case 'security':
        return (
          <SettingsGroup title={t('settings.changePassword')} description={t('settings.changePasswordDesc')}>
            <ChangePasswordForm />
          </SettingsGroup>
        )
      case 'advanced':
        return (
          <AdvancedSettings
            isUnlocked={isAdvancedUnlocked}
            onUnlock={() => setIsAdvancedUnlocked(true)}
            connectionInfo={connectionInfo}
          />
        )
      default:
        if (form.isLoading) {
          return (
            <HStack hAlign="center" padding={10}>
              <Spinner label={t('common.loading')} />
            </HStack>
          )
        }
        if (form.loadError || !form.draft) {
          return (
            <Banner
              status="error"
              title={t('settings.loadFailed')}
              description={form.loadError || t('errors.generic')}
              collapsible={false}
            />
          )
        }
        return <GeneralSettings form={form} />
    }
  }

  return (
    <Page title={t('settings.title')} description={t('settings.subtitle')} width={960}>
      <TabList value={activeTab} onChange={(value) => navigate(`settings/${value}`)} hasDivider>
        {tabs.map((tab) => (
          <Tab key={tab} value={tab} label={t(TAB_LABEL_KEYS[tab])} href={hrefFor(`settings/${tab}`)} />
        ))}
      </TabList>
      {renderTab()}
    </Page>
  )
}
