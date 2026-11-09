/**
 * Release feed routes, independent of where artifacts are stored: S3 for the
 * Node server (src/app.ts) and an R2 binding on Workers (src/worker.ts).
 */

import { type Context, Hono } from 'hono'

export interface ReleaseObject {
  key: string
  body: unknown
  contentLength: number | null
}

/** Reads one object from the releases bucket, or null when it does not exist. */
export type ReleaseReader = (key: string) => Promise<ReleaseObject | null>

/** Manifest key written by scripts/release.ts. */
const MANIFEST_KEY = 'releases/latest.json'
/** Versioned artifact prefix, e.g. releases/v0.8.4/openpos-x86_64.AppImage. */
const ARTIFACT_PREFIX = 'releases/v'

const VERSION_RE = /^\d+\.\d+\.\d+$/
const FILE_NAME_RE = /^[\w.-]+$/

function contentTypeFor(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.deb')) return 'application/vnd.debian.binary-package'
  if (lower.endsWith('.zip')) return 'application/zip'
  if (lower.endsWith('.appimage')) return 'application/x-executable'
  if (lower.endsWith('.dmg')) return 'application/x-apple-diskimage'
  return 'application/octet-stream'
}

function objectResponse(object: ReleaseObject, cacheControl: string): Response {
  const headers = new Headers()
  headers.set('Content-Type', contentTypeFor(object.key))
  headers.set('Cache-Control', cacheControl)
  if (object.contentLength !== null) {
    headers.set('Content-Length', String(object.contentLength))
  }

  return new Response(object.body as ReadableStream, { headers })
}

export function handleError(err: Error, c: Context): Response {
  console.error('[Releases] Unhandled error:', err)
  return c.json({ error: 'Internal server error' }, 500)
}

export function createReleasesApp(read: ReleaseReader) {
  const app = new Hono()

  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

  // Update manifest consumed by the desktop app. Cached briefly so clients get
  // fresh versions quickly without hammering the bucket.
  app.get('/releases/latest.json', async (c) => {
    try {
      const object = await read(MANIFEST_KEY)
      if (!object) {
        return c.json({ error: 'No release published yet' }, 404)
      }
      return objectResponse(object, 'public, max-age=60')
    } catch (error) {
      console.error('[Releases] Failed to read manifest:', error)
      return c.json({ error: 'Failed to read release manifest' }, 500)
    }
  })

  // Versioned release artifacts. Keys are immutable per version, so they can be
  // cached aggressively. The public URL in latest.json is /releases/v/<ver>/<file>.
  async function serveArtifact(c: Context): Promise<Response> {
    const version = c.req.param('version') ?? ''
    const name = c.req.param('name') ?? ''

    if (!VERSION_RE.test(version) || !FILE_NAME_RE.test(name)) {
      return c.json({ error: 'Invalid release asset path' }, 400)
    }

    const key = `${ARTIFACT_PREFIX}${version}/${name}`

    try {
      const object = await read(key)
      if (!object) {
        return c.json({ error: `Release asset not found: ${name}` }, 404)
      }
      return objectResponse(object, 'public, max-age=31536000, immutable')
    } catch (error) {
      console.error(`[Releases] Failed to read ${key}:`, error)
      return c.json({ error: 'Failed to read release asset' }, 500)
    }
  }

  app.get('/releases/v/:version/:name', serveArtifact)
  app.get('/v/:version/:name', serveArtifact)

  app.notFound((c) => c.json({ error: `Route ${c.req.url} not found` }, 404))
  app.onError(handleError)

  return { app, serveArtifact }
}
