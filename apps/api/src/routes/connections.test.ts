import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const connectionsDir = mkdtempSync(join(tmpdir(), 'openpos-api-connections-'))

process.env.JWT_SECRET = 'connection-test-secret-connection-test-secret'
process.env.OPENPOS_CONNECTIONS_DIR = connectionsDir

const { app } = await import('../index')

const adminPassword = 'Admin123!'

afterEach(() => {
  rmSync(connectionsDir, { recursive: true, force: true })
})

describe('connection routes', () => {
  beforeEach(() => {
    rmSync(connectionsDir, { recursive: true, force: true })
  })

  it('creates a store, joins it, and logs in without Turso env', async () => {
    const createResponse = await app.request('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeName: 'Corner Shop',
        adminName: 'Ada Admin',
        adminEmail: 'ada@example.com',
        adminPassword,
      }),
    })

    expect(createResponse.status).toBe(201)
    const created = (await createResponse.json()) as {
      key: string
      seed: string
      storeName: string
      dataPlane: { url: string }
    }
    expect(created.key.startsWith('OPK_')).toBe(true)
    expect(created.seed.startsWith('OPS_')).toBe(true)
    expect(created.storeName).toBe('Corner Shop')
    expect(created.dataPlane.url).toMatch(/^file:/)

    const joinResponse = await app.request('/api/connections/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: created.key, seed: created.seed }),
    })
    expect(joinResponse.status).toBe(200)
    expect(await joinResponse.json()).toMatchObject({
      key: created.key,
      storeName: 'Corner Shop',
    })

    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenPOS-Connection': created.key,
      },
      body: JSON.stringify({
        email: 'ada@example.com',
        password: adminPassword,
      }),
    })

    expect(loginResponse.status).toBe(200)
    const login = (await loginResponse.json()) as { token: string; user: { email: string } }
    expect(login.token).toEqual(expect.any(String))
    expect(login.user.email).toBe('ada@example.com')
  })

  it('rejects a wrong seed', async () => {
    const createResponse = await app.request('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeName: 'Corner Shop',
        adminName: 'Ada Admin',
        adminEmail: 'ada@example.com',
        adminPassword,
      }),
    })
    const created = (await createResponse.json()) as { key: string }

    const joinResponse = await app.request('/api/connections/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: created.key,
        seed: 'OPS_AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
      }),
    })

    expect(joinResponse.status).toBe(400)
    expect(await joinResponse.json()).toEqual({ error: 'invalid_connection_secret' })
  })

  it('rejects a database import without a url', async () => {
    const response = await app.request('/api/connections/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authToken: 'token' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Database URL is required' })
  })
})
