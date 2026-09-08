import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { applyLocalMigrations, generateConnectionKey } from '@openpos/data'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const connectionsDir = mkdtempSync(join(tmpdir(), 'openpos-api-connections-'))
const importDirs: string[] = []
const originalTursoDatabaseUrl = process.env.TURSO_DATABASE_URL
const originalTursoAuthToken = process.env.TURSO_AUTH_TOKEN

process.env.JWT_SECRET = 'connection-test-secret-connection-test-secret'
process.env.OPENPOS_CONNECTIONS_DIR = connectionsDir

const { app } = await import('../index')

const adminPassword = 'Admin123!'

function createMigratedDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'openpos-import-'))
  importDirs.push(dir)
  const dbPath = join(dir, 'store.sqlite')
  const database = new DatabaseSync(dbPath)
  applyLocalMigrations(database)
  return { dbPath, database }
}

afterEach(() => {
  rmSync(connectionsDir, { recursive: true, force: true })
  for (const dir of importDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  if (originalTursoDatabaseUrl === undefined) delete process.env.TURSO_DATABASE_URL
  else process.env.TURSO_DATABASE_URL = originalTursoDatabaseUrl
  if (originalTursoAuthToken === undefined) delete process.env.TURSO_AUTH_TOKEN
  else process.env.TURSO_AUTH_TOKEN = originalTursoAuthToken
})

describe('connection routes', () => {
  beforeEach(() => {
    rmSync(connectionsDir, { recursive: true, force: true })
    delete process.env.TURSO_DATABASE_URL
    delete process.env.TURSO_AUTH_TOKEN
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

  it('rejects an empty database import without an owner', async () => {
    const { dbPath, database } = createMigratedDatabase()
    const userCount = database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }
    expect(userCount.count).toBe(0)
    database.close()

    const response = await app.request('/api/connections/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `file:${dbPath}`,
        authToken: '',
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'owner_required_for_empty_database' })
  })

  it('imports an empty database when an owner is provided', async () => {
    const { dbPath, database } = createMigratedDatabase()
    database.close()

    const response = await app.request('/api/connections/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `file:${dbPath}`,
        authToken: '',
        storeName: 'Harbor Shop',
        adminName: 'Ada Admin',
        adminEmail: 'ada@example.com',
        adminPassword,
      }),
    })

    expect(response.status).toBe(201)
    const imported = (await response.json()) as { key: string; storeName: string; seed: string }
    expect(imported.storeName).toBe('Harbor Shop')
    expect(imported.key.startsWith('OPK_')).toBe(true)
    expect(imported.seed.startsWith('OPS_')).toBe(true)

    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenPOS-Connection': imported.key,
      },
      body: JSON.stringify({
        email: 'ada@example.com',
        password: adminPassword,
      }),
    })

    expect(loginResponse.status).toBe(200)
    const login = (await loginResponse.json()) as { user: { email: string; role: string } }
    expect(login.user).toMatchObject({ email: 'ada@example.com', role: 'admin' })
  })

  it('recovers the assigned database from API configuration after registry loss', async () => {
    const { dbPath, database } = createMigratedDatabase()
    database.close()

    const importResponse = await app.request('/api/connections/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `file:${dbPath}`,
        authToken: '',
        storeName: 'Durable Shop',
        adminName: 'Ada Admin',
        adminEmail: 'ada@example.com',
        adminPassword,
      }),
    })
    const imported = (await importResponse.json()) as { key: string }

    rmSync(connectionsDir, { recursive: true, force: true })
    process.env.TURSO_DATABASE_URL = `file:${dbPath}`

    const assignedResponse = await app.request('/api/connections/assigned')
    expect(assignedResponse.status).toBe(200)
    expect(await assignedResponse.json()).toEqual({
      key: imported.key,
      storeName: 'Durable Shop',
      published: false,
    })

    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', password: adminPassword }),
    })
    expect(loginResponse.status).toBe(200)
  })

  it('imports a database that already has users without requiring an owner', async () => {
    const { dbPath, database } = createMigratedDatabase()
    database
      .prepare(
        `INSERT INTO users (email, password, name, role, permissions, created_at, password_hashed)
         VALUES (?, ?, ?, 'admin', ?, ?, 0)`,
      )
      .run('existing@example.com', adminPassword, 'Existing Owner', '["*"]', '2026-08-19T00:00:00.000Z')
    database.close()

    const response = await app.request('/api/connections/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `file:${dbPath}`,
        authToken: '',
      }),
    })

    expect(response.status).toBe(201)
    const imported = (await response.json()) as { key: string; storeName: string }
    expect(imported.storeName).toBe('OpenPOS')

    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenPOS-Connection': imported.key,
      },
      body: JSON.stringify({
        email: 'existing@example.com',
        password: adminPassword,
      }),
    })

    expect(loginResponse.status).toBe(200)
    const login = (await loginResponse.json()) as { user: { email: string } }
    expect(login.user.email).toBe('existing@example.com')
  })

  it('registers a desktop store key so login can find the store', async () => {
    const key = generateConnectionKey()
    const loginHeaders = {
      'Content-Type': 'application/json',
      'X-OpenPOS-Connection': key,
    }

    const autoLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: loginHeaders,
      body: JSON.stringify({
        email: 'ada@example.com',
        password: adminPassword,
      }),
    })
    expect(autoLogin.status).toBe(200)
    const firstLogin = (await autoLogin.json()) as { user: { email: string; name: string } }
    expect(firstLogin.user.email).toBe('ada@example.com')

    const registerResponse = await app.request('/api/connections/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key,
        storeName: 'Corner Shop',
        adminName: 'Ada Admin',
        adminEmail: 'ada@example.com',
        adminPassword,
      }),
    })
    expect(registerResponse.status).toBe(200)
    expect(await registerResponse.json()).toMatchObject({
      key,
      storeName: 'OpenPOS',
      published: false,
    })

    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: loginHeaders,
      body: JSON.stringify({
        email: 'ada@example.com',
        password: adminPassword,
      }),
    })
    expect(loginResponse.status).toBe(200)
    const login = (await loginResponse.json()) as { user: { email: string } }
    expect(login.user.email).toBe('ada@example.com')

    const again = await app.request('/api/connections/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
    expect(again.status).toBe(200)
    expect(await again.json()).toMatchObject({ key, storeName: 'OpenPOS' })
  })

  it('assigns the created store so web clients can use the API without a key', async () => {
    const missing = await app.request('/api/connections/assigned')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'connection_not_found' })

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
    const created = (await createResponse.json()) as { key: string }

    const assignedResponse = await app.request('/api/connections/assigned')
    expect(assignedResponse.status).toBe(200)
    expect(await assignedResponse.json()).toMatchObject({
      key: created.key,
      storeName: 'Corner Shop',
      published: false,
    })

    const loginResponse = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ada@example.com',
        password: adminPassword,
      }),
    })
    expect(loginResponse.status).toBe(200)
    const login = (await loginResponse.json()) as { user: { email: string } }
    expect(login.user.email).toBe('ada@example.com')

    const publicSettings = await app.request('/api/settings/public')
    expect(publicSettings.status).toBe(200)
    expect(await publicSettings.json()).toMatchObject({ name: 'Corner Shop' })

    const dbStatus = await app.request('/api/db-status')
    expect(dbStatus.status).toBe(200)
    expect(await dbStatus.json()).toMatchObject({
      status: 'remote',
      mode: 'api',
      remoteConfigured: true,
    })
  })

  it('rejects an invalid key when registering a store', async () => {
    const response = await app.request('/api/connections/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'not-a-key',
        storeName: 'Corner Shop',
        adminName: 'Ada Admin',
        adminEmail: 'ada@example.com',
        adminPassword,
      }),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_connection_key' })
  })
})
