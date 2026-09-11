import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { query, mockSend, mockGetSignedUrl, MockS3Client } = vi.hoisted(() => {
  const mockSend = vi.fn(async (_command: { input: Record<string, unknown> }): Promise<unknown> => ({}))
  const mockGetSignedUrl = vi.fn(
    async (_client: unknown, _command: { input: unknown }, _options: { expiresIn: number }): Promise<string> =>
      'https://signed.example.com/object',
  )
  const MockS3Client = vi.fn(function (this: { send: unknown }, _config: unknown) {
    this.send = mockSend
  })
  return { query: vi.fn(), mockSend, mockGetSignedUrl, MockS3Client }
})

vi.mock('./turso.js', () => ({ query }))

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: MockS3Client,
  PutObjectCommand: class PutObjectCommand {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  },
  GetObjectCommand: class GetObjectCommand {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  },
  DeleteObjectCommand: class DeleteObjectCommand {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  },
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}))

const originalJwtSecret = process.env.JWT_SECRET

process.env.JWT_SECRET = 'object-storage-test-secret'

afterEach(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
})

const { encryptSecret } = await import('./secrets')
const {
  deleteProductImageObject,
  getObjectStorageConfig,
  getSignedProductImageUrl,
  isAllowedImageType,
  uploadProductImageObject,
} = await import('./object-storage')

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

  it('falls back to default TTLs and regions', async () => {
    for (const url_ttl_seconds of [null, -5, 3.5, Number.NaN]) {
      query.mockReset()
      query.mockResolvedValue([
        {
          endpoint: 'https://example.com',
          region: null,
          bucket: '',
          access_key_id_encrypted: null,
          secret_access_key_encrypted: null,
          url_ttl_seconds,
        },
      ])

      const config = await getObjectStorageConfig()
      expect(config.urlTtlSeconds).toBe(900)
      expect(config.region).toBe('auto')
      expect(config.configured).toBe(false)
    }
  })

  it('reports undecryptable settings', async () => {
    query.mockResolvedValue([
      {
        endpoint: 'https://example.com',
        region: 'auto',
        bucket: 'b',
        access_key_id_encrypted: 'v1.bogus',
        secret_access_key_encrypted: null,
        url_ttl_seconds: 900,
      },
    ])

    await expect(getObjectStorageConfig()).rejects.toThrow('Unable to decrypt S3 object storage configuration.')
  })
})

describe('object storage clients', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'object-storage-test-secret'
    query.mockReset()
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
    mockSend.mockClear()
    MockS3Client.mockClear()
  })

  it('validates image content types', () => {
    expect(isAllowedImageType('image/jpeg')).toBe(true)
    expect(isAllowedImageType('image/png')).toBe(true)
    expect(isAllowedImageType('image/webp')).toBe(true)
    expect(isAllowedImageType('image/gif')).toBe(false)
  })

  it('uploads images with dated keys and caches the client', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.JPG', { type: 'image/jpeg' })

    const first = await uploadProductImageObject(file)
    const second = await uploadProductImageObject(file)

    expect(first.key).toMatch(/^products\/\d{4}\/\d{2}\/[0-9a-f-]+\.jpg$/)
    expect(second.key).not.toBe(first.key)
    expect(MockS3Client).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledTimes(2)
    const input = (mockSend.mock.calls[0][0] as { input: Record<string, unknown> }).input
    expect(input.Bucket).toBe('product-images')
    expect(input.ContentType).toBe('image/jpeg')
    expect(input.CacheControl).toBe('public, max-age=31536000, immutable')
    expect((input.Body as Uint8Array).length).toBe(3)
  })

  it('derives extensions from content type and filename', async () => {
    const cases: Array<[type: string, name: string, ext: string]> = [
      ['image/jpeg', 'a.jpeg', 'jpeg'],
      ['image/jpeg', 'a', 'jpg'],
      ['image/png', 'a.png', 'png'],
      ['image/webp', 'a.webp', 'webp'],
      ['image/gif', 'a.gif', 'gif'],
      ['image/gif', 'a', 'bin'],
    ]

    for (const [type, name, ext] of cases) {
      const { key } = await uploadProductImageObject(new File(['x'], name, { type }))
      expect(key.endsWith(`.${ext}`)).toBe(true)
    }
  })

  it('rebuilds the client when settings change', async () => {
    const settingsFor = (endpoint: string) => [
      {
        endpoint,
        region: 'auto',
        bucket: 'product-images',
        access_key_id_encrypted: encryptSecret('access-key'),
        secret_access_key_encrypted: encryptSecret('secret-key'),
        url_ttl_seconds: 1800,
      },
    ]

    query.mockResolvedValue(settingsFor('https://first.example.com'))
    await uploadProductImageObject(new File(['x'], 'a.png', { type: 'image/png' }))
    expect(MockS3Client).toHaveBeenCalledTimes(1)

    query.mockResolvedValue(settingsFor('https://other.example.com'))
    await uploadProductImageObject(new File(['x'], 'a.png', { type: 'image/png' }))
    expect(MockS3Client).toHaveBeenCalledTimes(2)
  })

  it('requires every setting before operating', async () => {
    const variants: Array<Record<string, unknown>> = [
      { endpoint: null },
      { bucket: '' },
      { access_key_id_encrypted: null },
      { secret_access_key_encrypted: null },
    ]

    for (const overrides of variants) {
      query.mockReset()
      query.mockResolvedValue([
        {
          endpoint: 'https://example.com',
          region: 'auto',
          bucket: 'b',
          access_key_id_encrypted: encryptSecret('a'),
          secret_access_key_encrypted: encryptSecret('s'),
          url_ttl_seconds: 900,
          ...overrides,
        },
      ])
      await expect(uploadProductImageObject(new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow(
        'Missing S3 object storage configuration',
      )
    }

    query.mockReset()
    query.mockResolvedValue([])
    await expect(uploadProductImageObject(new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow(
      'Missing S3 object storage configuration',
    )
  })

  it('deletes objects by key', async () => {
    await deleteProductImageObject('products/2026/01/x.png')

    expect(mockSend).toHaveBeenCalledTimes(1)
    const input = (mockSend.mock.calls[0][0] as { input: Record<string, unknown> }).input
    expect(input).toMatchObject({ Bucket: 'product-images', Key: 'products/2026/01/x.png' })
  })

  it('signs URLs with the configured TTL', async () => {
    const before = Date.now()

    const signed = await getSignedProductImageUrl('products/2026/01/x.png')

    expect(signed.url).toBe('https://signed.example.com/object')
    expect(Date.parse(signed.expiresAt) - before).toBeGreaterThanOrEqual(1800 * 1000)
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1)
    const [, command, options] = mockGetSignedUrl.mock.calls[0] as [unknown, { input: unknown }, { expiresIn: number }]
    expect(command.input).toMatchObject({ Bucket: 'product-images', Key: 'products/2026/01/x.png' })
    expect(options).toEqual({ expiresIn: 1800 })
  })
})
