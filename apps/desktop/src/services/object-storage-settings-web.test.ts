import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestApiJson, execute } = vi.hoisted(() => ({
  requestApiJson: vi.fn(async (): Promise<Record<string, unknown>> => ({})),
  execute: vi.fn(async () => ({ lastInsertId: 0, rowsAffected: 0 })),
}))

vi.mock('../lib/api-client', () => ({
  requestApiJson,
}))

vi.mock('../lib/db-adapter', () => ({
  execute,
  query: vi.fn(async () => []),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: false,
}))

const { objectStorageSettingsService } = await import('./object-storage-settings')

const apiSettings = {
  configured: true,
  endpoint: 'https://s3.example.com',
  region: 'us-east-1',
  bucket: 'store-images',
  urlTtlSeconds: 900,
  updatedAt: null,
}

describe('ObjectStorageSettingsService on web', () => {
  beforeEach(() => {
    requestApiJson.mockClear()
    execute.mockClear()
  })

  it('saves through the API without a local mirror', async () => {
    requestApiJson.mockResolvedValueOnce({ settings: apiSettings })

    const result = await objectStorageSettingsService.saveSettings({
      endpoint: apiSettings.endpoint,
      region: apiSettings.region,
      bucket: apiSettings.bucket,
      urlTtlSeconds: 900,
    })

    expect(result).toEqual(apiSettings)
    expect(execute).not.toHaveBeenCalled()
  })

  it('clears through the API without touching local storage', async () => {
    requestApiJson.mockResolvedValueOnce({ success: true })

    await objectStorageSettingsService.clearSettings()

    expect(requestApiJson).toHaveBeenCalledWith(
      '/api/settings/object-storage',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(execute).not.toHaveBeenCalled()
  })
})
