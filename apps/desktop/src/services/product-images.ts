import { requestApiJson } from '../lib/api-client'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const PRODUCT_IMAGE_UPLOAD_FAILED_MESSAGE = 'Failed to upload product image.'

export interface UploadedProductImage {
  key: string
  url: string
  expiresAt?: string | null
}

export function validateProductImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return 'Unsupported image type. Allowed types: JPEG, PNG, WEBP.'
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return 'Image exceeds maximum size of 5 MB.'
  }

  return null
}

function normalizeImageKey(key: string): string {
  return key.trim()
}

function getImageExtension(key: string): string {
  const normalizedKey = normalizeImageKey(key).toLowerCase()
  const lastDotIndex = normalizedKey.lastIndexOf('.')
  return lastDotIndex >= 0 ? normalizedKey.slice(lastDotIndex) : ''
}

function hasDesktopApiAuthToken(): boolean {
  if (typeof localStorage === 'undefined') {
    return false
  }

  return Boolean(localStorage.getItem('auth_token'))
}

export function isLegacyLocalImageKey(key: string): boolean {
  const normalizedKey = normalizeImageKey(key)

  if (!normalizedKey || normalizedKey.includes('/') || normalizedKey.includes('\\')) {
    return false
  }

  return ALLOWED_IMAGE_EXTENSIONS.has(getImageExtension(normalizedKey))
}

export function isRemoteImageKey(key: string): boolean {
  const normalizedKey = normalizeImageKey(key)

  if (!normalizedKey) {
    return false
  }

  return !isLegacyLocalImageKey(normalizedKey)
}

async function uploadProductImageToApi(file: File): Promise<UploadedProductImage> {
  const formData = new FormData()
  formData.append('file', file)

  return requestApiJson<UploadedProductImage>('/api/products/images/upload', {
    method: 'POST',
    body: formData,
    requireAuth: true,
  })
}

async function resolveRemoteProductImageUrls(keys: string[]): Promise<Record<string, string>> {
  const data = await requestApiJson<{ urls?: Record<string, string> }>('/api/products/images/resolve', {
    method: 'POST',
    body: { keys },
    requireAuth: true,
  })

  return data.urls || {}
}

async function deleteRemoteProductImage(key: string): Promise<void> {
  await requestApiJson('/api/products/images', {
    method: 'DELETE',
    body: { key },
    requireAuth: true,
  })
}

export async function uploadProductImage(file: File): Promise<UploadedProductImage> {
  const validationError = validateProductImageFile(file)
  if (validationError) {
    throw new Error(validationError)
  }

  if (isDesktop) {
    if (!hasDesktopApiAuthToken()) {
      throw new Error('No auth token available for API call')
    }

    try {
      return await uploadProductImageToApi(file)
    } catch (error) {
      console.error('Failed to upload product image through remote API in desktop mode:', error)
      throw new Error(PRODUCT_IMAGE_UPLOAD_FAILED_MESSAGE)
    }
  }

  return uploadProductImageToApi(file)
}

export async function resolveProductImageUrls(keys: string[]): Promise<Record<string, string>> {
  const normalizedKeys = Array.from(new Set(keys.map((key) => normalizeImageKey(key)).filter(Boolean)))

  if (normalizedKeys.length === 0) {
    return {}
  }

  if (isDesktop) {
    const api = requireDesktopApi()
    const localKeys = normalizedKeys.filter((key) => isLegacyLocalImageKey(key))
    const remoteKeys = normalizedKeys.filter((key) => isRemoteImageKey(key))
    const results: Record<string, string> = {}

    if (remoteKeys.length > 0 && hasDesktopApiAuthToken()) {
      try {
        Object.assign(results, await resolveRemoteProductImageUrls(remoteKeys))
      } catch (error) {
        console.error('Failed to resolve remote product image URLs in desktop mode:', error)
      }
    }

    if (localKeys.length > 0) {
      try {
        Object.assign(results, await api.images.resolve(localKeys))
      } catch (error) {
        console.error('Failed to resolve local product image URLs in desktop mode:', error)
      }
    }

    return results
  }

  return resolveRemoteProductImageUrls(normalizedKeys)
}

export async function deleteProductImage(key: string): Promise<void> {
  const trimmedKey = normalizeImageKey(key)
  if (!trimmedKey) {
    return
  }

  if (isDesktop) {
    if (isLegacyLocalImageKey(trimmedKey)) {
      const api = requireDesktopApi()
      await api.images.delete(trimmedKey)
      return
    }

    if (!hasDesktopApiAuthToken()) {
      return
    }

    try {
      await deleteRemoteProductImage(trimmedKey)
    } catch (error) {
      console.error('Failed to delete remote product image in desktop mode:', error)
    }
    return
  }

  await deleteRemoteProductImage(trimmedKey)
}
