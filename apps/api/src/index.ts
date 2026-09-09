/**
 * OpenPOS API Server
 *
 * Hono application that exposes all REST endpoints.
 * Runs as a standalone Node.js server for local development and deployment.
 */

import { parseConnectionKey } from '@openpos/data'
import { Hono } from 'hono'
import { readAssignedConnection, resolveDataPlane } from './lib/connection.js'
import { execute, probeDataPlane, query } from './lib/turso.js'
import { authMiddleware } from './middleware/auth.js'
import { corsMiddleware } from './middleware/cors.js'
import { dataPlaneMiddleware } from './middleware/data-plane.js'
import { analyticsRouter } from './routes/analytics.js'
import { authRouter } from './routes/auth.js'
import { connectionsRouter } from './routes/connections.js'
import { customersRouter } from './routes/customers.js'
import { ordersRouter } from './routes/orders.js'
import { productImagesRouter } from './routes/product-images.js'
import { productsRouter } from './routes/products.js'
import { settingsRouter } from './routes/settings.js'
import { usersRouter } from './routes/users.js'

export const app = new Hono()

// Global middleware
app.use('/*', corsMiddleware)
app.use('/api/*', dataPlaneMiddleware)

// Root welcome (unauthenticated)
app.get('/', (c) =>
  c.json({
    name: 'OpenPOS API',
    status: 'ok',
    timestamp: new Date().toISOString(),
    health: '/api/health',
  }),
)

// Health check (unauthenticated)
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Safe DB status check for the web client badge (unauthenticated)
app.get('/api/db-status', async (c) => {
  const connectionKey =
    parseConnectionKey(c.req.header('X-OpenPOS-Connection') || '') || (await readAssignedConnection())?.key || ''
  if (connectionKey) {
    const config = await resolveDataPlane(connectionKey)
    const reachable = config ? await probeDataPlane(config) : false
    return c.json({
      status: reachable ? 'remote' : 'error',
      mode: 'api',
      remoteConfigured: Boolean(config),
      lastCheckedAt: new Date().toISOString(),
    })
  }

  return c.json({
    status: 'error',
    mode: 'api',
    remoteConfigured: false,
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

// Route groups
app.route('/api/connections', connectionsRouter)
app.route('/api/auth', authRouter)
app.route('/api/products/images', productImagesRouter)
app.route('/api/products', productsRouter)
app.route('/api/orders', ordersRouter)
app.route('/api/customers', customersRouter)
app.route('/api/users', usersRouter)
app.route('/api/analytics', analyticsRouter)
app.route('/api/settings', settingsRouter)

// 404 catch-all
app.notFound((c) => c.json({ error: `Route ${c.req.url} not found` }, 404))

// Error handler (Hono only routes Error instances here; anything else is rethrown)
app.onError((err, c) => {
  console.error('[API] Unhandled error:', err)
  return c.json({ error: err.message }, 500)
})

export default app

export function getServerPort(): number {
  return Number(process.env.PORT ?? 3001)
}

export async function startServer(port: number) {
  const { serve } = await import('@hono/node-server')
  const assigned = await readAssignedConnection()
  const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
    console.log(`[API] Server running at http://localhost:${info.port}`)
    if (assigned) console.log(`[API] Store connected: ${assigned.storeName}`)
    console.log('[API] Routes:')
    console.log('  GET  /api/health')
    console.log('  POST /api/auth/login')
    console.log('  POST /api/auth/hash')
    console.log('  POST /api/auth/verify')
    console.log('  GET  /api/auth/me')
    console.log('  POST /api/auth/admin-reset-password')
    console.log('  ...and more')
  })
  return server
}

// ---------------------------------------------------------------------------
// Standalone Node.js server (Railway, local dev, etc.)
// ---------------------------------------------------------------------------
/* c8 ignore next 3 -- the launcher only runs as the main module entry point */
if (import.meta.main && !process.env.VERCEL) {
  await startServer(getServerPort())
}
