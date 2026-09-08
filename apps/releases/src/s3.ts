/**
 * S3-compatible client bound to the OpenPOS releases bucket.
 *
 * Credentials come from the Railway bucket's provided variables
 * (BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY, REGION, ENDPOINT).
 */

import { GetObjectCommand, type GetObjectCommandOutput, S3Client } from '@aws-sdk/client-s3'

export interface ReleaseObject {
  key: string
  body: unknown
  contentLength: number | null
}

let cachedClient: { client: S3Client; bucket: string } | null = null

export function resolveBucketConfig(env: NodeJS.ProcessEnv = process.env): {
  client: S3Client
  bucket: string
} {
  const bucket = env.BUCKET || env.AWS_S3_BUCKET || ''
  const accessKeyId = env.ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID || ''
  const secretAccessKey = env.SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY || ''
  const region = env.REGION || env.AWS_REGION || 'auto'
  const endpoint = env.ENDPOINT || env.AWS_S3_ENDPOINT

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing bucket configuration. Set BUCKET, ACCESS_KEY_ID, and SECRET_ACCESS_KEY (Railway variable references).',
    )
  }

  if (cachedClient && cachedClient.bucket === bucket) {
    return cachedClient
  }

  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    ...(endpoint ? { endpoint } : {}),
  })

  cachedClient = { client, bucket }
  return cachedClient
}

/** Fetches an object from the releases bucket, or null when it does not exist. */
export async function getObject(key: string): Promise<ReleaseObject | null> {
  const { client, bucket } = resolveBucketConfig()

  let output: GetObjectCommandOutput
  try {
    output = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    const code =
      typeof error === 'object' && error !== null && '$metadata' in error
        ? ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? 0)
        : 0
    if (name === 'NoSuchKey' || code === 404) {
      return null
    }
    throw error
  }

  return {
    key,
    body: output.Body,
    contentLength: output.ContentLength ?? null,
  }
}
