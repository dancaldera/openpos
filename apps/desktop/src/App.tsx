import { useEffect, useState } from 'preact/hooks'
import { Toaster } from 'sonner'
import Layout from './components/Layout'
import { FullPageLoader } from './components/ui/PageLoader'
import { useAuth } from './hooks/useAuth'
import { startDbStatusMonitor, stopDbStatusMonitor } from './lib/db-status'
import { type DesktopFirstRunStatus, requireDesktopApi } from './lib/desktop'
import { isDesktop } from './lib/platform'
import Analytics from './pages/Analytics'
import Customers from './pages/Customers'
import Dashboard from './pages/Dashboard'
import FirstRunSync from './pages/FirstRunSync'
import Members from './pages/Members'
import Orders from './pages/Orders'
import Products from './pages/Products'
import Settings from './pages/Settings'
import SignIn from './pages/SignIn'
import { appSettingsStore } from './stores/appSettings/appSettingsStore'
import { authActions } from './stores/auth/authActions'
import { languageActions } from './stores/language/languageActions'
import './App.css'

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [startupStatus, setStartupStatus] = useState<DesktopFirstRunStatus | null>(null)
  const [isStartupLoading, setIsStartupLoading] = useState(true)
  const [isRetryingStartup, setIsRetryingStartup] = useState(false)
  const { isAuthenticated, isLoading } = useAuth()

  // Initialize auth, language, and app settings on app start
  useEffect(() => {
    let isCancelled = false

    const initializeApp = async () => {
      await languageActions.initializeLanguage()
      await appSettingsStore.initialize()

      if (!isDesktop) {
        await authActions.initializeAuth()
        if (!isCancelled) {
          setIsStartupLoading(false)
        }
        return
      }

      try {
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
    } finally {
      setIsRetryingStartup(false)
    }
  }

  const handleNavigate = (page: string) => {
    setCurrentPage(page)
  }

  // Show loading spinner while checking authentication
  if (isStartupLoading || isLoading) {
    return <FullPageLoader />
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
