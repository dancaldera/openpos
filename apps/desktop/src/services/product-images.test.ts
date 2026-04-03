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
const resolveImages = mock(async () => ({}))
const deleteImage = mock(async () => {})
const getApiBaseUrl = mock(async () => 'https://api.example.com')
const getDesktopApiConfig = mock(async () => ({
  apiUrl: 'https://api.example.com',
  configPath: '/home/ana/.config/openpos-desktop/config.json',
  configSource: 'legacy' as const,
  legacyConfigPath: '/home/ana/.config/openpos-desktop/config.json',
  userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
}))
const logError = mock(() => {})
const requireDesktopApi = mock(() => ({
  images: {
    resolve: resolveImages,
    delete: deleteImage,
  },
}))

mock.module('../lib/api-client', () => ({
  requestApiJson,
}))

mock.module('../lib/api-config', () => ({
  getApiBaseUrl,
  getDesktopApiConfig,
}))

mock.module('../lib/desktop', () => ({
  requireDesktopApi,
}))

mock.module('../lib/platform', () => ({
  isDesktop: true,
}))

console.error = logError as typeof console.error

const { AuthExpiredError } = await import('../lib/auth-session')
const {
  deleteProductImage,
  DESKTOP_API_NOT_CONFIGURED_MESSAGE,
  DESKTOP_REMOTE_SESSION_UNAVAILABLE_MESSAGE,
  isLegacyLocalImageKey,
  isRemoteImageKey,
  resolveProductImageUrls,
  uploadProductImage,
} = await import('./product-images')

describe('product image service desktop routing', () => {
  const imageFile = new File(['lean'], 'product.jpg', { type: 'image/jpeg' })
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    requestApiJson.mockReset()
    getApiBaseUrl.mockReset()
    getDesktopApiConfig.mockReset()
    resolveImages.mockReset()
    deleteImage.mockReset()
    logError.mockReset()
    requireDesktopApi.mockClear()
    getApiBaseUrl.mockResolvedValue('https://api.example.com')
    getDesktopApiConfig.mockResolvedValue({
      apiUrl: 'https://api.example.com',
      configPath: '/home/ana/.config/openpos-desktop/config.json',
      configSource: 'legacy',
      legacyConfigPath: '/home/ana/.config/openpos-desktop/config.json',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })
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
    expect(requestApiJson).toHaveBeenCalledTimes(1)
  })

  it('throws when API upload fails in desktop mode', async () => {
    storage.setItem('auth_token', 'desktop-token')
    requestApiJson.mockRejectedValueOnce(new Error('offline'))

    await expect(uploadProductImage(imageFile)).rejects.toThrow('Failed to upload product image.')
  })

  it('throws a desktop config error when no API URL is configured for remote upload', async () => {
    getApiBaseUrl.mockResolvedValueOnce('')
    getDesktopApiConfig.mockResolvedValueOnce({
      apiUrl: '',
      configPath: '/home/ana/.config/openpos-desktop/config.json',
      configSource: 'legacy',
      legacyConfigPath: '/home/ana/.config/openpos-desktop/config.json',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })

    await expect(uploadProductImage(imageFile)).rejects.toThrow(
      `${DESKTOP_API_NOT_CONFIGURED_MESSAGE}::/home/ana/.config/openpos-desktop/config.json`,
    )
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('throws a remote-session error when desktop has API config but no auth token', async () => {
    await expect(uploadProductImage(imageFile)).rejects.toThrow(DESKTOP_REMOTE_SESSION_UNAVAILABLE_MESSAGE)
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('includes the persisted remote auth failure details when desktop sign-in could not get a token', async () => {
    storage.setItem(
      'desktop_remote_auth_status',
      JSON.stringify({
        apiConfigured: true,
        lastError: 'JWT_SECRET environment variable is not set',
        configPath: '/home/ana/.config/openpos-desktop/config.json',
      }),
    )

    await expect(uploadProductImage(imageFile)).rejects.toThrow(
      `${DESKTOP_REMOTE_SESSION_UNAVAILABLE_MESSAGE}::JWT_SECRET environment variable is not set`,
    )
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('preserves auth-expired errors from the API upload path', async () => {
    storage.setItem('auth_token', 'desktop-token')
    requestApiJson.mockRejectedValueOnce(new AuthExpiredError())

    await expect(uploadProductImage(imageFile)).rejects.toBeInstanceOf(AuthExpiredError)
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
    await expect(deleteProductImage('products/2026/03/object.jpg')).rejects.toThrow(
      DESKTOP_REMOTE_SESSION_UNAVAILABLE_MESSAGE,
    )
    expect(deleteImage).not.toHaveBeenCalled()
  })

  it('deletes legacy local filenames through desktop IPC', async () => {
    await deleteProductImage('legacy-local.jpg')

    expect(deleteImage).toHaveBeenCalledWith('legacy-local.jpg')
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('throws a desktop config error on remote delete when API is not configured', async () => {
    getApiBaseUrl.mockResolvedValueOnce('')
    getDesktopApiConfig.mockResolvedValueOnce({
      apiUrl: '',
      configPath: '/home/ana/.config/openpos-desktop/config.json',
      configSource: 'legacy',
      legacyConfigPath: '/home/ana/.config/openpos-desktop/config.json',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })

    await expect(deleteProductImage('products/2026/03/object.jpg')).rejects.toThrow(
      `${DESKTOP_API_NOT_CONFIGURED_MESSAGE}::/home/ana/.config/openpos-desktop/config.json`,
    )
    expect(requestApiJson).not.toHaveBeenCalled()
  })
})
