/**
 * JWT authentication middleware for Hono.
 *
 * Validates the Authorization: Bearer <token> header on every protected route.
 * Attaches the decoded payload to c.set('jwtPayload', payload) for downstream
 * handlers.
 */

import type { MiddlewareHandler } from 'hono'
import jwt from 'jsonwebtoken'

const { sign, verify } = jwt

export interface JwtPayload {
  sub: string      // user id
  email: string
  name: string
  role: 'admin' | 'manager' | 'user'
  permissions: string[]
  iat?: number
  exp?: number
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return secret
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401)
  }

  const token = authHeader.slice(7)

  try {
    const secret = getJwtSecret()
    const payload = verify(token, secret) as JwtPayload
    c.set('jwtPayload', payload)
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}

/** Sign a JWT for the given user payload. Expires in 8 hours by default. */
export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresInSeconds = 8 * 60 * 60): string {
  const secret = getJwtSecret()
  return sign(payload, secret, { expiresIn: expiresInSeconds })
}
