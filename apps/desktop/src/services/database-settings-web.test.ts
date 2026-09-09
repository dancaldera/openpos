import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const { databaseSettingsService } = await import('./database-settings')

const apiSettings = {
  configured: true,
  hostedProvisioning: false,
  databaseUrl: 'libsql://db.turso.io',
  org: null,
  group: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('DatabaseSettingsService web', () => {
  beforeEach(() => {
    requestApiJson.mockReset()
    execute.mockReset()
    requestApiJson.mockResolvedValue({})
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
  })

  it('reads settings through the API', async () => {
    requestApiJson.mockResolvedValueOnce({ settings: apiSettings })

    const settings = await databaseSettingsService.getSettings()

    expect(settings).toEqual(apiSettings)
    expect(requestApiJson).toHaveBeenCalledWith('/api/settings/database', { requireAuth: true })
    expect(query).not.toHaveBeenCalled()
  })

  it('saves settings through the API', async () => {
    requestApiJson.mockResolvedValueOnce({ settings: apiSettings })

    const settings = await databaseSettingsService.saveSettings({ databaseUrl: 'libsql://db.turso.io' })

    expect(settings).toEqual(apiSettings)
    expect(requestApiJson).toHaveBeenCalledWith(
      '/api/settings/database',
      expect.objectContaining({ method: 'PUT', requireAuth: true }),
    )
  })

  it('ignores a connection without a data plane', async () => {
    requestApiJson.mockResolvedValueOnce({ settings: apiSettings, connection: { key: 'OPK_1' } })

    const settings = await databaseSettingsService.saveSettings({})

    expect(settings).toEqual(apiSettings)
  })

  it('ignores a connection data plane in web mode', async () => {
    requestApiJson.mockResolvedValueOnce({
      settings: apiSettings,
      connection: { key: 'OPK_1', dataPlane: { url: 'libsql://db.turso.io' } },
    })

    const settings = await databaseSettingsService.saveSettings({})

    expect(settings).toEqual(apiSettings)
  })

  it('clears settings through the API', async () => {
    requestApiJson.mockResolvedValueOnce({ success: true })

    await databaseSettingsService.clearSettings()

    expect(requestApiJson).toHaveBeenCalledWith('/api/settings/database', expect.objectContaining({ method: 'DELETE' }))
    expect(execute).not.toHaveBeenCalled()
  })
})
