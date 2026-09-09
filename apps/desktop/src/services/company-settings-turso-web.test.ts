import { beforeEach, describe, expect, it, vi } from 'vitest'

class MemoryStorage {
  private values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  clear(): void {
    this.values.clear()
  }
}

const { requestApiJson, execute, query } = vi.hoisted(() => ({
  requestApiJson: vi.fn(async () => ({})),
  execute: vi.fn(async (_sql: string, _params: unknown[] = []) => ({ lastInsertId: 0, rowsAffected: 1 })),
  query: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<Array<Record<string, unknown>>> => []),
}))

vi.mock('../lib/api-client', () => ({
  requestApiJson,
}))

vi.mock('../lib/db-adapter', () => ({
  execute,
  query,
}))

vi.mock('../lib/desktop', () => ({
  requireDesktopApi: vi.fn(() => {
    throw new Error('Desktop API should not be used in web mode tests')
  }),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: false,
}))

const { companySettingsService } = await import('./company-settings-turso')

describe('CompanySettingsService.getSettings web', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    requestApiJson.mockReset()
    query.mockReset()
    query.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns public settings before login', async () => {
    requestApiJson.mockResolvedValueOnce({
      name: 'Tienda Web',
      appName: 'OpenPOS Web',
      currencySymbol: '€',
      language: 'es',
      logoUrl: 'https://example.com/logo.png',
      themeMode: 'dark',
      themePalette: 'ocean',
    })

    const settings = await companySettingsService.getSettings()

    expect(requestApiJson).toHaveBeenCalledWith('/api/settings/public')
    expect(settings).toMatchObject({
      id: '1',
      name: 'Tienda Web',
      appName: 'OpenPOS Web',
      taxEnabled: false,
      taxPercentage: 0,
      currencySymbol: '€',
      language: 'es',
      themeMode: 'dark',
      themePalette: 'ocean',
    })
  })

  it('fills defaults for missing public fields', async () => {
    requestApiJson.mockResolvedValueOnce({})

    const settings = await companySettingsService.getSettings()

    expect(settings).toMatchObject({
      id: '1',
      name: 'My Store',
      appName: 'OpenPOS',
      description: '',
      taxEnabled: false,
      taxPercentage: 0,
      currencySymbol: '$',
      language: 'en',
    })
    expect(settings.logoUrl).toBeUndefined()
    expect(settings.themeMode).toBeUndefined()
    expect(settings.themePalette).toBe('classic')
  })

  it('throws when the public endpoint fails', async () => {
    requestApiJson.mockRejectedValueOnce(new Error('offline'))

    await expect(companySettingsService.getSettings()).rejects.toThrow('Failed to fetch company settings')
  })

  it('uses the database after login without syncing', async () => {
    storage.setItem('auth_token', 'jwt')
    query.mockResolvedValueOnce([
      {
        id: 1,
        name: 'Db Store',
        app_name: 'OpenPOS',
        description: '',
        tax_enabled: 0,
        tax_percentage: 0,
        currency_symbol: '$',
        language: 'en',
        created_at: '',
        updated_at: '',
      },
    ])

    const settings = await companySettingsService.getSettings()

    expect(settings.name).toBe('Db Store')
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('updates settings without triggering desktop sync', async () => {
    storage.setItem('auth_token', 'jwt')
    query.mockResolvedValue([
      {
        id: 1,
        name: 'Db Store',
        app_name: 'OpenPOS',
        description: '',
        tax_enabled: 0,
        tax_percentage: 0,
        currency_symbol: '$',
        language: 'en',
        created_at: '',
        updated_at: '',
      },
    ])

    const result = await companySettingsService.updateSettings({ name: 'Renamed' })

    expect(result.success).toBe(true)
    expect(execute).toHaveBeenCalled()
  })

  it('resets settings without triggering desktop sync', async () => {
    storage.setItem('auth_token', 'jwt')
    query.mockResolvedValue([
      {
        id: 1,
        name: 'Db Store',
        app_name: 'OpenPOS',
        description: '',
        tax_enabled: 0,
        tax_percentage: 0,
        currency_symbol: '$',
        language: 'en',
        created_at: '',
        updated_at: '',
      },
    ])

    const result = await companySettingsService.resetToDefaults()

    expect(result.success).toBe(true)
    expect(execute).toHaveBeenCalled()
  })
})
