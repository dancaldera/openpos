/**
 * Connection routes
 *
 * GET  /api/connections/current  — store for this request (token, key header, or web host)
 * POST /api/connections/connect  — exchange a connection key for the store's sync credentials
 *
 * Stores are created and assigned in the admin app; devices only need the key.
 */

import { parseConnectionKey } from '@openpos/data/src/runtime.js'
import { Hono } from 'hono'
import { publicStore, resolveStore } from '../lib/stores.js'
import type { AppEnv } from '../types.js'

export const connectionsRouter = new Hono<AppEnv>()

connectionsRouter.get('/current', (c) => c.json({ store: publicStore(c.get('store')) }))

connectionsRouter.post('/connect', async (c) => {
  let body: { key?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const key = parseConnectionKey(typeof body.key === 'string' ? body.key : '')
  if (!key) {
    return c.json({ error: 'invalid_connection_key' }, 400)
  }

  const resolved = await resolveStore({ key })
  if (!resolved) {
    return c.json({ error: 'connection_not_found' }, 404)
  }

  // Desktop devices keep a local replica, so they receive the store database
  // credentials. The key is the only secret a device ever needs.
  return c.json({
    key,
    store: publicStore(resolved.store),
    dataPlane: resolved.dataPlane,
  })
})
