import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestApiJson, execute, query, getDesktopApiConfig } = vi.hoisted(() => ({
  requestApiJson: vi.fn(async () => ({})),
  execute: vi.fn(async (_sql: string, _params: unknown[] = []) => ({ lastInsertId: 0, rowsAffected: 1 })),
  query: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<Array<Record<string, unknown>>> => []),
  getDesktopApiConfig: vi.fn(async () => ({
    apiUrl: '',
    configPath: '',
    configSource: 'userData' as const,
    userDataConfigPath: '',
  })),
}))

vi.mock('../lib/api-client', () => ({
  requestApiJson,
}))

vi.mock('../lib/api-config', () => ({
  getDesktopApiConfig,
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

const { deleteProductImage, resolveProductImageUrls, uploadProductImage, validateProductImageFile } = await import(
  './product-images'
)

describe('product image service web', () => {
  const imageFile = new File(['lean'], 'product.jpg', { type: 'image/jpeg' })

  beforeEach(() => {
    requestApiJson.mockReset()
    requestApiJson.mockResolvedValue({})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('validates files before uploading', () => {
    expect(validateProductImageFile(imageFile)).toBeNull()
  })

  it('uploads through the API in web mode', async () => {
    requestApiJson.mockResolvedValueOnce({
      key: 'products/2026/03/object.jpg',
      url: 'https://cdn.example.com/object.jpg',
    })

    const uploaded = await uploadProductImage(imageFile)

    expect(uploaded).toEqual({ key: 'products/2026/03/object.jpg', url: 'https://cdn.example.com/object.jpg' })
    expect(requestApiJson).toHaveBeenCalledWith('/api/products/images/upload', {
      method: 'POST',
      body: expect.any(FormData),
      requireAuth: true,
      timeoutMs: 120_000,
    })
  })

  it('surfaces API upload failures unwrapped in web mode', async () => {
    requestApiJson.mockRejectedValueOnce(new Error('offline'))

    await expect(uploadProductImage(imageFile)).rejects.toThrow('offline')
  })

  it('resolves keys through the API in web mode', async () => {
    requestApiJson.mockResolvedValueOnce({ urls: { a: 'https://cdn.example.com/a' } })

    await expect(resolveProductImageUrls(['a'])).resolves.toEqual({ a: 'https://cdn.example.com/a' })
    expect(requestApiJson).toHaveBeenCalledWith('/api/products/images/resolve', {
      method: 'POST',
      body: { keys: ['a'] },
      requireAuth: true,
    })
  })

  it('returns an empty map for blank keys in web mode', async () => {
    await expect(resolveProductImageUrls([])).resolves.toEqual({})

    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('deletes through the API in web mode', async () => {
    requestApiJson.mockResolvedValueOnce({ success: true })

    await deleteProductImage('products/2026/03/object.jpg')

    expect(requestApiJson).toHaveBeenCalledWith('/api/products/images', {
      method: 'DELETE',
      body: { key: 'products/2026/03/object.jpg' },
      requireAuth: true,
    })
  })

  it('ignores blank keys on delete in web mode', async () => {
    await deleteProductImage('')

    expect(requestApiJson).not.toHaveBeenCalled()
  })
})
