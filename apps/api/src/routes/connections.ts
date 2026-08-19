/**
 * Connection routes
 *
 * POST /api/connections              — create a store (returns key + seed once)
 * POST /api/connections/join         — join with key + seed
 * POST /api/connections/import       — bind an existing database URL + token
 * GET  /api/connections/current      — active connection metadata (JWT)
 */

import { Hono } from 'hono'
import {
  CONNECTION_ERRORS,
  connectionErrorStatus,
  createConnection,
  importRemoteConnection,
  joinConnection,
  readCurrentConnectionMeta,
} from '../lib/connection.js'
import { authMiddleware } from '../middleware/auth.js'

export const connectionsRouter = new Hono()

connectionsRouter.post('/', async (c) => {
  let body: { storeName?: string; adminName?: string; adminEmail?: string; adminPassword?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  try {
    const result = await createConnection({
      storeName: body.storeName || '',
      adminName: body.adminName || '',
      adminEmail: body.adminEmail || '',
      adminPassword: body.adminPassword || '',
    })
    return c.json(result, 201)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to create store' }, connectionErrorStatus(error))
  }
})

connectionsRouter.post('/join', async (c) => {
  let body: { key?: string; seed?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  try {
    const result = await joinConnection({
      key: body.key || '',
      seed: body.seed || '',
    })
    return c.json(result)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to join store' }, connectionErrorStatus(error))
  }
})

connectionsRouter.post('/import', async (c) => {
  let body: { url?: string; authToken?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  try {
    const result = await importRemoteConnection({
      url: body.url || '',
      authToken: body.authToken || '',
    })
    return c.json(result, 201)
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unable to import store' },
      connectionErrorStatus(error),
    )
  }
})

connectionsRouter.get('/current', authMiddleware, async (c) => {
  const meta = await readCurrentConnectionMeta()
  if (!meta) {
    return c.json({ error: CONNECTION_ERRORS.notFound }, 404)
  }
  return c.json(meta)
})
