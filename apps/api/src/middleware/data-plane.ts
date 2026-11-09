/**
 * Resolve the request's store data plane before route handlers run.
 */

import type { MiddlewareHandler } from 'hono'
import { type ResolvedStore, requestConnectionKey, resolveRequestStore, resolveStore } from '../lib/stores.js'
import { createDataPlaneClient, runWithDataPlane } from '../lib/turso.js'
import type { AppEnv, JwtPayload } from '../types.js'
import { bearerToken, verifyToken } from './auth.js'

const DATA_PREFIXES = [
  '/api/auth',
  '/api/products/images',
  '/api/settings',
  '/api/query',
  '/api/execute',
  '/api/connections/current',
]

const PUBLIC_DATA_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/users',
  '/api/auth/admin-reset-password',
  '/api/settings/public',
  '/api/connections/current',
])

// Operator utilities that never touch store data: they skip the data plane
// entirely so they work without a store connection.
const EXEMPT_PATHS = new Set(['/api/auth/hash', '/api/auth/verify', '/api/auth/verify-internal-secret'])

function needsDataPlane(path: string): boolean {
  if (EXEMPT_PATHS.has(path)) return false
  return DATA_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

function storeFromToken(payload: JwtPayload): Promise<ResolvedStore | null> | null {
  if (payload.storeId) return resolveStore({ id: payload.storeId })
  if (payload.connectionKey) return resolveStore({ key: payload.connectionKey })
  return null
}

export const dataPlaneMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const path = c.req.path
  if (!needsDataPlane(path)) {
    return next()
  }

  const isPublic = PUBLIC_DATA_PATHS.has(path)
  const token = bearerToken(c.req.header('Authorization'))
  let payload: JwtPayload | null = null
  if (token) {
    try {
      payload = await verifyToken(token)
    } catch {
      if (!isPublic) return c.json({ error: 'Invalid or expired token' }, 401)
    }
  } else if (!isPublic) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401)
  }

  // A session is bound to the store that issued it, whatever headers say.
  const bound = payload ? storeFromToken(payload) : null
  const resolved = bound ? await bound : await resolveRequestStore(c.req)
  if (!resolved) {
    if (bound || requestConnectionKey(c.req)) {
      return c.json({ error: 'connection_not_found' }, 404)
    }
    return c.json({ error: 'Store connection required' }, 401)
  }

  c.set('store', resolved.store)
  return runWithDataPlane(createDataPlaneClient(resolved.dataPlane), () => next())
}
