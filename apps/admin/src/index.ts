/**
 * Node entry point for local development. Falls back to local SQLite store
 * databases when Turso is not configured. Production runs src/worker.ts.
 */

import { serve } from '@hono/node-server'
import { localProvisioner } from '@openpos/control-plane/local'
import { createAdminApp } from './app.tsx'
import { type AdminEnv, defaultProvisioner } from './env.ts'

const env = process.env as AdminEnv
const app = createAdminApp({
  provisioner: (current) =>
    defaultProvisioner(current) ?? (current.LOCAL_DATABASES_DIR ? localProvisioner(current.LOCAL_DATABASES_DIR) : null),
})

const port = Number(process.env.ADMIN_PORT ?? 3002)
serve({ fetch: (request) => app.fetch(request, env), port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[admin] Running at http://localhost:${info.port}`)
})
