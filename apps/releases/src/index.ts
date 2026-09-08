/**
 * Standalone Node.js server for the releases service (Railway, local dev).
 */

import { serve } from '@hono/node-server'
import { loadLocalEnv } from './load-env.js'
import { resolveBucketConfig } from './s3.js'

loadLocalEnv()

// Fail fast when bucket credentials are not configured.
resolveBucketConfig()

const { default: app } = await import('./app.js')
const port = Number(process.env.PORT ?? 3100)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[Releases] Server running at http://localhost:${info.port}`)
  console.log('[Releases] Routes:')
  console.log('  GET /health')
  console.log('  GET /releases/latest.json')
  console.log('  GET /releases/v/:version/:name')
})
