import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import { afterEach, describe, expect, it } from 'vitest'
import { authMiddleware, getJwtSecret, signToken } from './auth.js'

const savedSecret = process.env.JWT_SECRET

afterEach(() => {
  if (savedSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = savedSecret
})

function createApp() {
  const app = new Hono<{ Variables: { jwtPayload: unknown } }>()
  app.use('/*', authMiddleware)
  app.get('/protected', (c) => c.json({ payload: c.get('jwtPayload') }))
  return app
}

describe('authMiddleware', () => {
  it('rejects requests without a bearer token', async () => {
    const app = createApp()

    const missing = await app.request('/protected')
    expect(missing.status).toBe(401)

    const malformed = await app.request('/protected', { headers: { Authorization: 'Token abc' } })
    expect(malformed.status).toBe(401)
  })

  it('rejects invalid tokens', async () => {
    process.env.JWT_SECRET = 'auth-test-secret'
    const app = createApp()

    const res = await app.request('/protected', { headers: { Authorization: 'Bearer not-a-token' } })
    expect(res.status).toBe(401)
  })

  it('rejects tokens without a configured secret', async () => {
    delete process.env.JWT_SECRET
    const app = createApp()

    const res = await app.request('/protected', { headers: { Authorization: 'Bearer abc' } })
    expect(res.status).toBe(401)
  })

  it('attaches the payload for valid tokens', async () => {
    process.env.JWT_SECRET = 'auth-test-secret'
    const token = signToken({ sub: '3', email: 'a@b.c', name: 'Ada', role: 'admin', permissions: [] })
    const app = createApp()

    const res = await app.request('/protected', { headers: { Authorization: `Bearer ${token}` } })
    const body = (await res.json()) as { payload: { sub: string } }

    expect(res.status).toBe(200)
    expect(body.payload.sub).toBe('3')
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

describe('signToken', () => {
  it('signs verifiable tokens with a custom expiry', () => {
    process.env.JWT_SECRET = 'auth-test-secret'
    const token = signToken({ sub: '3', email: 'a@b.c', name: 'Ada', role: 'admin', permissions: [] }, 60)

    const payload = jwt.verify(token, 'auth-test-secret') as { sub: string }
    expect(payload.sub).toBe('3')
  })
})
