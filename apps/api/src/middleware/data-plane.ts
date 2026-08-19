/**
 * Resolve the request's store data plane before route handlers run.
 */

import type { MiddlewareHandler } from 'hono'
import jwt from 'jsonwebtoken'
import { parseConnectionKey } from '@openpos/data'
import { resolveDataPlane } from '../lib/connection.js'
import { createDataPlaneClient, runWithDataPlane } from '../lib/turso.js'
import { getJwtSecret, type JwtPayload } from './auth.js'

const { verify } = jwt

const DATA_PREFIXES = [
  '/api/auth',
  '/api/products',
  '/api/orders',
  '/api/customers',
  '/api/users',
  '/api/analytics',
  '/api/settings',
  '/api/query',
  '/api/execute',
  '/api/connections/current',
]

const PUBLIC_DATA_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/users',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/reset-password-token',
  '/api/settings/public',
])

const EXEMPT_PATHS = new Set(['/api/auth/hash', '/api/auth/verify'])

function needsDataPlane(path: string): boolean {
  if (EXEMPT_PATHS.has(path)) return false
  return DATA_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

function connectionKeyFromRequest(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const headerKey = parseConnectionKey(c.req.header('X-OpenPOS-Connection') || '')
  if (headerKey) return headerKey

  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  try {
    const payload = verify(authHeader.slice(7), getJwtSecret()) as JwtPayload
    return parseConnectionKey(payload.connectionKey || '')
  } catch {
    return null
  }
}

export const dataPlaneMiddleware: MiddlewareHandler = async (c, next) => {
  const path = c.req.path
  if (!needsDataPlane(path)) {
    return next()
  }

  if (!PUBLIC_DATA_PATHS.has(path) && !c.req.header('Authorization')?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401)
  }

  const connectionKey = connectionKeyFromRequest(c)
  if (connectionKey) {
    const config = await resolveDataPlane(connectionKey)
    if (!config) {
      return c.json({ error: 'connection_not_found' }, 404)
    }
    return runWithDataPlane(createDataPlaneClient(config), () => next())
  }

  return c.json({ error: 'Store connection required' }, 401)
}
