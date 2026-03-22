import { afterEach, describe, expect, it } from 'bun:test'
import app from './index'

const originalTursoDatabaseUrl = process.env.TURSO_DATABASE_URL
const originalTursoAuthToken = process.env.TURSO_AUTH_TOKEN

afterEach(() => {
  if (originalTursoDatabaseUrl === undefined) {
    delete process.env.TURSO_DATABASE_URL
  } else {
    process.env.TURSO_DATABASE_URL = originalTursoDatabaseUrl
  }

  if (originalTursoAuthToken === undefined) {
    delete process.env.TURSO_AUTH_TOKEN
  } else {
    process.env.TURSO_AUTH_TOKEN = originalTursoAuthToken
  }
})

describe('API app', () => {
  it('returns a health payload', async () => {
    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    })
  })

  it('returns db status when Turso is not configured', async () => {
    delete process.env.TURSO_DATABASE_URL
    delete process.env.TURSO_AUTH_TOKEN

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
})
