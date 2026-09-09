import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { uploadProductImageObject, getSignedProductImageUrl, deleteProductImageObject } = vi.hoisted(() => ({
  uploadProductImageObject: vi.fn(),
  getSignedProductImageUrl: vi.fn(),
  deleteProductImageObject: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next()
  },
}))

vi.mock('../lib/object-storage.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/object-storage.js')>()),
  uploadProductImageObject,
  getSignedProductImageUrl,
  deleteProductImageObject,
}))

const { productImagesRouter } = await import('./product-images.js')
const { ObjectStorageConfigError } = await import('../lib/object-storage.js')

function createApp() {
  const app = new Hono()
  app.route('/api/product-images', productImagesRouter)
  return app
}

function pngFile(name = 'photo.png', size = 100) {
  return new File([new Uint8Array(size)], name, { type: 'image/png' })
}

describe('productImagesRouter', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    uploadProductImageObject.mockReset()
    getSignedProductImageUrl.mockReset()
    deleteProductImageObject.mockReset()
  })

  it('uploads images and returns a signed URL', async () => {
    uploadProductImageObject.mockResolvedValue({ key: 'products/1.png' })
    getSignedProductImageUrl.mockResolvedValue({ url: 'https://cdn/x', expiresAt: '2026-01-02T00:00:00.000Z' })
    const app = createApp()
    const form = new FormData()
    form.append('file', pngFile())

    const res = await app.request('/api/product-images/upload', { method: 'POST', body: form })
    const body = (await res.json()) as { key: string; url: string; expiresAt: string }

    expect(res.status).toBe(201)
    expect(body).toEqual({ key: 'products/1.png', url: 'https://cdn/x', expiresAt: '2026-01-02T00:00:00.000Z' })
    expect(uploadProductImageObject).toHaveBeenCalledTimes(1)
  })

  it('rejects missing files, bad types, and oversized images', async () => {
    const app = createApp()

    const emptyForm = new FormData()
    const missing = await app.request('/api/product-images/upload', { method: 'POST', body: emptyForm })
    expect(missing.status).toBe(400)

    const textForm = new FormData()
    textForm.append('file', new File(['x'], 'x.txt', { type: 'text/plain' }))
    const badType = await app.request('/api/product-images/upload', { method: 'POST', body: textForm })
    expect(badType.status).toBe(400)

    const bigForm = new FormData()
    bigForm.append('file', pngFile('big.png', 6 * 1024 * 1024))
    const tooBig = await app.request('/api/product-images/upload', { method: 'POST', body: bigForm })
    expect(tooBig.status).toBe(400)

    expect(uploadProductImageObject).not.toHaveBeenCalled()
  })

  it('maps upload failures to 500', async () => {
    const app = createApp()

    uploadProductImageObject.mockRejectedValue(new ObjectStorageConfigError('bucket not configured'))
    const configForm = new FormData()
    configForm.append('file', pngFile())
    const configFailure = await app.request('/api/product-images/upload', { method: 'POST', body: configForm })
    expect(configFailure.status).toBe(500)
    expect(((await configFailure.json()) as { error: string }).error).toBe('bucket not configured')

    uploadProductImageObject.mockRejectedValue(new Error('network down'))
    const genericForm = new FormData()
    genericForm.append('file', pngFile())
    const genericFailure = await app.request('/api/product-images/upload', { method: 'POST', body: genericForm })
    expect(genericFailure.status).toBe(500)
    expect(console.error).toHaveBeenCalled()
  })

  it('resolves keys with dedup and blank filtering', async () => {
    getSignedProductImageUrl.mockImplementation(async (key: string) => ({
      url: `https://cdn/${key}`,
      expiresAt: '2026-01-02T00:00:00.000Z',
    }))
    const app = createApp()

    const res = await app.request('/api/product-images/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: [' a.png ', 'a.png', '', '  ', null, 'b.png'] }),
    })
    const body = (await res.json()) as { urls: Record<string, string>; expiresAt: string | null }

    expect(res.status).toBe(200)
    expect(body.urls).toEqual({ 'a.png': 'https://cdn/a.png', 'b.png': 'https://cdn/b.png' })
    expect(body.expiresAt).toBe('2026-01-02T00:00:00.000Z')
    expect(getSignedProductImageUrl).toHaveBeenCalledTimes(2)
  })

  it('resolves empty key lists to null expiry', async () => {
    const app = createApp()

    const res = await app.request('/api/product-images/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const body = (await res.json()) as { urls: Record<string, string>; expiresAt: string | null }

    expect(res.status).toBe(200)
    expect(body).toEqual({ urls: {}, expiresAt: null })
    expect(getSignedProductImageUrl).not.toHaveBeenCalled()
  })

  it('maps resolve failures to 500', async () => {
    const app = createApp()
    const payload = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: ['a.png'] }) }

    getSignedProductImageUrl.mockRejectedValue(new ObjectStorageConfigError('bucket not configured'))
    const configFailure = await app.request('/api/product-images/resolve', payload)
    expect(configFailure.status).toBe(500)

    getSignedProductImageUrl.mockRejectedValue(new Error('network down'))
    const genericFailure = await app.request('/api/product-images/resolve', payload)
    expect(genericFailure.status).toBe(500)
    expect(console.error).toHaveBeenCalled()
  })

  it('deletes images by key', async () => {
    deleteProductImageObject.mockResolvedValue(undefined)
    const app = createApp()

    const res = await app.request('/api/product-images', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: '  a.png  ' }),
    })

    expect(res.status).toBe(200)
    expect(deleteProductImageObject).toHaveBeenCalledWith('a.png')
  })

  it('rejects deletes without a key', async () => {
    const app = createApp()

    for (const body of [{}, { key: '   ' }]) {
      const res = await app.request('/api/product-images', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      expect(res.status).toBe(400)
    }
    expect(deleteProductImageObject).not.toHaveBeenCalled()
  })

  it('maps delete failures to 500', async () => {
    const app = createApp()
    const payload = { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'a.png' }) }

    deleteProductImageObject.mockRejectedValue(new ObjectStorageConfigError('bucket not configured'))
    const configFailure = await app.request('/api/product-images', payload)
    expect(configFailure.status).toBe(500)
    expect(((await configFailure.json()) as { error: string }).error).toBe('bucket not configured')

    deleteProductImageObject.mockRejectedValue(new Error('network down'))
    const genericFailure = await app.request('/api/product-images', payload)
    expect(genericFailure.status).toBe(500)
    expect(console.error).toHaveBeenCalled()
  })
})
