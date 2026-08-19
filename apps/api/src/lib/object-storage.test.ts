import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({
  query: vi.fn(),
}))

vi.mock('./turso.js', () => ({ query }))

const originalJwtSecret = process.env.JWT_SECRET

process.env.JWT_SECRET = 'object-storage-test-secret'

afterEach(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
})

const { encryptSecret } = await import('./password-reset-email')
const { getObjectStorageConfig } = await import('./object-storage')

describe('object storage configuration', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('loads and decrypts settings stored in the database', async () => {
    query.mockResolvedValue([
      {
        endpoint: 'https://account.r2.cloudflarestorage.com',
        region: 'auto',
        bucket: 'product-images',
        access_key_id_encrypted: encryptSecret('access-key'),
        secret_access_key_encrypted: encryptSecret('secret-key'),
        url_ttl_seconds: 1800,
      },
    ])

    await expect(getObjectStorageConfig()).resolves.toEqual({
      endpoint: 'https://account.r2.cloudflarestorage.com',
      region: 'auto',
      bucket: 'product-images',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
      urlTtlSeconds: 1800,
      configured: true,
    })
  })

  it('returns an unconfigured result when no database settings exist', async () => {
    query.mockResolvedValue([])

    await expect(getObjectStorageConfig()).resolves.toEqual({
      region: 'auto',
      urlTtlSeconds: 900,
      configured: false,
    })
  })

  it('reports database configuration failures', async () => {
    query.mockRejectedValue(new Error('settings table unavailable'))

    await expect(getObjectStorageConfig()).rejects.toThrow('Unable to load S3 object storage configuration.')
  })
})
