import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptSecret, encryptSecret } from '../lib/password-reset-email'

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

describe('password reset email settings', () => {
  beforeEach(() => {
    authRole.value = 'admin'
    authPermissions.value = ['*']
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 })
  })

  it('rejects non-admin configuration access', async () => {
    authRole.value = 'manager'
    authPermissions.value = []

    const response = await createApp().request('/api/settings/password-reset')

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Insufficient permissions' })
  })

  it('returns safe configuration status without exposing the API key', async () => {
    query.mockResolvedValue([
      {
        id: 1,
        resend_api_key_encrypted: encryptSecret('re_secret'),
        from_email: 'no-reply@example.com',
        web_app_url: 'https://pos.example.com',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-02T00:00:00.000Z',
      },
    ])

    const response = await createApp().request('/api/settings/password-reset')

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      settings: {
        configured: true,
        fromEmail: 'no-reply@example.com',
        webAppUrl: 'https://pos.example.com',
        updatedAt: '2025-01-02T00:00:00.000Z',
      },
    })
    expect(JSON.stringify(body)).not.toContain('re_secret')
  })

  it('encrypts the Resend API key before saving it', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 1,
        resend_api_key_encrypted: 'encrypted-value',
        from_email: 'no-reply@example.com',
        web_app_url: 'https://pos.example.com',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      },
    ])

    const response = await createApp().request('/api/settings/password-reset', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resendApiKey: 're_secret',
        fromEmail: 'no-reply@example.com',
        webAppUrl: 'https://pos.example.com',
      }),
    })

    expect(response.status).toBe(200)
    const savedParams = execute.mock.calls[0]?.[1] as unknown[]
    expect(savedParams[0]).not.toBe('re_secret')
    expect(decryptSecret(savedParams[0] as string)).toBe('re_secret')
    expect(savedParams[1]).toBe('no-reply@example.com')
    expect(savedParams[2]).toBe('https://pos.example.com')
  })

  it('keeps the existing encrypted key when the key field is blank', async () => {
    const encrypted = encryptSecret('existing_key')
    query
      .mockResolvedValueOnce([
        {
          id: 1,
          resend_api_key_encrypted: encrypted,
          from_email: 'old@example.com',
          web_app_url: null,
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 1,
          resend_api_key_encrypted: encrypted,
          from_email: 'new@example.com',
          web_app_url: null,
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-02T00:00:00.000Z',
        },
      ])

    const response = await createApp().request('/api/settings/password-reset', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromEmail: 'new@example.com' }),
    })

    expect(response.status).toBe(200)
    expect((execute.mock.calls[0]?.[1] as unknown[] | undefined)?.[0]).toBe(encrypted)
  })

  it('rejects an invalid sender email', async () => {
    query.mockResolvedValue([])

    const response = await createApp().request('/api/settings/password-reset', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resendApiKey: 're_secret', fromEmail: 'invalid' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'A valid from email is required' })
  })

  it('clears the configuration', async () => {
    const response = await createApp().request('/api/settings/password-reset', { method: 'DELETE' })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(execute.mock.calls[0]?.[0]).toContain('DELETE FROM password_reset_settings')
  })

  it('returns object storage status without exposing credentials', async () => {
    query.mockResolvedValue([
      {
        id: 1,
        endpoint: 'https://account.r2.cloudflarestorage.com',
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
        endpoint: 'https://account.r2.cloudflarestorage.com',
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
        endpoint: 'https://account.r2.cloudflarestorage.com',
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
        endpoint: 'https://account.r2.cloudflarestorage.com/',
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
    expect(savedParams[0]).toBe('https://account.r2.cloudflarestorage.com')
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
