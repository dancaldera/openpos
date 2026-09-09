import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestApiJson, execute, query, encryptSecret } = vi.hoisted(() => ({
  requestApiJson: vi.fn(async (): Promise<Record<string, unknown>> => ({})),
  execute: vi.fn(async (_sql: string, _params: unknown[] = []) => ({ lastInsertId: 0, rowsAffected: 1 })),
  query: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
  encryptSecret: vi.fn(async (value: string) => `enc:${value}`),
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
    encryptSecret,
  })),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: true,
}))

const { objectStorageSettingsService } = await import('./object-storage-settings')

const apiSettings = {
  configured: true,
  endpoint: 'https://s3.example.com',
  region: 'us-east-1',
  bucket: 'store-images',
  urlTtlSeconds: 900,
  updatedAt: '2026-08-29T00:00:00.000Z',
}

describe('ObjectStorageSettingsService local mirror', () => {
  beforeEach(() => {
    requestApiJson.mockClear()
    execute.mockClear()
    query.mockClear()
    encryptSecret.mockClear()
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    query.mockResolvedValue([])
  })

  it('saves through the API and mirrors the configuration locally with encrypted secrets', async () => {
    requestApiJson.mockResolvedValueOnce({ settings: apiSettings })

    const result = await objectStorageSettingsService.saveSettings({
      endpoint: apiSettings.endpoint,
      region: apiSettings.region,
      bucket: apiSettings.bucket,
      accessKeyId: 'AKIA123',
      secretAccessKey: 'shhh',
      urlTtlSeconds: 900,
    })

    expect(result).toEqual(apiSettings)
    expect(requestApiJson).toHaveBeenCalledWith(
      '/api/settings/object-storage',
      expect.objectContaining({ method: 'PUT' }),
    )

    expect(encryptSecret).toHaveBeenCalledWith('AKIA123')
    expect(encryptSecret).toHaveBeenCalledWith('shhh')
    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain('UPDATE object_storage_settings')
    expect(params).toEqual([
      apiSettings.endpoint,
      apiSettings.region,
      apiSettings.bucket,
      'enc:AKIA123',
      'enc:shhh',
      900,
      expect.any(String),
    ])
  })

  it('keeps previously stored encrypted secrets when the caller did not re-enter them', async () => {
    requestApiJson.mockResolvedValueOnce({ settings: apiSettings })
    query.mockResolvedValueOnce([{ access_key_id_encrypted: 'enc:OLD', secret_access_key_encrypted: 'enc:OLDER' }])

    await objectStorageSettingsService.saveSettings({
      endpoint: apiSettings.endpoint,
      region: apiSettings.region,
      bucket: apiSettings.bucket,
      urlTtlSeconds: 900,
    })

    expect(encryptSecret).not.toHaveBeenCalled()
    const [, params] = execute.mock.calls[0]
    expect(params).toContain('enc:OLD')
    expect(params).toContain('enc:OLDER')
  })

  it('inserts the local row when the mirror update matches nothing', async () => {
    requestApiJson.mockResolvedValueOnce({ settings: apiSettings })
    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })

    await objectStorageSettingsService.saveSettings({
      endpoint: apiSettings.endpoint,
      region: apiSettings.region,
      bucket: apiSettings.bucket,
      accessKeyId: 'AKIA123',
      secretAccessKey: 'shhh',
      urlTtlSeconds: 900,
    })

    const [insertSql] = execute.mock.calls[1]
    expect(insertSql).toContain('INSERT INTO object_storage_settings')
  })

  it('reads settings through the API', async () => {
    requestApiJson.mockResolvedValueOnce({ settings: apiSettings })

    const result = await objectStorageSettingsService.getSettings()

    expect(result).toEqual(apiSettings)
    expect(requestApiJson).toHaveBeenCalledWith(
      '/api/settings/object-storage',
      expect.objectContaining({ requireAuth: true }),
    )
  })

  it('nulls secrets when nothing was stored or entered', async () => {
    requestApiJson.mockResolvedValueOnce({ settings: apiSettings })

    await objectStorageSettingsService.saveSettings({
      endpoint: apiSettings.endpoint,
      region: apiSettings.region,
      bucket: apiSettings.bucket,
      urlTtlSeconds: 900,
    })

    const [, params] = execute.mock.calls[0]
    expect(params).toContain(null)
  })

  it('clears through the API and deletes the local mirror row', async () => {
    requestApiJson.mockResolvedValueOnce({ success: true })

    await objectStorageSettingsService.clearSettings()

    expect(requestApiJson).toHaveBeenCalledWith(
      '/api/settings/object-storage',
      expect.objectContaining({ method: 'DELETE' }),
    )
    const [sql] = execute.mock.calls[0]
    expect(sql).toContain('DELETE FROM object_storage_settings')
  })
})
