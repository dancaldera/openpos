import { requestApiJson } from '../lib/api-client'
import { getDesktopApiConfig } from '../lib/api-config'
import { isAuthExpiredError } from '../lib/auth-session'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'
import { getDesktopRemoteSessionState } from './auth-turso'

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const PRODUCT_IMAGE_UPLOAD_FAILED_MESSAGE = 'Failed to upload product image.'
export const DESKTOP_API_NOT_CONFIGURED_MESSAGE = 'Desktop API is not configured.'
export const DESKTOP_REMOTE_SESSION_UNAVAILABLE_MESSAGE = 'Remote session is unavailable. Sign out and sign in again.'
const DESKTOP_REMOTE_SESSION_UNAVAILABLE_PREFIX = `${DESKTOP_REMOTE_SESSION_UNAVAILABLE_MESSAGE}::`

export function createDesktopApiNotConfiguredMessage(configPath: string): string {
  return `${DESKTOP_API_NOT_CONFIGURED_MESSAGE}::${configPath}`
}

export function extractDesktopApiConfigPath(message: string): string | null {
  const prefix = `${DESKTOP_API_NOT_CONFIGURED_MESSAGE}::`
  return message.startsWith(prefix) ? message.slice(prefix.length) : null
}

export function createDesktopRemoteSessionUnavailableMessage(details?: string | null): string {
  const normalizedDetails = typeof details === 'string' ? details.trim() : ''
  return normalizedDetails
    ? `${DESKTOP_REMOTE_SESSION_UNAVAILABLE_PREFIX}${normalizedDetails}`
    : DESKTOP_REMOTE_SESSION_UNAVAILABLE_MESSAGE
}

export function extractDesktopRemoteSessionDetails(message: string): string | null {
  return message.startsWith(DESKTOP_REMOTE_SESSION_UNAVAILABLE_PREFIX)
    ? message.slice(DESKTOP_REMOTE_SESSION_UNAVAILABLE_PREFIX.length)
    : null
}

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

async function assertDesktopRemoteSessionReady(): Promise<void> {
  const session = await getDesktopRemoteSessionState()

  if (!session.apiConfigured) {
    const config = await getDesktopApiConfig()
    throw new Error(createDesktopApiNotConfiguredMessage(config.configPath || config.legacyConfigPath || 'config.json'))
  }

  if (!session.hasAuthToken) {
    throw new Error(createDesktopRemoteSessionUnavailableMessage(session.lastError))
  }
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
    await assertDesktopRemoteSessionReady()

    try {
      return await uploadProductImageToApi(file)
    } catch (error) {
      if (isAuthExpiredError(error)) {
        throw error
      }
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
    const session = await getDesktopRemoteSessionState()

    if (remoteKeys.length > 0 && session.isReady) {
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

    await assertDesktopRemoteSessionReady()

    try {
      await deleteRemoteProductImage(trimmedKey)
    } catch (error) {
      if (isAuthExpiredError(error)) {
        throw error
      }
      console.error('Failed to delete remote product image in desktop mode:', error)
      throw error
    }
    return
  }

  await deleteRemoteProductImage(trimmedKey)
}
