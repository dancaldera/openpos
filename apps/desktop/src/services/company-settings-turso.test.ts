import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestApiJson, execute, query, trigger } = vi.hoisted(() => ({
  requestApiJson: vi.fn(async () => ({})),
  execute: vi.fn(async (_sql: string, _params: unknown[] = []) => ({ lastInsertId: 0, rowsAffected: 1 })),
  query: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<Array<Record<string, unknown>>> => []),
  trigger: vi.fn(async () => ({})),
}))

vi.mock('../lib/api-client', () => ({
  requestApiJson,
}))

vi.mock('../lib/db-adapter', () => ({
  execute,
  query,
}))

vi.mock('../lib/desktop', () => ({
  requireDesktopApi: vi.fn(() => ({
    sync: { trigger },
  })),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: true,
}))

const { companySettingsService } = await import('./company-settings-turso')

function dbSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Caldera Market',
    app_name: 'OpenPOS',
    description: 'Tienda',
    tax_enabled: 1,
    tax_percentage: 16,
    currency_symbol: 'MX$',
    language: 'es',
    logo_url: 'https://example.com/logo.png',
    address: 'Av. Principal 123',
    phone: '555-0100',
    email: 'store@example.com',
    website: 'https://example.com',
    receipt_footer: 'Gracias',
    theme_mode: 'dark',
    theme_palette: 'ocean',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('CompanySettingsService.getSettings desktop', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    query.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('maps the database row to settings', async () => {
    query.mockResolvedValueOnce([dbSettings()])

    const settings = await companySettingsService.getSettings()

    expect(settings).toMatchObject({
      id: '1',
      name: 'Caldera Market',
      appName: 'OpenPOS',
      taxEnabled: true,
      taxPercentage: 16,
      currencySymbol: 'MX$',
      language: 'es',
      themeMode: 'dark',
      themePalette: 'ocean',
    })
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('normalizes unknown theme values', async () => {
    query.mockResolvedValueOnce([dbSettings({ theme_mode: 'neon', theme_palette: 'neon' })])

    const settings = await companySettingsService.getSettings()

    expect(settings.themeMode).toBeUndefined()
    expect(settings.themePalette).toBe('classic')
  })

  it('throws when settings are missing or the query fails', async () => {
    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(companySettingsService.getSettings()).rejects.toThrow('Failed to fetch company settings')

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(companySettingsService.getSettings()).rejects.toThrow('Failed to fetch company settings')
    expect(console.error).toHaveBeenCalled()
  })
})

describe('CompanySettingsService.updateSettings', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    trigger.mockClear()
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    query.mockResolvedValue([dbSettings()])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('validates name, tax percentage, email, and website', async () => {
    await expect(companySettingsService.updateSettings({ name: '   ' })).resolves.toMatchObject({
      success: false,
      error: 'Company name is required',
    })
    await expect(companySettingsService.updateSettings({ taxPercentage: -1 })).resolves.toMatchObject({
      success: false,
    })
    await expect(companySettingsService.updateSettings({ taxPercentage: 101 })).resolves.toMatchObject({
      success: false,
      error: 'Tax percentage must be between 0 and 100',
    })
    await expect(companySettingsService.updateSettings({ email: 'not-an-email' })).resolves.toMatchObject({
      success: false,
      error: 'Please enter a valid email address',
    })
    await expect(companySettingsService.updateSettings({ website: 'not a url' })).resolves.toMatchObject({
      success: false,
      error: 'Please enter a valid website URL',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('updates every field and triggers sync', async () => {
    const result = await companySettingsService.updateSettings({
      name: 'Nuevo',
      appName: 'OpenPOS 2',
      description: 'Desc',
      taxEnabled: false,
      taxPercentage: 8,
      currencySymbol: '€',
      language: 'en',
      logoUrl: 'https://example.com/new.png',
      address: 'Calle 1',
      phone: '555-0200',
      email: 'new@example.com',
      website: 'https://new.example.com',
      themeMode: 'light',
      themePalette: 'forest',
    })

    expect(result.success).toBe(true)
    expect(result.settings?.name).toBe('Caldera Market')
    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain('UPDATE company_settings SET')
    expect(params).toContain('Nuevo')
    expect(params).toContain(0)
    expect(params).toContain(8)
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('stores null for cleared optional fields', async () => {
    await companySettingsService.updateSettings({ logoUrl: '', address: '', phone: '', email: '', website: '' })

    const [, params] = execute.mock.calls[0]
    expect(params).toContain(null)
  })

  it('skips the update statement when nothing changed', async () => {
    const result = await companySettingsService.updateSettings({})

    expect(result.success).toBe(true)
    expect(execute).not.toHaveBeenCalled()
    expect(trigger).not.toHaveBeenCalled()
  })

  it('accepts boundary tax values and empty email or website', async () => {
    query.mockResolvedValue([dbSettings()])

    const zero = await companySettingsService.updateSettings({ taxPercentage: 0, email: '', website: '' })
    expect(zero.success).toBe(true)

    const hundred = await companySettingsService.updateSettings({ taxPercentage: 100 })
    expect(hundred.success).toBe(true)
  })

  it('enables taxes and survives sync failures', async () => {
    query.mockResolvedValue([dbSettings()])
    trigger.mockRejectedValueOnce(new Error('offline'))

    const result = await companySettingsService.updateSettings({ taxEnabled: true })

    expect(result.success).toBe(true)
    const [, params] = execute.mock.calls[0]
    expect(params).toContain(1)
  })

  it('returns an error when the update fails', async () => {
    execute.mockRejectedValueOnce(new Error('db down'))

    const result = await companySettingsService.updateSettings({ name: 'Nuevo' })

    expect(result).toEqual({ success: false, error: 'Failed to update company settings' })
  })
})

describe('CompanySettingsService.resetToDefaults', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    trigger.mockClear()
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    query.mockResolvedValue([dbSettings()])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('resets settings and triggers sync', async () => {
    const result = await companySettingsService.resetToDefaults()

    expect(result.success).toBe(true)
    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain('UPDATE company_settings SET')
    expect(params).toContain('Titanic POS')
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('returns an error when reset fails', async () => {
    execute.mockRejectedValueOnce(new Error('db down'))

    const result = await companySettingsService.resetToDefaults()

    expect(result).toEqual({ success: false, error: 'Failed to reset company settings' })
  })

  it('survives sync failures', async () => {
    trigger.mockRejectedValueOnce(new Error('offline'))

    const result = await companySettingsService.resetToDefaults()

    expect(result.success).toBe(true)
  })
})

describe('CompanySettingsService tax helpers', () => {
  beforeEach(() => {
    query.mockReset()
    query.mockResolvedValue([dbSettings()])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('computes the tax rate from settings', async () => {
    await expect(companySettingsService.getTaxRate()).resolves.toBeCloseTo(0.16)

    query.mockReset()
    query.mockResolvedValue([dbSettings({ tax_enabled: 0 })])

    await expect(companySettingsService.getTaxRate()).resolves.toBe(0)
  })

  it('falls back to a default rate when settings fail', async () => {
    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(companySettingsService.getTaxRate()).resolves.toBe(0.1)
  })

  it('calculates tax and totals', async () => {
    await expect(companySettingsService.calculateTax(100)).resolves.toBeCloseTo(16)
    await expect(companySettingsService.calculateTotalWithTax(100)).resolves.toMatchObject({
      tax: expect.any(Number),
      total: expect.any(Number),
    })
  })
})
