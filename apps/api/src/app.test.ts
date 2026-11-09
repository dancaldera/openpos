import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { ControlPlane, type DataPlaneConfig } from '@openpos/control-plane'
import { localProvisioner } from '@openpos/control-plane/local'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from './app.js'
import { clearStoreCache, setControlPlaneForTests } from './lib/stores.js'
import { resetDataPlaneClientsForTests } from './lib/turso.js'

const PASSWORD = 'Str0ng!Pass'
const dir = mkdtempSync(join(tmpdir(), 'openpos-api-app-'))
const savedEnv = { ...process.env }
let plane: ControlPlane
let demo: { id: string; key: string }
let aldo: { id: string; key: string }

beforeAll(async () => {
  process.env.JWT_SECRET = 'app-test-jwt-secret'
  process.env.INTERNAL_SECRET = 'app-test-internal'
  delete process.env.DEFAULT_STORE
  plane = new ControlPlane({
    db: createClient({ url: `file:${join(dir, 'control.sqlite')}` }),
    secretsKey: 'app-test-control-plane',
    openStoreDb: (config: DataPlaneConfig) => createClient(config),
    baseDomains: ['openpos.xyz', 'localhost'],
  })
  setControlPlaneForTests(plane)
  const provisioner = localProvisioner(join(dir, 'stores'))
  const demoStore = await plane.createStore(provisioner, {
    name: 'Demo',
    slug: 'demo',
    owner: { name: 'Demo Owner', email: 'owner@demo.test', password: PASSWORD },
  })
  const aldoStore = await plane.createStore(provisioner, {
    name: 'Aldo',
    slug: 'aldo',
    owner: { name: 'Aldo Owner', email: 'owner@aldo.test', password: PASSWORD },
  })
  demo = { id: demoStore.store.id, key: demoStore.connectionKey }
  aldo = { id: aldoStore.store.id, key: aldoStore.connectionKey }
})

beforeEach(() => {
  clearStoreCache()
  delete process.env.DEFAULT_STORE
})

afterAll(() => {
  setControlPlaneForTests(null)
  resetDataPlaneClientsForTests()
  process.env = savedEnv
  rmSync(dir, { recursive: true, force: true })
})

const json = { 'Content-Type': 'application/json' }

async function login(headers: Record<string, string>, email: string) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { ...json, ...headers },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  return { response, body: (await response.json()) as { token: string; store: { id: string; slug: string } } }
}

describe('store resolution', () => {
  it('resolves the current store from the web host, the key header, or DEFAULT_STORE', async () => {
    const byHost = await app.request('/api/connections/current', { headers: { Host: 'demo.openpos.xyz' } })
    expect(await byHost.json()).toEqual({ store: { id: demo.id, name: 'Demo', slug: 'demo' } })

    const byLocalhost = await app.request('/api/connections/current', { headers: { Host: 'aldo.localhost:5173' } })
    expect(((await byLocalhost.json()) as { store: { slug: string } }).store.slug).toBe('aldo')

    const byKey = await app.request('/api/connections/current', {
      headers: { Host: 'localhost:3001', 'X-OpenPOS-Connection': aldo.key.toLowerCase() },
    })
    expect(((await byKey.json()) as { store: { slug: string } }).store.slug).toBe('aldo')

    const forwarded = await app.request('/api/connections/current', {
      headers: { Host: 'api.openpos.xyz', 'X-Forwarded-Host': 'demo.openpos.xyz' },
    })
    expect(((await forwarded.json()) as { store: { slug: string } }).store.slug).toBe('demo')

    const none = await app.request('/api/connections/current', { headers: { Host: 'localhost:3001' } })
    expect(none.status).toBe(401)

    process.env.DEFAULT_STORE = 'demo'
    const fallback = await app.request('/api/connections/current', { headers: { Host: 'localhost:3001' } })
    expect(((await fallback.json()) as { store: { slug: string } }).store.slug).toBe('demo')
  })

  it('reports unknown connection keys', async () => {
    const response = await app.request('/api/connections/current', {
      headers: { Host: 'localhost', 'X-OpenPOS-Connection': 'OPK_AAAA_AAAA_AAAA_AAAA' },
    })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'connection_not_found' })
  })

  it('hides disabled stores', async () => {
    await plane.updateStore(aldo.id, { status: 'disabled' })
    try {
      const response = await app.request('/api/connections/current', { headers: { Host: 'aldo.openpos.xyz' } })
      expect(response.status).toBe(401)
    } finally {
      await plane.updateStore(aldo.id, { status: 'active' })
    }
  })

  it('reports db status for the request store', async () => {
    const reachable = await app.request('/api/db-status', { headers: { Host: 'demo.openpos.xyz' } })
    expect(await reachable.json()).toMatchObject({ status: 'remote', remoteConfigured: true })
    const missing = await app.request('/api/db-status', { headers: { Host: 'localhost' } })
    expect(await missing.json()).toMatchObject({ status: 'error', remoteConfigured: false })
  })
})

describe('POST /api/connections/connect', () => {
  it('exchanges a key for the store sync credentials', async () => {
    const response = await app.request('/api/connections/connect', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ key: demo.key }),
    })
    const body = (await response.json()) as { key: string; store: { slug: string }; dataPlane: { url: string } }
    expect(response.status).toBe(200)
    expect(body.key).toBe(demo.key)
    expect(body.store.slug).toBe('demo')
    expect(body.dataPlane.url).toMatch(/^file:.*openpos-demo\.sqlite$/)
  })

  it('validates the key', async () => {
    const invalid = await app.request('/api/connections/connect', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ key: 'nope' }),
    })
    expect(invalid.status).toBe(400)
    const unknown = await app.request('/api/connections/connect', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ key: 'OPK_AAAA_AAAA_AAAA_AAAA' }),
    })
    expect(unknown.status).toBe(404)
    const malformed = await app.request('/api/connections/connect', { method: 'POST', headers: json, body: '{' })
    expect(malformed.status).toBe(400)
  })
})

describe('sessions', () => {
  it('signs in against the host store and binds the token to it', async () => {
    const { response, body } = await login({ Host: 'demo.openpos.xyz' }, 'owner@demo.test')
    expect(response.status).toBe(200)
    expect(body.store.slug).toBe('demo')

    const wrongStore = await login({ Host: 'aldo.openpos.xyz' }, 'owner@demo.test')
    expect(wrongStore.response.status).toBe(401)

    // A demo session keeps reading demo data even if another store's key is sent.
    const users = await app.request('/api/query', {
      method: 'POST',
      headers: { ...json, Authorization: `Bearer ${body.token}`, 'X-OpenPOS-Connection': aldo.key },
      body: JSON.stringify({ sql: 'SELECT email FROM users WHERE deleted_at IS NULL ORDER BY id' }),
    })
    expect(await users.json()).toEqual({ rows: [{ email: 'owner@demo.test' }] })

    const me = await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${body.token}` } })
    expect(((await me.json()) as { user: { storeId: string } }).user.storeId).toBe(demo.id)
  })

  it('signs in with a connection key from desktop clients', async () => {
    const { response, body } = await login({ 'X-OpenPOS-Connection': aldo.key }, 'owner@aldo.test')
    expect(response.status).toBe(200)
    expect(body.store.slug).toBe('aldo')
  })

  it('rejects protected calls without a valid session', async () => {
    const missing = await app.request('/api/settings', { headers: { Host: 'demo.openpos.xyz' } })
    expect(missing.status).toBe(401)
    const invalid = await app.request('/api/settings', {
      headers: { Host: 'demo.openpos.xyz', Authorization: 'Bearer nope' },
    })
    expect(invalid.status).toBe(401)
  })

  it('rejects sessions whose store no longer exists', async () => {
    const { body } = await login({ Host: 'aldo.openpos.xyz' }, 'owner@aldo.test')
    await plane.updateStore(aldo.id, { status: 'disabled' })
    clearStoreCache()
    try {
      const response = await app.request('/api/settings', { headers: { Authorization: `Bearer ${body.token}` } })
      expect(response.status).toBe(404)
    } finally {
      await plane.updateStore(aldo.id, { status: 'active' })
    }
  })

  it('serves public store data by host', async () => {
    const users = await app.request('/api/auth/users', { headers: { Host: 'aldo.openpos.xyz' } })
    const body = (await users.json()) as { users: Array<{ email: string }> }
    expect(body.users.map((user) => user.email)).toEqual(['owner@aldo.test'])

    const settings = await app.request('/api/settings/public', { headers: { Host: 'aldo.openpos.xyz' } })
    expect(((await settings.json()) as { name: string }).name).toBe('Aldo')
  })
})
