import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppEnv } from '../types.js'
import { authMiddleware, bearerToken, getJwtSecret, signToken, verifyToken } from './auth.js'

const savedSecret = process.env.JWT_SECRET

afterEach(() => {
  if (savedSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = savedSecret
})

function createApp() {
  const app = new Hono<AppEnv>()
  app.use('/*', authMiddleware)
  app.get('/protected', (c) => c.json({ payload: c.get('jwtPayload') }))
  return app
}

const user = { sub: '3', email: 'a@b.c', name: 'Ada', role: 'admin' as const, permissions: [] }

describe('authMiddleware', () => {
  it('rejects requests without a bearer token', async () => {
    const app = createApp()

    const missing = await app.request('/protected')
    expect(missing.status).toBe(401)
    expect(await missing.json()).toEqual({ error: 'Missing or invalid Authorization header' })

    const malformed = await app.request('/protected', { headers: { Authorization: 'Token abc' } })
    expect(malformed.status).toBe(401)
  })

  it('rejects invalid tokens', async () => {
    process.env.JWT_SECRET = 'auth-test-secret'
    const app = createApp()

    const res = await app.request('/protected', { headers: { Authorization: 'Bearer not-a-token' } })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Invalid or expired token' })
  })

  it('rejects tokens signed with another secret or already expired', async () => {
    process.env.JWT_SECRET = 'auth-test-secret'
    const app = createApp()

    const foreign = await sign({ ...user, exp: Math.floor(Date.now() / 1000) + 60 }, 'other-secret', 'HS256')
    const foreignRes = await app.request('/protected', { headers: { Authorization: `Bearer ${foreign}` } })
    expect(foreignRes.status).toBe(401)

    const expired = await signToken(user, -60)
    const expiredRes = await app.request('/protected', { headers: { Authorization: `Bearer ${expired}` } })
    expect(expiredRes.status).toBe(401)
  })

  it('rejects tokens without a configured secret', async () => {
    delete process.env.JWT_SECRET
    const app = createApp()

    const res = await app.request('/protected', { headers: { Authorization: 'Bearer abc' } })
    expect(res.status).toBe(401)
  })

  it('attaches the payload for valid tokens', async () => {
    process.env.JWT_SECRET = 'auth-test-secret'
    const token = await signToken({ ...user, storeId: 'store-1' })
    const app = createApp()

    const res = await app.request('/protected', { headers: { Authorization: `Bearer ${token}` } })
    const body = (await res.json()) as { payload: { sub: string; storeId: string } }

    expect(res.status).toBe(200)
    expect(body.payload.sub).toBe('3')
    expect(body.payload.storeId).toBe('store-1')
  })
})

describe('getJwtSecret', () => {
  it('requires JWT_SECRET', () => {
    delete process.env.JWT_SECRET
    expect(() => getJwtSecret()).toThrow('JWT_SECRET environment variable is not set')

    process.env.JWT_SECRET = 'x'
    expect(getJwtSecret()).toBe('x')
  })
})

describe('bearerToken', () => {
  it('extracts bearer tokens only', () => {
    expect(bearerToken('Bearer abc')).toBe('abc')
    expect(bearerToken('Token abc')).toBeNull()
    expect(bearerToken(undefined)).toBeNull()
  })
})

describe('signToken', () => {
  it('signs verifiable tokens with the default 8 hour expiry', async () => {
    process.env.JWT_SECRET = 'auth-test-secret'
    const token = await signToken(user)

    const payload = await verify(token, 'auth-test-secret', 'HS256')
    expect(payload.sub).toBe('3')
    expect(Number(payload.exp) - Number(payload.iat)).toBe(8 * 60 * 60)
  })

  it('signs verifiable tokens with a custom expiry', async () => {
    process.env.JWT_SECRET = 'auth-test-secret'
    const token = await signToken(user, 60)

    const payload = await verifyToken(token)
    expect(payload.sub).toBe('3')
    expect(Number(payload.exp) - Number(payload.iat)).toBe(60)
  })
})
