/**
 * OpenPOS API Server
 *
 * Hono application that exposes all REST endpoints.
 * Deployed as Vercel serverless functions via vercel.json rewrites.
 * Can also run as a standalone Node.js server for local development.
 */

import { Hono } from 'hono'
import { corsMiddleware } from './middleware/cors.js'
import { authRouter } from './routes/auth.js'
import { productsRouter } from './routes/products.js'
import { ordersRouter } from './routes/orders.js'
import { customersRouter } from './routes/customers.js'
import { usersRouter } from './routes/users.js'
import { analyticsRouter } from './routes/analytics.js'
import { settingsRouter } from './routes/settings.js'

const app = new Hono().basePath('/api')

// Global middleware
app.use('/*', corsMiddleware)

// Health check (unauthenticated)
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Route groups
app.route('/auth', authRouter)
app.route('/products', productsRouter)
app.route('/orders', ordersRouter)
app.route('/customers', customersRouter)
app.route('/users', usersRouter)
app.route('/analytics', analyticsRouter)
app.route('/settings', settingsRouter)

// 404 catch-all
app.notFound((c) => c.json({ error: `Route ${c.req.url} not found` }, 404))

// Error handler
app.onError((err, c) => {
  console.error('[API] Unhandled error:', err)
  return c.json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500)
})

export default app

// ---------------------------------------------------------------------------
// Standalone Node.js server (local development via `bun dev`)
// ---------------------------------------------------------------------------
if (!process.env.VERCEL && (process.env.NODE_ENV !== 'production' || process.env.STANDALONE === '1')) {
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
