import { useEffect, useState } from 'preact/hooks'
import { Toaster } from 'sonner'
import Layout from './components/Layout'
import { FullPageLoader } from './components/ui/PageLoader'
import { useAuth } from './hooks/useAuth'
import { startDbStatusMonitor, stopDbStatusMonitor } from './lib/db-status'
import { type DesktopFirstRunStatus, requireDesktopApi } from './lib/desktop'
import { isDesktop } from './lib/platform'
import Analytics from './pages/Analytics'
import ConnectionSetup from './pages/ConnectionSetup'
import Customers from './pages/Customers'
import Dashboard from './pages/Dashboard'
import FirstRunSync from './pages/FirstRunSync'
import Members from './pages/Members'
import Orders from './pages/Orders'
import Products from './pages/Products'
import Settings from './pages/Settings'
import SignIn from './pages/SignIn'
import { bindWebAssignedConnection } from './services/connections'
import { updateService } from './services/update-service'
import { appSettingsStore } from './stores/appSettings/appSettingsStore'
import { authActions } from './stores/auth/authActions'
import { languageActions } from './stores/language/languageActions'
import { initializeTheme } from './stores/theme/themeStore'
import './App.css'

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [startupStatus, setStartupStatus] = useState<DesktopFirstRunStatus | null>(null)
  const [isStartupLoading, setIsStartupLoading] = useState(true)
  const [isRetryingStartup, setIsRetryingStartup] = useState(false)
  const [startupError, setStartupError] = useState<string | null>(null)
  const { isAuthenticated, isLoading } = useAuth()

  // Initialize auth, language, and app settings on app start
  useEffect(() => {
    let isCancelled = false

    const initializeApp = async () => {
      try {
        await initializeTheme()
        await languageActions.initializeLanguage()

        if (!isDesktop) {
          // Web: the API's env (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN) is the
          // source of truth. Never show the desktop onboarding flow in the
          // browser – just bind the assigned connection best-effort and
          // continue to SignIn. A missing assigned store is a server
          // configuration issue, not a client setup task.
          try {
            await bindWebAssignedConnection()
          } catch (error) {
            console.warn('[init] Failed to bind assigned web connection', error)
          }
          if (isCancelled) return

          startDbStatusMonitor()
          await appSettingsStore.initialize(true)
          await authActions.initializeAuth()
          if (!isCancelled) {
            setIsStartupLoading(false)
          }
          return
        }

        await appSettingsStore.initialize()

        updateService.start()
        startDbStatusMonitor()
        const startupApi = requireDesktopApi().startup
        const status = await startupApi.getStatus()

        if (isCancelled) return

        setStartupStatus(status)

        let resolvedStatus = status
        if (status.status !== 'readyForSignIn') {
          resolvedStatus = await startupApi.initialize()

          if (isCancelled) return

          setStartupStatus(resolvedStatus)
        }

        if (resolvedStatus.status === 'readyForSignIn') {
          await appSettingsStore.initialize(true)
          await authActions.initializeAuth()
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

  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentPage('dashboard')
    }
  }, [isAuthenticated])

  const handleRetryStartup = async () => {
    if (!isDesktop) {
      return
    }

    setIsRetryingStartup(true)
    setStartupError(null)
    setStartupStatus((currentStatus) =>
      currentStatus
        ? {
            ...currentStatus,
            status: 'syncingInitialData',
            lastError: null,
          }
        : currentStatus,
    )

    try {
      const status = await requireDesktopApi().startup.retry()
      setStartupStatus(status)

      if (status.status === 'readyForSignIn') {
        await appSettingsStore.initialize(true)
        await authActions.initializeAuth()
      }
    } catch (error) {
      setStartupError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsRetryingStartup(false)
    }
  }

  const handleConnectionResolved = async (status?: DesktopFirstRunStatus) => {
    if (!isDesktop) {
      // Web never shows ConnectionSetup, so this path should not be reached.
      // Keep a best-effort bind for completeness if it is ever invoked.
      await bindWebAssignedConnection().catch(() => null)
      startDbStatusMonitor()
      await appSettingsStore.initialize(true)
      await authActions.initializeAuth()
      return
    }

    let nextStatus = status || (await requireDesktopApi().startup.getStatus())
    setStartupStatus(nextStatus)

    if (
      nextStatus.status !== 'readyForSignIn' &&
      nextStatus.status !== 'needsConnection' &&
      nextStatus.status !== 'needsEmergencyKit' &&
      nextStatus.status !== 'needsOwner' &&
      nextStatus.status !== 'needsApi'
    ) {
      nextStatus = await requireDesktopApi().startup.initialize()
      setStartupStatus(nextStatus)
    }

    if (nextStatus.status === 'readyForSignIn') {
      await appSettingsStore.initialize(true)
      await authActions.initializeAuth()
    }
  }

  const handleNavigate = (page: string) => {
    setCurrentPage(page)
  }

  const needsConnectionSetup =
    isDesktop &&
    !isAuthenticated &&
    Boolean(startupStatus) &&
    (startupStatus?.status === 'needsConnection' ||
      startupStatus?.status === 'needsEmergencyKit' ||
      startupStatus?.status === 'needsOwner' ||
      startupStatus?.status === 'needsApi')

  // Show loading spinner while checking authentication
  if (isStartupLoading || isLoading) {
    return <FullPageLoader />
  }

  if (startupError) {
    return (
      <div class="drag-region min-h-screen bg-canvas flex items-center justify-center p-6">
        <div class="no-drag max-w-md text-center space-y-4">
          <h1 class="text-heading font-semibold text-void">OpenPOS failed to start</h1>
          <p class="text-sm text-graphite break-words">{startupError}</p>
          <button
            type="button"
            class="rounded-buttons bg-accent text-canvas px-4 py-2 text-sm"
            onClick={() => {
              window.location.reload()
            }}
          >
            Retry
          </button>
        </div>
        <Toaster position="top-right" />
      </div>
    )
  }

  if (needsConnectionSetup) {
    return (
      <>
        <ConnectionSetup status={startupStatus} onResolved={handleConnectionResolved} />
        <Toaster position="top-right" />
      </>
    )
  }

  if (isDesktop && !isAuthenticated && startupStatus && startupStatus.status !== 'readyForSignIn') {
    return (
      <>
        <FirstRunSync status={startupStatus} isRetrying={isRetryingStartup} onRetry={handleRetryStartup} />
        <Toaster position="top-right" />
      </>
    )
  }

  // Show SignIn page if not authenticated
  if (!isAuthenticated) {
    return (
      <>
        <SignIn />
        <Toaster position="top-right" />
      </>
    )
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={handleNavigate} />
      case 'orders':
        return <Orders />
      case 'products':
        return <Products />
      case 'customers':
        return <Customers />
      case 'members':
        return <Members />
      case 'analytics':
        return <Analytics />
      case 'settings':
        return <Settings />
      default:
        return (
          <div class="bg-canvas rounded-cards border border-fog-border p-6">
            <h3 class="text-lg font-semibold mb-4 capitalize text-void">{currentPage}</h3>
            <p class="text-graphite">This page is under construction.</p>
          </div>
        )
    }
  }

  return (
    <>
      <Layout currentPage={currentPage} onNavigate={handleNavigate}>
        {renderPage()}
      </Layout>
      <Toaster position="top-right" />
    </>
  )
}

export default App
