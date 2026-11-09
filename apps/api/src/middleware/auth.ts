/**
 * JWT authentication middleware for Hono.
 *
 * Validates the Authorization: Bearer <token> header on every protected route
 * and attaches the decoded payload as c.get('jwtPayload').
 */

import type { MiddlewareHandler } from 'hono'
import { sign, verify } from 'hono/jwt'
import type { AppEnv, JwtPayload } from '../types.js'

export type { JwtPayload } from '../types.js'

const ALGORITHM = 'HS256'

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return secret
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  return (await verify(token, getJwtSecret(), ALGORITHM)) as unknown as JwtPayload
}

export function bearerToken(header: string | undefined): string | null {
  return header?.startsWith('Bearer ') ? header.slice(7) : null
}

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearerToken(c.req.header('Authorization'))
  if (!token) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401)
  }

  let payload: JwtPayload
  try {
    payload = await verifyToken(token)
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
  c.set('jwtPayload', payload)
  await next()
}

/** Sign a JWT for the given user payload. Expires in 8 hours by default. */
export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresInSeconds = 8 * 60 * 60): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000)
  return sign({ ...payload, iat: issuedAt, exp: issuedAt + expiresInSeconds }, getJwtSecret(), ALGORITHM)
}
