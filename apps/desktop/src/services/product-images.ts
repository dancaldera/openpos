import { requestApiJson } from '../lib/api-client'

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

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

export async function uploadProductImage(file: File): Promise<UploadedProductImage> {
  const validationError = validateProductImageFile(file)
  if (validationError) {
    throw new Error(validationError)
  }

  const formData = new FormData()
  formData.append('file', file)

  return requestApiJson<UploadedProductImage>('/api/products/images/upload', {
    method: 'POST',
    body: formData,
    requireAuth: true,
  })
}

export async function resolveProductImageUrls(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) {
    return {}
  }

  const data = await requestApiJson<{ urls?: Record<string, string> }>('/api/products/images/resolve', {
    method: 'POST',
    body: { keys },
    requireAuth: true,
  })

  return data.urls || {}
}

export async function deleteProductImage(key: string): Promise<void> {
  const trimmedKey = key.trim()
  if (!trimmedKey) {
    return
  }

  await requestApiJson('/api/products/images', {
    method: 'DELETE',
    body: { key: trimmedKey },
    requireAuth: true,
  })
}
