import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import {
  deleteProductImageObject,
  getObjectStorageConfig,
  getSignedProductImageUrl,
  isAllowedImageType,
  ObjectStorageConfigError,
  uploadProductImageObject,
} from '../lib/object-storage.js'

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

export const productImagesRouter = new Hono()

productImagesRouter.use('/*', authMiddleware)

productImagesRouter.post('/upload', async (c) => {
  try {
    const body = await c.req.parseBody()
    const file = body.file

    if (!(file instanceof File)) {
      return c.json({ error: 'file field is required' }, 400)
    }

    if (!isAllowedImageType(file.type)) {
      return c.json({ error: 'Unsupported image type. Allowed types: JPEG, PNG, WEBP.' }, 400)
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return c.json({ error: 'Image exceeds maximum size of 5 MB.' }, 400)
    }

    const { key } = await uploadProductImageObject(file)
    const signed = await getSignedProductImageUrl(key)

    return c.json({ key, url: signed.url, expiresAt: signed.expiresAt }, 201)
  } catch (error) {
    if (error instanceof ObjectStorageConfigError) {
      return c.json({ error: error.message }, 500)
    }

    console.error('[API] Product image upload failed:', error)
    return c.json({ error: 'Failed to upload product image' }, 500)
  }
})

productImagesRouter.post('/resolve', async (c) => {
  try {
    const body = await c.req.json<{ keys?: string[] }>()
    const keys = Array.from(new Set((body.keys || []).map((key) => key?.trim()).filter(Boolean))) as string[]
    const urls: Record<string, string> = {}
    let expiresAt: string | undefined

    for (const key of keys) {
      const signed = await getSignedProductImageUrl(key)
      urls[key] = signed.url
      expiresAt = signed.expiresAt
    }

    return c.json({ urls, expiresAt: expiresAt || null })
  } catch (error) {
    if (error instanceof ObjectStorageConfigError) {
      return c.json({ error: error.message }, 500)
    }

    console.error('[API] Product image resolve failed:', error)
    return c.json({ error: 'Failed to resolve product image URLs' }, 500)
  }
})

productImagesRouter.delete('/', async (c) => {
  try {
    const body = await c.req.json<{ key?: string }>()
    const key = body.key?.trim()

    if (!key) {
      return c.json({ error: 'key is required' }, 400)
    }

    await deleteProductImageObject(key)
    return c.json({ success: true })
  } catch (error) {
    if (error instanceof ObjectStorageConfigError) {
      return c.json({ error: error.message }, 500)
    }

    console.error('[API] Product image delete failed:', error)
    return c.json({ error: 'Failed to delete product image' }, 500)
  }
})
