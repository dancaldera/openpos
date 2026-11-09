// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  resetToDefaults: vi.fn(),
  changePassword: vi.fn(),
  verifyInternalSecret: vi.fn(),
  getStorage: vi.fn(),
  saveStorage: vi.fn(),
  clearStorage: vi.fn(),
  changeLanguage: vi.fn(),
  signOut: vi.fn(),
  clearLocalClientState: vi.fn(),
  getStoredConnectionKey: vi.fn(() => ''),
  fetchCurrentStore: vi.fn(),
  factoryReset: vi.fn(),
  getActive: vi.fn(),
  getConfig: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  isDesktop: false,
  isAdmin: true,
  tab: undefined as string | undefined,
}))

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key),
    getCurrentLocale: () => 'en',
    getSupportedLocales: () => [
      { code: 'en', name: 'English', nativeName: 'English', flag: '' },
      { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '' },
    ],
  }),
}))
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ isAdmin: mocks.isAdmin, signOut: mocks.signOut }),
}))
vi.mock('../lib/router', () => ({
  hrefFor: (path: string) => `#/${path}`,
  navigate: mocks.navigate,
  useRoute: () => ({ path: 'settings', section: 'settings', params: mocks.tab ? [mocks.tab] : [] }),
}))
vi.mock('../lib/toast', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: vi.fn(), warning: vi.fn() },
}))
vi.mock('../lib/platform', () => ({
  get isDesktop() {
    return mocks.isDesktop
  },
}))
vi.mock('../lib/desktop', () => ({
  getDesktopApi: () => undefined,
  requireDesktopApi: () => ({
    getConfig: mocks.getConfig,
    connection: { factoryReset: mocks.factoryReset, getActive: mocks.getActive, leave: vi.fn() },
    sync: { resetLocal: vi.fn() },
    connectivity: { getStatus: vi.fn() },
    setApiUrl: vi.fn(),
  }),
}))
vi.mock('../lib/api-config', () => ({ resetApiUrlCache: vi.fn() }))
vi.mock('../services/company-settings-turso', () => ({
  SUPPORTED_CURRENCIES: [
    { symbol: '$', name: 'US Dollar (USD)' },
    { symbol: '€', name: 'Euro (EUR)' },
  ],
  companySettingsService: {
    getSettings: mocks.getSettings,
    updateSettings: mocks.updateSettings,
    resetToDefaults: mocks.resetToDefaults,
  },
}))
vi.mock('../services/auth-turso', () => ({
  authService: { changePassword: mocks.changePassword, verifyInternalSecret: mocks.verifyInternalSecret },
}))
vi.mock('../services/object-storage-settings', () => ({
  objectStorageSettingsService: {
    getSettings: mocks.getStorage,
    saveSettings: mocks.saveStorage,
    clearSettings: mocks.clearStorage,
  },
}))
vi.mock('../services/connections', () => ({
  clearLocalClientState: mocks.clearLocalClientState,
  clearStoredConnectionKey: vi.fn(),
  fetchCurrentStore: mocks.fetchCurrentStore,
  getStoredConnectionKey: mocks.getStoredConnectionKey,
}))
vi.mock('../stores/language/languageActions', () => ({
  languageActions: { changeLanguage: mocks.changeLanguage },
}))

const { default: Settings } = await import('./Settings')

const company = {
  id: '1',
  name: 'Corner Cafe',
  appName: 'OpenPOS',
  description: 'Coffee and pastries',
  taxEnabled: true,
  taxPercentage: 10,
  currencySymbol: '$',
  language: 'en',
  address: '1 Main St',
  phone: '',
  email: 'hello@cafe.test',
  website: '',
  createdAt: '',
  updatedAt: '',
}

const storage = {
  configured: true,
  endpoint: 'https://r2.example.com',
  region: 'auto',
  bucket: 'images',
  urlTtlSeconds: 900,
  updatedAt: null,
}

function stubReload() {
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { value: { reload, hash: '' }, writable: true, configurable: true })
  return reload
}

function type(name: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
}

async function unlockAdvanced() {
  mocks.tab = 'advanced'
  render(<Settings />)
  // Web users without the admin role only get the tab once their connection key loads.
  fireEvent.change(await screen.findByLabelText(/auth\.recovery\.internalSecret/), { target: { value: 'secret-key' } })
  fireEvent.click(screen.getByRole('button', { name: 'settings.advancedUnlock' }))
  await waitFor(() => expect(mocks.verifyInternalSecret).toHaveBeenCalledWith('secret-key'))
}

beforeEach(() => {
  mocks.getSettings.mockResolvedValue(company)
  mocks.updateSettings.mockImplementation(async (updates: object) => ({
    success: true,
    settings: { ...company, ...updates },
  }))
  mocks.getStorage.mockResolvedValue(storage)
  mocks.verifyInternalSecret.mockResolvedValue(undefined)
  mocks.getStoredConnectionKey.mockReturnValue('')
  mocks.isDesktop = false
  mocks.isAdmin = true
  mocks.tab = undefined
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Settings', () => {
  it('shows the store details with tab links and no emoji', async () => {
    render(<Settings />)
    expect(await screen.findByDisplayValue('Corner Cafe')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'settings.tabPreferences' }).getAttribute('href')).toBe(
      '#/settings/preferences',
    )
    expect(screen.getByRole('link', { name: 'settings.advanced' }).getAttribute('href')).toBe('#/settings/advanced')
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('saves edited store details with the fixed app name', async () => {
    render(<Settings />)
    await screen.findByDisplayValue('Corner Cafe')
    const save = screen.getByRole('button', { name: 'settings.saveChanges' })
    expect(save.getAttribute('aria-disabled') === 'true' || save.hasAttribute('disabled')).toBe(true)

    type(/settings\.companyName/, 'Corner Cafe Downtown')
    type(/common\.address/, '')
    fireEvent.click(screen.getByRole('button', { name: 'settings.saveChanges' }))

    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith({
        name: 'Corner Cafe Downtown',
        description: 'Coffee and pastries',
        address: '',
        phone: '',
        email: 'hello@cafe.test',
        website: '',
        taxEnabled: true,
        taxPercentage: 10,
        currencySymbol: '$',
        appName: 'OpenPOS',
      }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('settings.settingsUpdated')
  })

  it('shows a save error inline', async () => {
    mocks.updateSettings.mockResolvedValue({ success: false, error: 'Please enter a valid email address' })
    render(<Settings />)
    await screen.findByDisplayValue('Corner Cafe')
    type(/common\.email/, 'not-an-email')
    fireEvent.click(screen.getByRole('button', { name: 'settings.saveChanges' }))
    expect(await screen.findByText('Please enter a valid email address')).toBeTruthy()
  })

  it('hides the tax rate when tax is turned off', async () => {
    render(<Settings />)
    await screen.findByDisplayValue('Corner Cafe')
    expect(screen.getByLabelText(/settings\.taxRate/)).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: /settings\.enableTax/ }))
    expect(screen.queryByLabelText(/settings\.taxRate/)).toBeNull()
  })

  it('resets to defaults only after an in-page confirmation', async () => {
    mocks.resetToDefaults.mockResolvedValue({ success: true, settings: { ...company, name: 'Titanic POS' } })
    render(<Settings />)
    await screen.findByDisplayValue('Corner Cafe')
    fireEvent.click(screen.getByRole('button', { name: 'settings.resetDefaults' }))
    expect(mocks.resetToDefaults).not.toHaveBeenCalled()
    expect(screen.getByText('settings.resetConfirm')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'settings.resetSettings' }))
    await waitFor(() => expect(mocks.resetToDefaults).toHaveBeenCalled())
    expect(await screen.findByDisplayValue('Titanic POS')).toBeTruthy()
  })

  it('applies theme mode and palette and saves them to the store', async () => {
    mocks.tab = 'preferences'
    render(<Settings />)
    fireEvent.click(screen.getByRole('radio', { name: 'settings.darkMode' }))
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledWith({ themeMode: 'dark' }))
    expect(document.documentElement.dataset.mode).toBe('dark')

    fireEvent.click(screen.getByRole('checkbox', { name: 'settings.paletteOcean' }))
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledWith({ themePalette: 'ocean' }))
    expect(document.documentElement.dataset.palette).toBe('ocean')
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('changes the password', async () => {
    mocks.tab = 'security'
    mocks.changePassword.mockResolvedValue({ success: true })
    render(<Settings />)
    type(/settings\.currentPassword/, 'Old-pass1!')
    type(/auth\.recovery\.newPassword/, 'New-pass1!')
    type(/auth\.recovery\.confirmPassword/, 'New-pass1!')
    fireEvent.click(screen.getByRole('button', { name: 'settings.changePassword' }))
    await waitFor(() => expect(mocks.changePassword).toHaveBeenCalledWith('Old-pass1!', 'New-pass1!'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('settings.changePasswordSuccess')
  })

  it('rejects mismatched passwords without calling the service', async () => {
    mocks.tab = 'security'
    render(<Settings />)
    type(/settings\.currentPassword/, 'Old-pass1!')
    type(/auth\.recovery\.newPassword/, 'New-pass1!')
    type(/auth\.recovery\.confirmPassword/, 'Other-pass1!')
    fireEvent.click(screen.getByRole('button', { name: 'settings.changePassword' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('auth.recovery.passwordsDoNotMatch'))
    expect(mocks.changePassword).not.toHaveBeenCalled()
  })

  it('hides advanced settings from web users without admin role or connection key', async () => {
    mocks.isAdmin = false
    mocks.tab = 'advanced'
    render(<Settings />)
    await screen.findByDisplayValue('Corner Cafe')
    expect(screen.queryByRole('link', { name: 'settings.advanced' })).toBeNull()
  })

  it('keeps advanced settings locked until the internal key is verified', async () => {
    await unlockAdvanced()
    expect(await screen.findByText('settings.objectStorage')).toBeTruthy()
    expect(screen.getByText('settings.dangerZone')).toBeTruthy()
    expect(screen.queryByText('settings.apiUrl')).toBeNull()
  })

  it('hides object storage from non-admins', async () => {
    mocks.isAdmin = false
    mocks.getStoredConnectionKey.mockReturnValue('key-123')
    mocks.fetchCurrentStore.mockResolvedValue({ name: 'Corner Cafe' })
    await unlockAdvanced()
    expect(await screen.findByText('key-123')).toBeTruthy()
    expect(screen.queryByText('settings.objectStorage')).toBeNull()
    expect(mocks.getStorage).not.toHaveBeenCalled()
  })

  it('saves object storage settings', async () => {
    mocks.saveStorage.mockResolvedValue(storage)
    await unlockAdvanced()
    await screen.findByDisplayValue('https://r2.example.com')
    type(/settings\.s3Bucket/, 'product-images')
    fireEvent.click(screen.getByRole('button', { name: 'settings.saveObjectStorageSettings' }))
    await waitFor(() =>
      expect(mocks.saveStorage).toHaveBeenCalledWith({
        endpoint: 'https://r2.example.com',
        region: 'auto',
        bucket: 'product-images',
        accessKeyId: undefined,
        secretAccessKey: undefined,
        urlTtlSeconds: 900,
      }),
    )
  })

  it('clears object storage after confirming in the page', async () => {
    mocks.clearStorage.mockResolvedValue(undefined)
    await unlockAdvanced()
    await screen.findByDisplayValue('https://r2.example.com')
    fireEvent.click(screen.getByRole('button', { name: 'settings.objectStorageClear' }))
    expect(mocks.clearStorage).not.toHaveBeenCalled()
    const confirm = screen.getAllByRole('button', { name: 'settings.objectStorageClear' })
    fireEvent.click(confirm[confirm.length - 1])
    await waitFor(() => expect(mocks.clearStorage).toHaveBeenCalled())
  })

  it('resets the web client without the desktop bridge', async () => {
    const reload = stubReload()
    await unlockAdvanced()
    fireEvent.click(await screen.findByRole('button', { name: 'settings.dangerZoneReset' }))
    expect(screen.getByText('settings.dangerZoneConfirm')).toBeTruthy()
    const confirm = screen.getAllByRole('button', { name: 'settings.dangerZoneReset' })
    fireEvent.click(confirm[confirm.length - 1])
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled())
    expect(mocks.factoryReset).not.toHaveBeenCalled()
    expect(mocks.clearLocalClientState).toHaveBeenCalled()
    expect(reload).toHaveBeenCalled()
  })

  it('factory resets the desktop app', async () => {
    mocks.isDesktop = true
    mocks.getActive.mockResolvedValue({ key: 'key-123', storeName: 'Corner Cafe' })
    mocks.getConfig.mockResolvedValue({ apiUrl: 'https://api.example.com' })
    mocks.factoryReset.mockResolvedValue(undefined)
    const reload = stubReload()
    await unlockAdvanced()
    expect(await screen.findByDisplayValue('https://api.example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'settings.dangerZoneReset' }))
    const confirm = screen.getAllByRole('button', { name: 'settings.dangerZoneReset' })
    fireEvent.click(confirm[confirm.length - 1])
    await waitFor(() => expect(mocks.factoryReset).toHaveBeenCalled())
    expect(mocks.signOut).toHaveBeenCalled()
    expect(reload).toHaveBeenCalled()
  })
})
