/**
 * OpenPOS Releases Service
 *
 * Small public proxy in front of the private OpenPOS releases bucket
 * (Railway Bucket, S3-compatible). Serves the update manifest consumed by the
 * desktop app and streams release artifacts.
 *
 * Environment (wire these to the bucket's Railway-provided variables):
 *   BUCKET            S3 bucket name (Railway: ${{openpos-releases.BUCKET}})
 *   ACCESS_KEY_ID     S3 access key id
 *   SECRET_ACCESS_KEY S3 secret access key
 *   REGION            S3 region ("auto" for Railway)
 *   ENDPOINT          S3 endpoint (e.g. https://t3.storageapi.dev)
 *   PORT              HTTP port (default 3100)
 *
 * Local runs also load `apps/releases/.env` when that file exists.
 */

import { type Context, Hono } from 'hono'
import { getObject, type ReleaseObject } from './s3.js'

export const app = new Hono()

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

// Health check for Railway and uptime monitors.
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Update manifest consumed by the desktop app. Cached briefly so clients get
// fresh versions quickly without hammering the bucket.
app.get('/releases/latest.json', async (c) => {
  try {
    const object = await getObject(MANIFEST_KEY)
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
export async function serveArtifact(c: Context): Promise<Response> {
  const version = c.req.param('version') ?? ''
  const name = c.req.param('name') ?? ''

  if (!VERSION_RE.test(version) || !FILE_NAME_RE.test(name)) {
    return c.json({ error: 'Invalid release asset path' }, 400)
  }

  const key = `${ARTIFACT_PREFIX}${version}/${name}`

  try {
    const object = await getObject(key)
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

export function handleError(err: Error, c: Context): Response {
  console.error('[Releases] Unhandled error:', err)
  return c.json({ error: 'Internal server error' }, 500)
}

app.onError(handleError)

export default app
