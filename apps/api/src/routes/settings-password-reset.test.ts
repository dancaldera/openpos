import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptSecret, encryptSecret } from '../lib/secrets'

const { authPermissions, authRole, execute, query } = vi.hoisted(() => ({
  authPermissions: { value: ['*'] as string[] },
  authRole: { value: 'admin' },
  execute: vi.fn(
    async (_sql: string, _params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }> => ({
      lastInsertId: 1,
      rowsAffected: 1,
    }),
  ),
  query: vi.fn(async (_sql: string, _params?: unknown[]): Promise<Array<Record<string, unknown>>> => []),
}))

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (c: unknown, next: () => Promise<void>) => {
    // biome-ignore lint/suspicious/noExplicitAny: test doubles Hono context
    ;(c as any).set('jwtPayload', {
      sub: '1',
      email: 'admin@example.com',
      name: 'Admin',
      role: authRole.value,
      permissions: authPermissions.value,
    })
    await next()
  },
}))

vi.mock('../lib/turso.js', () => ({
  execute,
  query,
}))

vi.mock('../lib/connection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/connection')>()
  return {
    ...actual,
    applyRemoteToConnection: vi.fn(),
  }
})

process.env.JWT_SECRET = 'password-reset-settings-test-secret'

const { settingsRouter } = await import('./settings')

function createApp() {
  const app = new Hono()
  app.route('/api/settings', settingsRouter)
  return app
}

describe('admin settings', () => {
  beforeEach(() => {
    authRole.value = 'admin'
    authPermissions.value = ['*']
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 })
  })

  it('rejects non-admin object storage access', async () => {
    authRole.value = 'manager'
    authPermissions.value = []

    const response = await createApp().request('/api/settings/object-storage')

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Insufficient permissions' })
  })

  it('returns object storage status without exposing credentials', async () => {
    query.mockResolvedValue([
      {
        id: 1,
        endpoint: 'https://t3.storageapi.dev',
        region: 'auto',
        bucket: 'product-images',
        access_key_id_encrypted: encryptSecret('access-key'),
        secret_access_key_encrypted: encryptSecret('secret-key'),
        url_ttl_seconds: 900,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-02T00:00:00.000Z',
      },
    ])

    const response = await createApp().request('/api/settings/object-storage')

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      settings: {
        configured: true,
        endpoint: 'https://t3.storageapi.dev',
        region: 'auto',
        bucket: 'product-images',
        urlTtlSeconds: 900,
        updatedAt: '2025-01-02T00:00:00.000Z',
      },
    })
    expect(JSON.stringify(body)).not.toContain('secret-key')
  })

  it('encrypts object storage credentials before saving them', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 1,
        endpoint: 'https://t3.storageapi.dev',
        region: 'auto',
        bucket: 'product-images',
        access_key_id_encrypted: 'encrypted-access-key',
        secret_access_key_encrypted: 'encrypted-secret-key',
        url_ttl_seconds: 900,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      },
    ])

    const response = await createApp().request('/api/settings/object-storage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'https://t3.storageapi.dev/',
        region: 'auto',
        bucket: 'product-images',
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
        urlTtlSeconds: 1800,
      }),
    })

    expect(response.status).toBe(200)
    const savedParams = execute.mock.calls[0]?.[1] as unknown[]
    expect(savedParams[3]).not.toBe('access-key')
    expect(savedParams[4]).not.toBe('secret-key')
    expect(decryptSecret(savedParams[3] as string)).toBe('access-key')
    expect(decryptSecret(savedParams[4] as string)).toBe('secret-key')
    expect(savedParams[0]).toBe('https://t3.storageapi.dev')
    expect(savedParams[5]).toBe(1800)
  })

  it('returns database settings without exposing tokens', async () => {
    query.mockResolvedValue([
      {
        id: 1,
        database_url: 'libsql://store.turso.io',
        auth_token_encrypted: encryptSecret('db-token'),
        api_token_encrypted: encryptSecret('platform-token'),
        org: 'acme',
        group_name: 'default',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-02T00:00:00.000Z',
      },
    ])

    const response = await createApp().request('/api/settings/database')

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      settings: {
        configured: true,
        hostedProvisioning: true,
        databaseUrl: 'libsql://store.turso.io',
        org: 'acme',
        group: 'default',
        updatedAt: '2025-01-02T00:00:00.000Z',
      },
    })
    expect(JSON.stringify(body)).not.toContain('db-token')
    expect(JSON.stringify(body)).not.toContain('platform-token')
  })

  it('encrypts database tokens before saving them', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 1,
        database_url: 'libsql://store.turso.io',
        auth_token_encrypted: 'encrypted-auth',
        api_token_encrypted: 'encrypted-api',
        org: 'acme',
        group_name: 'default',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      },
    ])

    const response = await createApp().request('/api/settings/database', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        databaseUrl: 'libsql://store.turso.io',
        authToken: 'db-token',
        apiToken: 'platform-token',
        org: 'acme',
        group: 'default',
      }),
    })

    expect(response.status).toBe(200)
    const savedParams = execute.mock.calls[0]?.[1] as unknown[]
    expect(savedParams[1]).not.toBe('db-token')
    expect(savedParams[2]).not.toBe('platform-token')
    expect(decryptSecret(savedParams[1] as string)).toBe('db-token')
    expect(decryptSecret(savedParams[2] as string)).toBe('platform-token')
    expect(savedParams[0]).toBe('libsql://store.turso.io')
    expect(savedParams[3]).toBe('acme')
    expect(savedParams[4]).toBe('default')
  })
})
