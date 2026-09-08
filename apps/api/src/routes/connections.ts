/**
 * Connection routes
 *
 * POST /api/connections              — create a store (returns key + seed once)
 * POST /api/connections/join         — join with key + seed
 * POST /api/connections/import       — bind an existing database URL + token
 * POST /api/connections/register     — bind a desktop store key to this API
 * POST /api/connections/owner        — insert an owner into an empty connected store
 * GET  /api/connections/assigned     — the store this API already hosts (public)
 * GET  /api/connections/current      — active connection metadata (JWT)
 */

import { Hono } from 'hono'
import {
  bootstrapStoreOwner,
  CONNECTION_ERRORS,
  connectionErrorStatus,
  createConnection,
  importRemoteConnection,
  joinConnection,
  readAssignedConnection,
  readCurrentConnectionMeta,
  registerConnection,
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
    return c.json(
      { error: error instanceof Error ? error.message : 'Unable to create store' },
      connectionErrorStatus(error),
    )
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
    return c.json(
      { error: error instanceof Error ? error.message : 'Unable to join store' },
      connectionErrorStatus(error),
    )
  }
})

connectionsRouter.post('/import', async (c) => {
  let body: {
    url?: string
    authToken?: string
    storeName?: string
    adminName?: string
    adminEmail?: string
    adminPassword?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  try {
    const result = await importRemoteConnection({
      url: body.url || '',
      authToken: body.authToken || '',
      storeName: body.storeName,
      adminName: body.adminName,
      adminEmail: body.adminEmail,
      adminPassword: body.adminPassword,
    })
    return c.json(result, 201)
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unable to import store' },
      connectionErrorStatus(error),
    )
  }
})

connectionsRouter.post('/register', async (c) => {
  let body: {
    key?: string
    url?: string
    authToken?: string
    storeName?: string
    adminName?: string
    adminEmail?: string
    adminPassword?: string
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  try {
    const result = await registerConnection({
      key: body.key || '',
      url: body.url,
      authToken: body.authToken,
      storeName: body.storeName,
      adminName: body.adminName,
      adminEmail: body.adminEmail,
      adminPassword: body.adminPassword,
    })
    return c.json(result)
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unable to register store' },
      connectionErrorStatus(error),
    )
  }
})

connectionsRouter.post('/owner', async (c) => {
  let body: { key?: string; storeName?: string; adminName?: string; adminEmail?: string; adminPassword?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  try {
    const result = await bootstrapStoreOwner({
      key: body.key || '',
      storeName: body.storeName || '',
      adminName: body.adminName || '',
      adminEmail: body.adminEmail || '',
      adminPassword: body.adminPassword || '',
    })
    return c.json(result)
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unable to create owner' },
      connectionErrorStatus(error),
    )
  }
})

connectionsRouter.get('/assigned', async (c) => {
  const assigned = await readAssignedConnection()
  if (!assigned) {
    return c.json({ error: CONNECTION_ERRORS.notFound }, 404)
  }
  return c.json(assigned)
})

connectionsRouter.get('/current', authMiddleware, async (c) => {
  const meta = await readCurrentConnectionMeta()
  if (!meta) {
    return c.json({ error: CONNECTION_ERRORS.notFound }, 404)
  }
  return c.json(meta)
})
