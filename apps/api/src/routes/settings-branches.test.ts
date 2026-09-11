import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET = 'settings-test-secret-settings-test-secret'

const { applyRemoteToConnection, execute, query, mockJwtPayload } = vi.hoisted(() => ({
  applyRemoteToConnection: vi.fn(async () => ({ published: false, key: 'OPK_k', storeName: 'Shop' })),
  execute: vi.fn(async (_sql: string, _params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }> => ({
    lastInsertId: 1,
    rowsAffected: 1,
  })),
  query: vi.fn(
    async (_sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> => [],
  ),
  mockJwtPayload: {
    value: { role: 'admin', permissions: [], connectionKey: 'OPK_k' } as {
      role: string
      permissions: string[]
      connectionKey?: string
    },
  },
}))

vi.mock('../lib/connection.js', () => ({
  applyRemoteToConnection,
  parsePlatformConfig: ({ apiToken, org, group }: { apiToken?: string; org?: string; group?: string }) =>
    apiToken && org && group ? { apiToken, org, group } : null,
}))

vi.mock('../lib/object-storage.js', () => ({
  DEFAULT_SIGNED_URL_TTL_SECONDS: 900,
}))

vi.mock('../lib/turso.js', () => ({
  execute,
  query,
}))

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('jwtPayload', mockJwtPayload.value)
    await next()
  },
}))

const { settingsRouter } = await import('./settings.js')
const { encryptSecret } = await import('../lib/secrets.js')

function createApp() {
  const app = new Hono()
  app.route('/api/settings', settingsRouter)
  return app
}

function dbObjectStorage(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    endpoint: 'https://s3.example.com',
    region: 'auto',
    bucket: 'bkt',
    access_key_id_encrypted: 'encA',
    secret_access_key_encrypted: 'encS',
    url_ttl_seconds: 300,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function dbDatabase(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    database_url: 'libsql://x',
    auth_token_encrypted: 'encT',
    api_token_encrypted: null,
    org: null,
    group_name: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function dbCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Shop',
    app_name: 'App',
    description: 'd',
    tax_enabled: 1,
    tax_percentage: 15,
    currency_symbol: '$',
    language: 'en',
    logo_url: null,
    address: null,
    phone: null,
    email: null,
    website: null,
    receipt_footer: null,
    theme_mode: 'dark',
    theme_palette: 'blue',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const jsonHeaders = { 'Content-Type': 'application/json' }
const adminPayload = { role: 'admin', permissions: [], connectionKey: 'OPK_k' }
const starPayload = { role: 'user', permissions: ['*'] }
const plainPayload = { role: 'user', permissions: [] }

describe('settingsRouter branches', () => {
  beforeEach(() => {
    applyRemoteToConnection.mockReset()
    execute.mockReset()
    query.mockReset()
    applyRemoteToConnection.mockResolvedValue({ published: false, key: 'OPK_k', storeName: 'Shop' })
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 })
    query.mockResolvedValue([])
    mockJwtPayload.value = { ...adminPayload }
  })

  it('404s public settings when no row exists', async () => {
    const res = await createApp().request('/api/settings/public')
    expect(res.status).toBe(404)
  })

  it('enforces admin-or-star on object-storage writes', async () => {
    const app = createApp()
    mockJwtPayload.value = { ...plainPayload }

    const putDenied = await app.request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(putDenied.status).toBe(403)

    const deleteDenied = await app.request('/api/settings/object-storage', { method: 'DELETE' })
    expect(deleteDenied.status).toBe(403)

    mockJwtPayload.value = { ...starPayload }
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([dbObjectStorage()])
    const putAllowed = await app.request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({
        endpoint: 'https://s3.example.com',
        bucket: 'bkt',
        accessKeyId: 'a',
        secretAccessKey: 'b',
      }),
    })
    expect(putAllowed.status).toBe(200)

    mockJwtPayload.value = { ...adminPayload }
    const deleted = await app.request('/api/settings/object-storage', { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    expect(await deleted.json()).toEqual({ success: true })
    expect((execute.mock.calls.at(-1) as [string])[0]).toContain('DELETE FROM object_storage_settings')
  })

  it('enforces admin-or-star on database settings', async () => {
    const app = createApp()
    mockJwtPayload.value = { ...plainPayload }

    expect((await app.request('/api/settings/database')).status).toBe(403)
    expect(
      (
        await app.request('/api/settings/database', {
          method: 'PUT',
          headers: jsonHeaders,
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(403)
    expect((await app.request('/api/settings/database', { method: 'DELETE' })).status).toBe(403)

    mockJwtPayload.value = { ...adminPayload }
    query.mockResolvedValueOnce([dbDatabase()])
    const found = await app.request('/api/settings/database')
    expect(found.status).toBe(200)
    expect(((await found.json()) as { settings: { configured: boolean } }).settings.configured).toBe(true)

    mockJwtPayload.value = { ...starPayload }
    query.mockReset()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const saved = await app.request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ databaseUrl: 'libsql://x' }),
    })
    expect(saved.status).toBe(200)
    expect(applyRemoteToConnection).not.toHaveBeenCalled()

    query.mockReset()
    query.mockResolvedValueOnce([])
    const empty = await app.request('/api/settings/database')
    expect(empty.status).toBe(200)
    expect(((await empty.json()) as { settings: { configured: boolean } }).settings.configured).toBe(false)

    const deleted = await app.request('/api/settings/database', { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    expect(await deleted.json()).toEqual({ success: true })
  })

  it('validates object-storage body shapes', async () => {
    const app = createApp()

    const badJson = await app.request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: '{nope',
    })
    expect(badJson.status).toBe(400)

    const nullBody = await app.request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: 'null',
    })
    expect(nullBody.status).toBe(400)

    const nonString = await app.request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ endpoint: 123 }),
    })
    expect(nonString.status).toBe(400)
    expect(await nonString.json()).toEqual({ error: 'endpoint must be a string' })

    const nonIntegerTtl = await app.request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ urlTtlSeconds: 1.5 }),
    })
    expect(nonIntegerTtl.status).toBe(400)
  })

  it('rejects invalid object-storage endpoints', async () => {
    const app = createApp()
    const base = { bucket: 'bkt', region: 'auto', accessKeyId: 'a', secretAccessKey: 'b', urlTtlSeconds: 60 }

    for (const [endpoint, error] of [
      [undefined, 'S3 endpoint is required'],
      ['notaurl', 'S3 endpoint must be a valid URL'],
      ['ftp://x.com', 'S3 endpoint must use http or https'],
      ['https://s3.example.com?x=1', 'S3 endpoint must not include credentials, query parameters, or a hash'],
    ] as Array<[string | undefined, string]>) {
      const res = await app.request('/api/settings/object-storage', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify(endpoint === undefined ? base : { ...base, endpoint }),
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error })
    }
  })

  it('requires HTTPS endpoints in production', async () => {
    const app = createApp()
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const insecure = await app.request('/api/settings/object-storage', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({
          endpoint: 'http://s3.example.com',
          bucket: 'bkt',
          accessKeyId: 'a',
          secretAccessKey: 'b',
        }),
      })
      expect(insecure.status).toBe(400)
      expect(await insecure.json()).toEqual({ error: 'S3 endpoint must use HTTPS in production' })

      query.mockResolvedValueOnce([]).mockResolvedValueOnce([dbObjectStorage()])
      const secure = await app.request('/api/settings/object-storage', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({
          endpoint: 'https://s3.example.com',
          bucket: 'bkt',
          accessKeyId: 'a',
          secretAccessKey: 'b',
        }),
      })
      expect(secure.status).toBe(200)
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalNodeEnv
    }

    query.mockReset()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([dbObjectStorage()])
    const devHttp = await app.request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({
        endpoint: 'http://s3.example.com',
        bucket: 'bkt',
        accessKeyId: 'a',
        secretAccessKey: 'b',
      }),
    })
    expect(devHttp.status).toBe(200)
  })

  it('rejects invalid object-storage fields', async () => {
    const app = createApp()
    const base = { endpoint: 'https://s3.example.com', region: 'auto', accessKeyId: 'a', secretAccessKey: 'b' }

    const noBucket = await app.request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify(base),
    })
    expect(noBucket.status).toBe(400)
    expect(await noBucket.json()).toEqual({ error: 'S3 bucket is required' })

    const badBucket = await app.request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ ...base, bucket: 'my bucket' }),
    })
    expect(badBucket.status).toBe(400)

    const badRegion = await app.request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ ...base, bucket: 'bkt', region: 'a b' }),
    })
    expect(badRegion.status).toBe(400)

    const badTtl = await app.request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ ...base, bucket: 'bkt', urlTtlSeconds: 0 }),
    })
    expect(badTtl.status).toBe(400)

    const noKeys = await app.request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ endpoint: 'https://s3.example.com', bucket: 'bkt' }),
    })
    expect(noKeys.status).toBe(400)
    expect(await noKeys.json()).toEqual({ error: 'S3 access key ID and secret access key are required' })
  })

  it('merges object-storage updates with existing values', async () => {
    query.mockResolvedValueOnce([dbObjectStorage()]).mockResolvedValueOnce([dbObjectStorage()])
    const res = await createApp().request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(200)
    const [sql, params] = execute.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('UPDATE object_storage_settings')
    expect(params.slice(0, 6)).toEqual(['https://s3.example.com', 'auto', 'bkt', 'encA', 'encS', 300])
  })

  it('reads empty object-storage settings as unconfigured', async () => {
    query.mockResolvedValueOnce([])
    const res = await createApp().request('/api/settings/object-storage')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      settings: {
        configured: false,
        endpoint: null,
        region: 'auto',
        bucket: null,
        urlTtlSeconds: 900,
        updatedAt: null,
      },
    })
  })

  it('defaults a blank provided region to auto', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([dbObjectStorage()])
    const res = await createApp().request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({
        endpoint: 'https://s3.example.com',
        bucket: 'bkt',
        region: '  ',
        accessKeyId: 'a',
        secretAccessKey: 'b',
      }),
    })
    expect(res.status).toBe(200)
    expect((execute.mock.calls[0][1] as unknown[])[1]).toBe('auto')
  })

  it('defaults the signed URL TTL when existing is null', async () => {
    query.mockResolvedValueOnce([dbObjectStorage({ url_ttl_seconds: null })]).mockResolvedValueOnce([dbObjectStorage()])
    const res = await createApp().request('/api/settings/object-storage', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(200)
    expect((execute.mock.calls[0][1] as unknown[])[5]).toBe(900)
  })

  it('validates database body shapes', async () => {
    const app = createApp()

    const badJson = await app.request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: '{nope',
    })
    expect(badJson.status).toBe(400)

    const nullBody = await app.request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: 'null',
    })
    expect(nullBody.status).toBe(400)

    const nonString = await app.request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ databaseUrl: 123 }),
    })
    expect(nonString.status).toBe(400)
    expect(await nonString.json()).toEqual({ error: 'databaseUrl must be a string' })

    const nonBooleanPublish = await app.request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ publish: 'yes' }),
    })
    expect(nonBooleanPublish.status).toBe(400)
    expect(await nonBooleanPublish.json()).toEqual({ error: 'publish must be a boolean' })
  })

  it('requires the full Turso trio and saves without binding', async () => {
    const app = createApp()

    const partial = await app.request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ org: 'o' }),
    })
    expect(partial.status).toBe(400)
    expect(await partial.json()).toEqual({ error: 'Turso API token, org, and group are all required' })

    query.mockReset()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([dbDatabase({ database_url: null, auth_token_encrypted: null, api_token_encrypted: 'enc', org: 'o', group_name: 'g' })])
    const saved = await app.request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ org: 'o', group: 'g', apiToken: 't' }),
    })
    expect(saved.status).toBe(200)
    expect(applyRemoteToConnection).not.toHaveBeenCalled()
    const body = (await saved.json()) as { settings: { configured: boolean; hostedProvisioning: boolean } }
    expect(body.settings.configured).toBe(false)
    expect(body.settings.hostedProvisioning).toBe(true)
  })

  it('updates database settings and binds the connection url', async () => {
    query
      .mockResolvedValueOnce([dbDatabase()])
      .mockResolvedValueOnce([dbDatabase({ database_url: 'libsql://new', auth_token_encrypted: 'enc-new' })])
    const res = await createApp().request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ databaseUrl: 'libsql://new', authToken: 'tok' }),
    })

    expect(res.status).toBe(200)
    const [sql] = execute.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('UPDATE database_settings')
    expect(applyRemoteToConnection).toHaveBeenCalledWith('OPK_k', {
      url: 'libsql://new',
      authToken: 'tok',
      platform: undefined,
    })
    const body = (await res.json()) as { settings: { configured: boolean }; connection: { key: string } }
    expect(body.settings.configured).toBe(true)
    expect(body.connection.key).toBe('OPK_k')
  })

  it('updates database settings with a null url', async () => {
    query
      .mockResolvedValueOnce([dbDatabase({ database_url: null, auth_token_encrypted: null })])
      .mockResolvedValueOnce([dbDatabase({ database_url: null, auth_token_encrypted: null })])
    const res = await createApp().request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(200)
    const [sql, params] = execute.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('UPDATE database_settings')
    expect((params as unknown[])[0]).toBeNull()
    expect(applyRemoteToConnection).not.toHaveBeenCalled()
  })

  it('inserts null database settings and binds publish-only', async () => {
    applyRemoteToConnection.mockResolvedValueOnce({ published: true, key: 'OPK_k', storeName: 'Shop' })
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const res = await createApp().request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ publish: true }),
    })

    expect(res.status).toBe(200)
    const [sql, params] = execute.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('INSERT INTO database_settings')
    expect(params.slice(0, 5)).toEqual([null, null, null, null, null])
    expect(applyRemoteToConnection).toHaveBeenCalledWith('OPK_k', {
      url: undefined,
      authToken: undefined,
      platform: null,
    })
    const body = (await res.json()) as { settings: { configured: boolean } }
    expect(body.settings.configured).toBe(true)
  })

  it('decrypts stored tokens when binding', async () => {
    query
      .mockResolvedValueOnce([
        dbDatabase({
          auth_token_encrypted: encryptSecret('old-auth'),
          api_token_encrypted: encryptSecret('old-api'),
          org: 'o',
          group_name: 'g',
        }),
      ])
      .mockResolvedValueOnce([dbDatabase()])
    const res = await createApp().request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ databaseUrl: 'libsql://x' }),
    })

    expect(res.status).toBe(200)
    expect(applyRemoteToConnection).toHaveBeenCalledWith('OPK_k', {
      url: 'libsql://x',
      authToken: 'old-auth',
      platform: undefined,
    })
  })

  it('binds without tokens when none are stored', async () => {
    query
      .mockResolvedValueOnce([dbDatabase({ auth_token_encrypted: null, api_token_encrypted: null })])
      .mockResolvedValueOnce([dbDatabase({ auth_token_encrypted: null })])
    const res = await createApp().request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ databaseUrl: 'libsql://x' }),
    })

    expect(res.status).toBe(200)
    expect(applyRemoteToConnection).toHaveBeenCalledWith('OPK_k', {
      url: 'libsql://x',
      authToken: undefined,
      platform: undefined,
    })
  })

  it('maps database bind failures', async () => {
    const app = createApp()

    applyRemoteToConnection.mockRejectedValueOnce(new Error('bad'))
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const failed = await app.request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ databaseUrl: 'libsql://x' }),
    })
    expect(failed.status).toBe(400)
    expect(await failed.json()).toEqual({ error: 'bad' })

    applyRemoteToConnection.mockRejectedValueOnce('boom')
    query.mockReset()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const nonError = await app.request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ databaseUrl: 'libsql://x' }),
    })
    expect(nonError.status).toBe(400)
    expect(await nonError.json()).toEqual({ error: 'Unable to apply database settings' })
  })

  it('skips binding without a url or connection key', async () => {
    const app = createApp()

    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const noUrl = await app.request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(noUrl.status).toBe(200)
    expect(applyRemoteToConnection).not.toHaveBeenCalled()

    mockJwtPayload.value = { role: 'admin', permissions: [] }
    query.mockReset()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const noKey = await app.request('/api/settings/database', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ databaseUrl: 'libsql://x' }),
    })
    expect(noKey.status).toBe(200)
    expect(applyRemoteToConnection).not.toHaveBeenCalled()
  })

  it('gets company settings or 404s', async () => {
    const app = createApp()

    query.mockResolvedValueOnce([])
    const missing = await app.request('/api/settings')
    expect(missing.status).toBe(404)

    query.mockReset()
    query.mockResolvedValueOnce([dbCompany()])
    const found = await app.request('/api/settings')
    expect(found.status).toBe(200)
    const body = (await found.json()) as {
      settings: { id: string; taxEnabled: boolean; taxPercentage: number; themeMode: string }
    }
    expect(body.settings.id).toBe('1')
    expect(body.settings.taxEnabled).toBe(true)
    expect(body.settings.taxPercentage).toBe(15)
    expect(body.settings.themeMode).toBe('dark')
  })

  it('inserts company settings with defaults', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([dbCompany()])
    const res = await createApp().request('/api/settings', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(200)
    const [sql, params] = execute.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('INSERT INTO company_settings')
    expect(params.slice(0, 13)).toEqual(['My Store', null, null, 0, 0, '$', 'en', null, null, null, null, null, null])
  })

  it('inserts company settings with values', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([dbCompany()])
    const res = await createApp().request('/api/settings', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({
        name: 'Corner',
        app_name: 'POS',
        description: 'shop',
        tax_enabled: 1,
        tax_percentage: 8,
        currency_symbol: '€',
        language: 'es',
        logo_url: 'l',
        address: 'a',
        phone: 'p',
        email: 'e',
        website: 'w',
        receipt_footer: 'f',
      }),
    })

    expect(res.status).toBe(200)
    const params = execute.mock.calls[0][1] as unknown[]
    expect(params.slice(0, 13)).toEqual(['Corner', 'POS', 'shop', 1, 8, '€', 'es', 'l', 'a', 'p', 'e', 'w', 'f'])
  })

  it('updates company settings with values or nulls', async () => {
    const app = createApp()

    query.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([dbCompany()])
    const full = await app.request('/api/settings', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({
        name: 'Corner',
        app_name: 'POS',
        description: 'shop',
        tax_enabled: 1,
        tax_percentage: 8,
        currency_symbol: '€',
        language: 'es',
        logo_url: 'l',
        address: 'a',
        phone: 'p',
        email: 'e',
        website: 'w',
        receipt_footer: 'f',
      }),
    })
    expect(full.status).toBe(200)
    const [sql, params] = execute.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('UPDATE company_settings')
    expect(params.slice(0, 13)).toEqual(['Corner', 'POS', 'shop', 1, 8, '€', 'es', 'l', 'a', 'p', 'e', 'w', 'f'])
    expect(params.at(-1)).toBe(1)

    query.mockReset()
    query.mockResolvedValueOnce([{ id: 2 }]).mockResolvedValueOnce([dbCompany()])
    const empty = await app.request('/api/settings', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    })
    expect(empty.status).toBe(200)
    const emptyParams = execute.mock.calls[1][1] as unknown[]
    expect(emptyParams.slice(0, 13)).toEqual(new Array(13).fill(null))
    expect(emptyParams.at(-1)).toBe(2)
  })
})
