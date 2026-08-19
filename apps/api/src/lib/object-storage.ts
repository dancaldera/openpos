import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { decryptSecret } from './password-reset-email.js'
import { query } from './turso.js'

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 900

let cachedClient: S3Client | null = null
let cachedConfigKey: string | null = null

export interface ObjectStorageConfig {
  endpoint?: string
  region?: string
  bucket?: string
  accessKeyId?: string
  secretAccessKey?: string
  urlTtlSeconds: number
  configured: boolean
}

interface DatabaseObjectStorageSettings {
  endpoint: string | null
  region: string | null
  bucket: string | null
  access_key_id_encrypted: string | null
  secret_access_key_encrypted: string | null
  url_ttl_seconds: number | null
}

export class ObjectStorageConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ObjectStorageConfigError'
  }
}

function normalizePositiveInt(value: number | null | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export async function getObjectStorageConfig(): Promise<ObjectStorageConfig> {
  let stored: DatabaseObjectStorageSettings | undefined

  try {
    stored = (
      await query<DatabaseObjectStorageSettings>(
        `SELECT endpoint, region, bucket, access_key_id_encrypted, secret_access_key_encrypted, url_ttl_seconds
         FROM object_storage_settings WHERE id = 1 LIMIT 1`,
      )
    )[0]
  } catch {
    throw new ObjectStorageConfigError('Unable to load S3 object storage configuration.')
  }

  if (!stored) {
    return {
      region: 'auto',
      urlTtlSeconds: DEFAULT_SIGNED_URL_TTL_SECONDS,
      configured: false,
    }
  }

  try {
    const accessKeyId = stored.access_key_id_encrypted ? decryptSecret(stored.access_key_id_encrypted) : undefined
    const secretAccessKey = stored.secret_access_key_encrypted
      ? decryptSecret(stored.secret_access_key_encrypted)
      : undefined
    const endpoint = stored.endpoint || undefined
    const bucket = stored.bucket || undefined

    return {
      endpoint,
      region: stored.region || 'auto',
      bucket,
      accessKeyId,
      secretAccessKey,
      urlTtlSeconds: normalizePositiveInt(stored.url_ttl_seconds, DEFAULT_SIGNED_URL_TTL_SECONDS),
      configured: Boolean(endpoint && bucket && accessKeyId && secretAccessKey),
    }
  } catch {
    throw new ObjectStorageConfigError('Unable to decrypt S3 object storage configuration.')
  }
}

function assertConfigured(config: ObjectStorageConfig): asserts config is ObjectStorageConfig & {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
} {
  if (!config.configured || !config.endpoint || !config.bucket || !config.accessKeyId || !config.secretAccessKey) {
    throw new ObjectStorageConfigError('Missing S3 object storage configuration. Configure it in Settings.')
  }
}

function getClient(config: ObjectStorageConfig): S3Client {
  assertConfigured(config)

  const configKey = [config.endpoint, config.region, config.bucket, config.accessKeyId, config.secretAccessKey].join(
    '|',
  )
  if (cachedClient && cachedConfigKey === configKey) {
    return cachedClient
  }

  cachedClient = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  })
  cachedConfigKey = configKey
  return cachedClient
}

function getFileExtension(contentType: string, filename: string): string {
  const normalizedName = filename.trim().toLowerCase()
  const nameExtension = normalizedName.includes('.') ? normalizedName.slice(normalizedName.lastIndexOf('.') + 1) : ''

  if (contentType === 'image/jpeg') return nameExtension === 'jpeg' ? 'jpeg' : 'jpg'
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  return nameExtension || 'bin'
}

function buildObjectKey(contentType: string, filename: string): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const extension = getFileExtension(contentType, filename)
  return `products/${year}/${month}/${crypto.randomUUID()}.${extension}`
}

export function isAllowedImageType(contentType: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(contentType)
}

export async function uploadProductImageObject(file: File): Promise<{ key: string }> {
  const config = await getObjectStorageConfig()
  const client = getClient(config)
  const key = buildObjectKey(file.type, file.name)

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: new Uint8Array(await file.arrayBuffer()),
      ContentType: file.type,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return { key }
}

export async function deleteProductImageObject(key: string): Promise<void> {
  const config = await getObjectStorageConfig()
  const client = getClient(config)

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  )
}

export async function getSignedProductImageUrl(key: string): Promise<{ url: string; expiresAt: string }> {
  const config = await getObjectStorageConfig()
  const client = getClient(config)
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
    { expiresIn: config.urlTtlSeconds },
  )

  return {
    url,
    expiresAt: new Date(Date.now() + config.urlTtlSeconds * 1000).toISOString(),
  }
}
