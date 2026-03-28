import { beforeEach, describe, expect, it, mock } from 'bun:test'

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

const requestApiJson = mock(async () => ({}))
const saveImage = mock(async () => ({ key: 'local-image.jpg' }))
const resolveImages = mock(async () => ({}))
const deleteImage = mock(async () => {})
const logError = mock(() => {})
const requireDesktopApi = mock(() => ({
  images: {
    save: saveImage,
    resolve: resolveImages,
    delete: deleteImage,
  },
}))

mock.module('../lib/api-client', () => ({
  requestApiJson,
}))

mock.module('../lib/desktop', () => ({
  requireDesktopApi,
}))

mock.module('../lib/platform', () => ({
  isDesktop: true,
}))

class MockFileReader {
  result: string | ArrayBuffer | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  readAsDataURL(file: Blob): void {
    this.result = `data:${file.type};base64,bGVhbg==`
    queueMicrotask(() => {
      this.onload?.()
    })
  }
}

globalThis.FileReader = MockFileReader as unknown as typeof FileReader
console.error = logError as typeof console.error

const { deleteProductImage, isLegacyLocalImageKey, isRemoteImageKey, resolveProductImageUrls, uploadProductImage } =
  await import('./product-images')

describe('product image service desktop routing', () => {
  const imageFile = new File(['lean'], 'product.jpg', { type: 'image/jpeg' })
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    requestApiJson.mockReset()
    saveImage.mockReset()
    resolveImages.mockReset()
    deleteImage.mockReset()
    logError.mockReset()
    requireDesktopApi.mockClear()
  })

  it('classifies local filenames and remote keys correctly', () => {
    expect(isLegacyLocalImageKey('local-image.jpg')).toBe(true)
    expect(isLegacyLocalImageKey('products/2026/03/object.jpg')).toBe(false)
    expect(isRemoteImageKey('products/2026/03/object.jpg')).toBe(true)
    expect(isRemoteImageKey('local-image.jpg')).toBe(false)
  })

  it('uploads through the API first in desktop mode', async () => {
    storage.setItem('auth_token', 'desktop-token')
    requestApiJson.mockResolvedValueOnce({
      key: 'products/2026/03/object.jpg',
      url: 'https://cdn.example.com/object.jpg',
      expiresAt: '2026-03-27T00:15:00.000Z',
    })

    const uploaded = await uploadProductImage(imageFile)

    expect(uploaded).toEqual({
      key: 'products/2026/03/object.jpg',
      url: 'https://cdn.example.com/object.jpg',
      expiresAt: '2026-03-27T00:15:00.000Z',
    })
    expect(requestApiJson).toHaveBeenCalledWith('/api/products/images/upload', {
      method: 'POST',
      body: expect.any(FormData),
      requireAuth: true,
    })
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('throws when API upload fails in desktop mode', async () => {
    storage.setItem('auth_token', 'desktop-token')
    requestApiJson.mockRejectedValueOnce(new Error('offline'))

    await expect(uploadProductImage(imageFile)).rejects.toThrow('Failed to upload product image.')
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('resolves remote keys through the API and local keys through desktop IPC', async () => {
    storage.setItem('auth_token', 'desktop-token')
    requestApiJson.mockResolvedValueOnce({
      urls: {
        'products/2026/03/object.jpg': 'https://cdn.example.com/object.jpg',
      },
    })
    resolveImages.mockResolvedValueOnce({
      'local-image.jpg': 'data:image/jpeg;base64,local',
    })

    const resolved = await resolveProductImageUrls([
      'products/2026/03/object.jpg',
      'local-image.jpg',
      'local-image.jpg',
    ])

    expect(resolved).toEqual({
      'products/2026/03/object.jpg': 'https://cdn.example.com/object.jpg',
      'local-image.jpg': 'data:image/jpeg;base64,local',
    })
    expect(requestApiJson).toHaveBeenCalledWith('/api/products/images/resolve', {
      method: 'POST',
      body: { keys: ['products/2026/03/object.jpg'] },
      requireAuth: true,
    })
    expect(resolveImages).toHaveBeenCalledWith(['local-image.jpg'])
  })

  it('keeps local image results when remote resolution fails', async () => {
    storage.setItem('auth_token', 'desktop-token')
    requestApiJson.mockRejectedValueOnce(new Error('missing auth'))
    resolveImages.mockResolvedValueOnce({
      'local-image.jpg': 'data:image/jpeg;base64,local',
    })

    const resolved = await resolveProductImageUrls(['products/2026/03/object.jpg', 'local-image.jpg'])

    expect(resolved).toEqual({
      'local-image.jpg': 'data:image/jpeg;base64,local',
    })
  })

  it('skips remote resolution entirely when desktop has no auth token', async () => {
    resolveImages.mockResolvedValueOnce({
      'local-image.jpg': 'data:image/jpeg;base64,local',
    })

    const resolved = await resolveProductImageUrls(['products/2026/03/object.jpg', 'local-image.jpg'])

    expect(resolved).toEqual({
      'local-image.jpg': 'data:image/jpeg;base64,local',
    })
    expect(requestApiJson).not.toHaveBeenCalled()
    expect(resolveImages).toHaveBeenCalledWith(['local-image.jpg'])
  })

  it('deletes remote keys through the API', async () => {
    storage.setItem('auth_token', 'desktop-token')
    requestApiJson.mockResolvedValueOnce({ success: true })

    await deleteProductImage('products/2026/03/object.jpg')

    expect(requestApiJson).toHaveBeenCalledWith('/api/products/images', {
      method: 'DELETE',
      body: { key: 'products/2026/03/object.jpg' },
      requireAuth: true,
    })
    expect(deleteImage).not.toHaveBeenCalled()
  })

  it('does not call the remote delete API when desktop has no auth token', async () => {
    await deleteProductImage('products/2026/03/object.jpg')

    expect(requestApiJson).not.toHaveBeenCalled()
    expect(deleteImage).not.toHaveBeenCalled()
  })

  it('deletes legacy local filenames through desktop IPC', async () => {
    await deleteProductImage('legacy-local.jpg')

    expect(deleteImage).toHaveBeenCalledWith('legacy-local.jpg')
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('throws when desktop has no auth token for remote upload', async () => {
    await expect(uploadProductImage(imageFile)).rejects.toThrow('No auth token available for API call')
    expect(requestApiJson).not.toHaveBeenCalled()
    expect(saveImage).not.toHaveBeenCalled()
  })
})
