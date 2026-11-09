import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { AppFrame } from './components/shell/AppFrame'
import { FullPageError, FullPageLoader } from './components/shell/FullPageStatus'
import { ToastBridge } from './components/shell/ToastBridge'
import { useAuth } from './hooks/useAuth'
import { startDbStatusMonitor, stopDbStatusMonitor } from './lib/db-status'
import { type DesktopFirstRunStatus, requireDesktopApi } from './lib/desktop'
import { isDesktop } from './lib/platform'
import { navigate, useRoute } from './lib/router'
import Analytics from './pages/Analytics'
import ConnectionSetup from './pages/ConnectionSetup'
import CustomersSection from './pages/customers/CustomersSection'
import Dashboard from './pages/Dashboard'
import FirstRunSync from './pages/FirstRunSync'
import MembersSection from './pages/members/MembersSection'
import NotFoundPage from './pages/NotFoundPage'
import OrdersSection from './pages/orders/OrdersSection'
import ProductsSection from './pages/products/ProductsSection'
import Settings from './pages/Settings'
import SignIn from './pages/SignIn'
import { resolveWebStore } from './services/connections'
import { updateService } from './services/update-service'
import { appSettingsStore } from './stores/appSettings/appSettingsStore'
import { authActions } from './stores/auth/authActions'
import { languageActions } from './stores/language/languageActions'
import { initializeTheme, resolvedTheme } from './stores/theme/themeStore'
import './App.css'

function AppContent() {
  const [startupStatus, setStartupStatus] = useState<DesktopFirstRunStatus | null>(null)
  const [needsWebConnection, setNeedsWebConnection] = useState(false)
  const [isStartupLoading, setIsStartupLoading] = useState(true)
  const [isRetryingStartup, setIsRetryingStartup] = useState(false)
  const [startupError, setStartupError] = useState<string | null>(null)
  const { isAuthenticated, isLoading, user } = useAuth()
  const route = useRoute()

  const enterSignIn = async () => {
    // Language comes from company settings, so on the web it waits for a store.
    if (!isDesktop) await languageActions.initializeLanguage()
    await appSettingsStore.initialize(true)
    await authActions.initializeAuth()
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: startup runs once per mount; enterSignIn only calls module-level stores.
  useEffect(() => {
    let isCancelled = false

    const initializeApp = async () => {
      try {
        await initializeTheme()

        if (!isDesktop) {
          // Web: the page host (demo.pos.softmelody.dev) picks the store. Ask for a
          // connection key only when neither the host nor a saved key does.
          const store = await resolveWebStore()
          if (isCancelled) return
          startDbStatusMonitor()
          if (!store) {
            setNeedsWebConnection(true)
            return
          }
          await enterSignIn()
          return
        }

        await languageActions.initializeLanguage()

        await appSettingsStore.initialize()

        updateService.start()
        startDbStatusMonitor()
        const startupApi = requireDesktopApi().startup
        let status = await startupApi.getStatus()
        if (isCancelled) return
        setStartupStatus(status)

        if (status.status !== 'readyForSignIn' && status.status !== 'needsConnection') {
          status = await startupApi.initialize()
          if (isCancelled) return
          setStartupStatus(status)
        }

        if (status.status === 'readyForSignIn') {
          await enterSignIn()
        }
      } catch (error) {
        if (!isCancelled) {
          setStartupError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        if (!isCancelled) {
          setIsStartupLoading(false)
        }
      }
    }

    void initializeApp()

    return () => {
      isCancelled = true
      stopDbStatusMonitor()
      updateService.stop()
    }
  }, [])

  // Signing out lands the next session on the dashboard. Only a real sign-out
  // counts, so a reload keeps its deep link while auth is still initializing.
  const wasAuthenticated = useRef(isAuthenticated)
  useEffect(() => {
    if (wasAuthenticated.current && !isAuthenticated) {
      navigate('dashboard', { replace: true })
    }
    wasAuthenticated.current = isAuthenticated
  }, [isAuthenticated])

  const handleRetryStartup = async () => {
    if (!isDesktop) {
      return
    }

    setIsRetryingStartup(true)
    setStartupError(null)
    setStartupStatus((currentStatus) =>
      currentStatus ? { ...currentStatus, status: 'syncingInitialData', lastError: null } : currentStatus,
    )

    try {
      const status = await requireDesktopApi().startup.retry()
      setStartupStatus(status)
      if (status.status === 'readyForSignIn') {
        await enterSignIn()
      }
    } catch (error) {
      setStartupError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsRetryingStartup(false)
    }
  }

  const handleConnectionResolved = async (status?: DesktopFirstRunStatus) => {
    if (!isDesktop) {
      setNeedsWebConnection(false)
      await enterSignIn()
      return
    }

    const nextStatus = status || (await requireDesktopApi().startup.getStatus())
    setStartupStatus(nextStatus)
    if (nextStatus.status === 'readyForSignIn') {
      await enterSignIn()
    }
  }

  const needsConnectionSetup =
    !isAuthenticated && (isDesktop ? startupStatus?.status === 'needsConnection' : needsWebConnection)

  if (isStartupLoading || isLoading) {
    return <FullPageLoader />
  }

  if (startupError) {
    return (
      <FullPageError
        title="OpenPOS failed to start"
        message={startupError}
        actionLabel="Retry"
        onAction={() => window.location.reload()}
      />
    )
  }

  if (needsConnectionSetup) {
    return <ConnectionSetup status={startupStatus} onResolved={handleConnectionResolved} />
  }

  if (isDesktop && !isAuthenticated && startupStatus && startupStatus.status !== 'readyForSignIn') {
    return <FirstRunSync status={startupStatus} isRetrying={isRetryingStartup} onRetry={handleRetryStartup} />
  }

  if (!isAuthenticated) {
    return <SignIn />
  }

  const isManager = user?.role === 'admin' || user?.role === 'manager'
  const isAdmin = user?.role === 'admin'

  let page: ReactNode
  switch (route.section) {
    case 'dashboard':
      page = <Dashboard />
      break
    case 'orders':
      page = <OrdersSection params={route.params} />
      break
    case 'products':
      page = <ProductsSection params={route.params} />
      break
    case 'customers':
      page = <CustomersSection params={route.params} />
      break
    case 'members':
      page = isManager ? <MembersSection params={route.params} /> : <NotFoundPage />
      break
    case 'analytics':
      page = isAdmin ? <Analytics /> : <NotFoundPage />
      break
    case 'settings':
      page = <Settings />
      break
    default:
      page = <NotFoundPage />
  }

  return <AppFrame section={route.section}>{page}</AppFrame>
}

export default function App() {
  return (
    <Theme theme={neutralTheme} mode={resolvedTheme.value}>
      <ToastBridge />
      <AppContent />
    </Theme>
  )
}
