/**
 * Node entry point for local development. Production runs src/worker.ts.
 */

import { app } from './app.js'

export { app }
export default app

export function getServerPort(): number {
  return Number(process.env.PORT ?? 3001)
}

export async function startServer(port: number) {
  const { serve } = await import('@hono/node-server')
  return serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
    console.log(`[API] Server running at http://localhost:${info.port}`)
  })
}

/* c8 ignore next 3 -- the launcher only runs as the main module entry point */
if (import.meta.main) {
  await startServer(getServerPort())
}
