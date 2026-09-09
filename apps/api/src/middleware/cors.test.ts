import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'
import { corsMiddleware } from './cors.js'

const savedOrigin = process.env.ALLOWED_ORIGIN

afterEach(() => {
  if (savedOrigin === undefined) delete process.env.ALLOWED_ORIGIN
  else process.env.ALLOWED_ORIGIN = savedOrigin
})

function createApp() {
  const app = new Hono()
  app.use('/*', corsMiddleware)
  app.get('/ping', (c) => c.json({ ok: true }))
  return app
}

describe('corsMiddleware', () => {
  it('allows dev origins by default', async () => {
    delete process.env.ALLOWED_ORIGIN
    const app = createApp()

    const res = await app.request('/ping', { headers: { Origin: 'http://localhost:5173' } })

    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })

  it('allows configured origins and trims the list', async () => {
    process.env.ALLOWED_ORIGIN = 'https://shop.example.com, https://admin.example.com ,,'
    const app = createApp()

    const res = await app.request('/ping', { headers: { Origin: 'https://admin.example.com' } })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.com')
  })

  it('omits the origin header for disallowed origins', async () => {
    delete process.env.ALLOWED_ORIGIN
    const app = createApp()

    const res = await app.request('/ping', { headers: { Origin: 'https://evil.example.com' } })

    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET')
  })

  it('answers preflights with 204', async () => {
    process.env.ALLOWED_ORIGIN = 'https://shop.example.com'
    const app = createApp()

    const allowed = await app.request('/ping', { method: 'OPTIONS', headers: { Origin: 'https://shop.example.com' } })
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://shop.example.com')

    const denied = await app.request('/ping', { method: 'OPTIONS', headers: { Origin: 'https://evil.example.com' } })
    expect(denied.status).toBe(204)
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBe('')
  })

  it('allows requests without an origin', async () => {
    delete process.env.ALLOWED_ORIGIN
    const app = createApp()

    const res = await app.request('/ping')

    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
