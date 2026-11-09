/**
 * OpenPOS API
 *
 * One Hono app shared by every store. It runs on Cloudflare Workers
 * (src/worker.ts) and as a Node server for local development (src/index.ts).
 */

import { Hono } from 'hono'
import { resolveRequestStore } from './lib/stores.js'
import { execute, probeDataPlane, query } from './lib/turso.js'
import { authMiddleware } from './middleware/auth.js'
import { corsMiddleware } from './middleware/cors.js'
import { dataPlaneMiddleware } from './middleware/data-plane.js'
import { authRouter } from './routes/auth.js'
import { connectionsRouter } from './routes/connections.js'
import { productImagesRouter } from './routes/product-images.js'
import { settingsRouter } from './routes/settings.js'
import type { AppEnv } from './types.js'

export const app = new Hono<AppEnv>()

app.use('/*', corsMiddleware)
app.use('/api/*', dataPlaneMiddleware)

app.get('/', (c) =>
  c.json({
    name: 'OpenPOS API',
    status: 'ok',
    timestamp: new Date().toISOString(),
    health: '/api/health',
  }),
)

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Safe DB status check for the web client badge (unauthenticated)
app.get('/api/db-status', async (c) => {
  const resolved = await resolveRequestStore(c.req).catch(() => null)
  const reachable = resolved ? await probeDataPlane(resolved.dataPlane) : false
  return c.json({
    status: reachable ? 'remote' : 'error',
    mode: 'api',
    remoteConfigured: Boolean(resolved),
    lastCheckedAt: new Date().toISOString(),
  })
})

// Direct SQL endpoints (protected by JWT)
app.post('/api/query', authMiddleware, async (c) => {
  const { sql, params }: { sql: string; params: unknown[] } = await c.req.json()

  if (!sql || typeof sql !== 'string') {
    return c.json({ error: 'sql parameter is required and must be a string' }, 400)
  }

  try {
    const rows = await query(sql, params || [])
    return c.json({ rows })
  } catch (error) {
    console.error('[API] Query error:', error)
    return c.json({ error: error instanceof Error ? error.message : 'Query failed' }, 500)
  }
})

app.post('/api/execute', authMiddleware, async (c) => {
  const { sql, params }: { sql: string; params: unknown[] } = await c.req.json()

  if (!sql || typeof sql !== 'string') {
    return c.json({ error: 'sql parameter is required and must be a string' }, 400)
  }

  try {
    const result = await execute(sql, params || [])
    return c.json(result)
  } catch (error) {
    console.error('[API] Execute error:', error)
    return c.json({ error: error instanceof Error ? error.message : 'Execute failed' }, 500)
  }
})

app.route('/api/connections', connectionsRouter)
app.route('/api/auth', authRouter)
app.route('/api/products/images', productImagesRouter)
app.route('/api/settings', settingsRouter)

app.notFound((c) => c.json({ error: `Route ${c.req.url} not found` }, 404))

// Hono only routes Error instances here; anything else is rethrown.
app.onError((err, c) => {
  console.error('[API] Unhandled error:', err)
  return c.json({ error: err.message }, 500)
})

export default app
