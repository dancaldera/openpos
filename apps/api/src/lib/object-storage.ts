import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DEFAULT_SIGNED_URL_TTL_SECONDS = 900

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

export class ObjectStorageConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ObjectStorageConfigError'
  }
}

function normalizePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function getObjectStorageConfig(): ObjectStorageConfig {
  const endpoint = process.env.S3_ENDPOINT
  const region = process.env.S3_REGION || 'auto'
  const bucket = process.env.S3_BUCKET
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  const urlTtlSeconds = normalizePositiveInt(process.env.PRODUCT_IMAGE_URL_TTL_SECONDS, DEFAULT_SIGNED_URL_TTL_SECONDS)

  return {
    endpoint: endpoint || undefined,
    region,
    bucket: bucket || undefined,
    accessKeyId: accessKeyId || undefined,
    secretAccessKey: secretAccessKey || undefined,
    urlTtlSeconds,
    configured: Boolean(endpoint && bucket && accessKeyId && secretAccessKey),
  }
}

function assertConfigured(config: ObjectStorageConfig): asserts config is ObjectStorageConfig & {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
} {
  if (!config.configured || !config.endpoint || !config.bucket || !config.accessKeyId || !config.secretAccessKey) {
    throw new ObjectStorageConfigError(
      'Missing S3 object storage configuration. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.',
    )
  }
}

function getClient(config: ObjectStorageConfig): S3Client {
  assertConfigured(config)

  const configKey = [config.endpoint, config.region, config.bucket, config.accessKeyId].join('|')
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
  const config = getObjectStorageConfig()
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
  const config = getObjectStorageConfig()
  const client = getClient(config)

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  )
}

export async function getSignedProductImageUrl(key: string): Promise<{ url: string; expiresAt: string }> {
  const config = getObjectStorageConfig()
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
