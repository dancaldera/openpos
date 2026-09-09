import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }))

vi.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: class GetObjectCommand {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  },
  S3Client: class S3Client {
    config: unknown
    send = mockSend
    constructor(config: unknown) {
      this.config = config
    }
  },
}))

const { getObject, resolveBucketConfig } = await import('./s3.js')

const savedEnv = { ...process.env }

beforeEach(() => {
  mockSend.mockClear()
})

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, savedEnv)
})

const fullEnv = {
  BUCKET: 'bucket-a',
  ACCESS_KEY_ID: 'key-id',
  SECRET_ACCESS_KEY: 'secret',
  REGION: 'auto',
  ENDPOINT: 'https://t3.storageapi.dev',
}

describe('resolveBucketConfig', () => {
  it('throws when credentials are missing', () => {
    expect(() => resolveBucketConfig({})).toThrow('Missing bucket configuration')
    expect(() => resolveBucketConfig({ BUCKET: 'b' })).toThrow('Missing bucket configuration')
    expect(() => resolveBucketConfig({ BUCKET: 'b', ACCESS_KEY_ID: 'k' })).toThrow('Missing bucket configuration')
  })

  it('builds a client from Railway variables', () => {
    const { bucket, client } = resolveBucketConfig({ ...fullEnv })

    expect(bucket).toBe('bucket-a')
    expect((client as unknown as { config: unknown }).config).toEqual({
      region: 'auto',
      credentials: { accessKeyId: 'key-id', secretAccessKey: 'secret' },
      endpoint: 'https://t3.storageapi.dev',
    })
  })

  it('falls back to AWS variable names and defaults', () => {
    const { bucket, client } = resolveBucketConfig({
      BUCKET: 'bucket-b',
      AWS_ACCESS_KEY_ID: 'aws-key',
      AWS_SECRET_ACCESS_KEY: 'aws-secret',
    })

    expect(bucket).toBe('bucket-b')
    expect((client as unknown as { config: unknown }).config).toEqual({
      region: 'auto',
      credentials: { accessKeyId: 'aws-key', secretAccessKey: 'aws-secret' },
    })

    const byAwsBucket = resolveBucketConfig({
      AWS_S3_BUCKET: 'bucket-c',
      AWS_ACCESS_KEY_ID: 'aws-key',
      AWS_SECRET_ACCESS_KEY: 'aws-secret',
      AWS_REGION: 'us-east-1',
      AWS_S3_ENDPOINT: 'https://s3.example.com',
    })
    expect(byAwsBucket.bucket).toBe('bucket-c')
    expect((byAwsBucket.client as unknown as { config: unknown }).config).toEqual({
      region: 'us-east-1',
      credentials: { accessKeyId: 'aws-key', secretAccessKey: 'aws-secret' },
      endpoint: 'https://s3.example.com',
    })
  })

  it('reuses the client for the same bucket and rebuilds on change', () => {
    const first = resolveBucketConfig({ ...fullEnv, BUCKET: 'bucket-cache' })
    const second = resolveBucketConfig({ ...fullEnv, BUCKET: 'bucket-cache' })
    expect(second).toBe(first)

    const third = resolveBucketConfig({ ...fullEnv, BUCKET: 'bucket-other' })
    expect(third).not.toBe(first)
    expect(third.bucket).toBe('bucket-other')
  })

  it('defaults to the process environment', () => {
    process.env.BUCKET = 'bucket-process'
    process.env.ACCESS_KEY_ID = 'key-id'
    process.env.SECRET_ACCESS_KEY = 'secret'

    expect(resolveBucketConfig().bucket).toBe('bucket-process')
  })
})

describe('getObject', () => {
  it('fetches objects with bucket and key', async () => {
    process.env.BUCKET = 'bucket-get'
    process.env.ACCESS_KEY_ID = 'key-id'
    process.env.SECRET_ACCESS_KEY = 'secret'
    const body = new ReadableStream()
    mockSend.mockResolvedValue({ Body: body, ContentLength: 42 })

    const object = await getObject('releases/latest.json')

    expect(object).toEqual({ key: 'releases/latest.json', body, contentLength: 42 })
    expect(mockSend).toHaveBeenCalledTimes(1)
    const command = mockSend.mock.calls[0][0] as { input: unknown }
    expect(command.input).toEqual({ Bucket: 'bucket-get', Key: 'releases/latest.json' })
  })

  it('maps missing content length to null', async () => {
    process.env.BUCKET = 'bucket-get'
    process.env.ACCESS_KEY_ID = 'key-id'
    process.env.SECRET_ACCESS_KEY = 'secret'
    mockSend.mockResolvedValue({ Body: new ReadableStream() })

    const object = await getObject('releases/latest.json')

    expect(object?.contentLength).toBeNull()
  })

  it('returns null for missing keys', async () => {
    process.env.BUCKET = 'bucket-get'
    process.env.ACCESS_KEY_ID = 'key-id'
    process.env.SECRET_ACCESS_KEY = 'secret'

    const noSuchKey = new Error('missing') as Error & { name: string }
    noSuchKey.name = 'NoSuchKey'
    mockSend.mockRejectedValueOnce(noSuchKey)
    expect(await getObject('releases/latest.json')).toBeNull()

    mockSend.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
    expect(await getObject('releases/latest.json')).toBeNull()
  })

  it('rethrows unexpected failures', async () => {
    process.env.BUCKET = 'bucket-get'
    process.env.ACCESS_KEY_ID = 'key-id'
    process.env.SECRET_ACCESS_KEY = 'secret'

    mockSend.mockRejectedValueOnce(new Error('boom'))
    await expect(getObject('releases/latest.json')).rejects.toThrow('boom')

    mockSend.mockRejectedValueOnce('string boom')
    await expect(getObject('releases/latest.json')).rejects.toBe('string boom')

    mockSend.mockRejectedValueOnce(null)
    await expect(getObject('releases/latest.json')).rejects.toBeNull()

    mockSend.mockRejectedValueOnce({ $metadata: {} })
    await expect(getObject('releases/latest.json')).rejects.toEqual({ $metadata: {} })

    mockSend.mockRejectedValueOnce({ $metadata: undefined })
    await expect(getObject('releases/latest.json')).rejects.toEqual({ $metadata: undefined })

    mockSend.mockRejectedValueOnce({ $metadata: { httpStatusCode: 500 } })
    await expect(getObject('releases/latest.json')).rejects.toEqual({ $metadata: { httpStatusCode: 500 } })
  })
})
