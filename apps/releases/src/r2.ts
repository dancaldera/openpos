import type { ReleaseReader } from './routes.js'

/** The part of the Workers R2 binding the release feed uses. */
export interface R2BucketLike {
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>
}

export function r2Reader(bucket: R2BucketLike): ReleaseReader {
  return async (key) => {
    const object = await bucket.get(key)
    return object ? { key, body: object.body, contentLength: object.size } : null
  }
}
