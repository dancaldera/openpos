/**
 * Resolve the request's store data plane before route handlers run.
 */

import { parseConnectionKey } from '@openpos/data'
import type { MiddlewareHandler } from 'hono'
import jwt from 'jsonwebtoken'
import { readAssignedConnection, resolveDataPlane } from '../lib/connection.js'
import { createDataPlaneClient, runWithDataPlane } from '../lib/turso.js'
import { getJwtSecret, type JwtPayload } from './auth.js'

const { verify } = jwt

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
])

// Operator utilities that never touch store data: they skip the data plane
// entirely so they work without a store connection (e.g. before first run).
const EXEMPT_PATHS = new Set(['/api/auth/hash', '/api/auth/verify', '/api/auth/verify-internal-secret'])

function needsDataPlane(path: string): boolean {
  if (EXEMPT_PATHS.has(path)) return false
  return DATA_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

async function connectionKeyFromRequest(c: {
  req: { header: (name: string) => string | undefined }
}): Promise<string | null> {
  const headerKey = parseConnectionKey(c.req.header('X-OpenPOS-Connection') || '')
  if (headerKey) return headerKey

  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = verify(authHeader.slice(7), getJwtSecret()) as JwtPayload
      const tokenKey = parseConnectionKey(payload.connectionKey || '')
      if (tokenKey) return tokenKey
    } catch {
      // Fall through to the API's assigned store.
    }
  }

  return (await readAssignedConnection())?.key || null
}

export const dataPlaneMiddleware: MiddlewareHandler = async (c, next) => {
  const path = c.req.path
  if (!needsDataPlane(path)) {
    return next()
  }

  if (!PUBLIC_DATA_PATHS.has(path) && !c.req.header('Authorization')?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401)
  }

  const connectionKey = await connectionKeyFromRequest(c)
  if (connectionKey) {
    const config = await resolveDataPlane(connectionKey)
    if (!config) {
      if (path === '/api/auth/login') {
        return next()
      }
      return c.json({ error: 'connection_not_found' }, 404)
    }
    return runWithDataPlane(createDataPlaneClient(config), () => next())
  }

  return c.json({ error: 'Store connection required' }, 401)
}
