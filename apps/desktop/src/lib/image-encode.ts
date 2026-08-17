import { validateProductImageFile } from '../services/product-images'

// Base64 image encoding for category images.
// A category image is stored inline as a data URL in the `image` text column,
// so it needs no object storage and syncs with the rest of the row.

const MAX_DIMENSION = 512
const OUTPUT_QUALITY = 0.8

/**
 * Validate, downscale and encode an image File into a compressed data URL.
 * Resizes so the longest edge is at most MAX_DIMENSION and prefers WEBP
 * (falls back to JPEG) to keep the inline payload small.
 */
export async function fileToCompressedDataUrl(file: File): Promise<string> {
  const validationError = validateProductImageFile(file)
  if (validationError) {
    throw new Error(validationError)
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close?.()
    throw new Error('Canvas 2D context is unavailable for image encoding.')
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const webp = canvas.toDataURL('image/webp', OUTPUT_QUALITY)
  if (webp.startsWith('data:image/webp')) {
    return webp
  }
  return canvas.toDataURL('image/jpeg', OUTPUT_QUALITY)
}
