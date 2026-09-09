/**
 * Standalone Node.js server for the releases service (Railway, local dev).
 */

import { serve } from '@hono/node-server'
import { loadLocalEnv } from './load-env.js'
import { resolveBucketConfig } from './s3.js'

export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.PORT ?? 3100)
}

export function logStartup(info: { port: number }): void {
  console.log(`[Releases] Server running at http://localhost:${info.port}`)
  console.log('[Releases] Routes:')
  console.log('  GET /health')
  console.log('  GET /releases/latest.json')
  console.log('  GET /releases/v/:version/:name')
}

export async function startServer(port: number) {
  loadLocalEnv()

  // Fail fast when bucket credentials are not configured.
  resolveBucketConfig()

  const { default: app } = await import('./app.js')
  return serve({ fetch: app.fetch, port }, logStartup)
}

/* c8 ignore next: production entrypoint (tests call startServer directly). */
if (!process.env.VITEST) {
  await startServer(resolvePort())
}
