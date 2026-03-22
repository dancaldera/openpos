/**
 * OpenPOS API Server
 *
 * Hono application that exposes all REST endpoints.
 * Deployed as Vercel serverless functions via vercel.json rewrites.
 * Can also run as a standalone Node.js server for local development.
 */

import { Hono } from 'hono'
import { corsMiddleware } from './middleware/cors.js'
import { authMiddleware } from './middleware/auth.js'
import { execute, getTursoConfig, probeTursoConnection, query } from './lib/turso.js'
import { authRouter } from './routes/auth.js'
import { productsRouter } from './routes/products.js'
import { ordersRouter } from './routes/orders.js'
import { customersRouter } from './routes/customers.js'
import { usersRouter } from './routes/users.js'
import { analyticsRouter } from './routes/analytics.js'
import { settingsRouter } from './routes/settings.js'

export const app = new Hono()

// Global middleware
app.use('/*', corsMiddleware)

// Health check (unauthenticated)
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Safe DB status check for the web client badge (unauthenticated)
app.get('/api/db-status', async (c) => {
  const { configured } = getTursoConfig()
  const reachable = configured ? await probeTursoConnection() : false

  return c.json({
    status: reachable ? 'remote' : 'error',
    mode: 'api',
    remoteConfigured: configured,
    lastCheckedAt: new Date().toISOString(),
  })
})

// Debug endpoint (remove after troubleshooting)
app.get('/api/debug/env', (c) => c.json({
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
  NODE_ENV: process.env.NODE_ENV,
}))

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
app.route('/api/auth', authRouter)
app.route('/api/products', productsRouter)
app.route('/api/orders', ordersRouter)
app.route('/api/customers', customersRouter)
app.route('/api/users', usersRouter)
app.route('/api/analytics', analyticsRouter)
app.route('/api/settings', settingsRouter)

// 404 catch-all
app.notFound((c) => c.json({ error: `Route ${c.req.url} not found` }, 404))

// Error handler
app.onError((err, c) => {
  console.error('[API] Unhandled error:', err)
  return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500)
})

export default app

// ---------------------------------------------------------------------------
// Standalone Node.js server (Railway, local dev, etc.)
// ---------------------------------------------------------------------------
if (import.meta.main && !process.env.VERCEL) {
  const { serve } = await import('@hono/node-server')
  const port = Number(process.env.PORT ?? 3001)
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[API] Server running at http://localhost:${info.port}`)
    console.log('[API] Routes:')
    console.log('  GET  /api/health')
    console.log('  POST /api/auth/login')
    console.log('  POST /api/auth/hash')
    console.log('  POST /api/auth/verify')
    console.log('  GET  /api/auth/me')
    console.log('  ...and more')
  })
}
