import { afterEach, describe, expect, it } from 'vitest'
import app from './index'

describe('API app', () => {
  it('returns a health payload', async () => {
    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    })
  })

  it('returns db status when no store connection is selected', async () => {
    const response = await app.request('/api/db-status')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'error',
      mode: 'api',
      remoteConfigured: false,
      lastCheckedAt: expect.any(String),
    })
  })

  it('returns JSON for unknown routes', async () => {
    const response = await app.request('/api/does-not-exist')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'Route http://localhost/api/does-not-exist not found',
    })
  })

  it('protects product image routes with auth', async () => {
    const response = await app.request('/api/products/images/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keys: ['products/2026/03/example.jpg'] }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: 'Missing or invalid Authorization header',
    })
  })
})
