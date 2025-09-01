import { useEffect, useState } from 'preact/hooks'
import { Toaster } from 'sonner'
import Layout from './components/Layout'
import { useAuth } from './hooks/useAuth'
import Analytics from './pages/Analytics'
import ComponentShowcase from './pages/ComponentShowcase'
import Dashboard from './pages/Dashboard'
import Members from './pages/Members'
import Products from './pages/Products'
import Settings from './pages/Settings'
import SignIn from './pages/SignIn'
import { authActions } from './stores/auth/authActions'
import { languageActions } from './stores/language/languageActions'
import './App.css'
import Orders from './pages/Orders'

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const { isAuthenticated, isLoading, signIn } = useAuth()

  // Initialize auth and language on app start
  useEffect(() => {
    authActions.initializeAuth()
    languageActions.initializeLanguage()
  }, [])

  const handleNavigate = (page: string) => {
    setCurrentPage(page)
  }

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div class="min-h-screen bg-gray-100 flex items-center justify-center">
        <div class="text-center">
          <div class="w-8 h-8 bg-blue-600 rounded-full animate-spin border-2 border-transparent border-t-white mx-auto mb-4"></div>
          <p class="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Show SignIn page if not authenticated
  if (!isAuthenticated) {
    return (
      <>
        <SignIn onSignIn={signIn} />
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
      case 'members':
        return <Members />
      case 'analytics':
        return <Analytics />
      case 'settings':
        return <Settings onNavigate={handleNavigate} />
      case 'component-showcase':
        return <ComponentShowcase />
      default:
        return (
          <div class="bg-white rounded-lg shadow p-6">
            <h3 class="text-lg font-semibold mb-4 capitalize">{currentPage}</h3>
            <p class="text-gray-600">This page is under construction.</p>
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
