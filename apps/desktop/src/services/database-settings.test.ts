import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestApiJson, execute, query, encryptSecret, decryptSecret, getActive, applyRemote } = vi.hoisted(() => ({
  requestApiJson: vi.fn(async () => ({})),
  execute: vi.fn(async (_sql: string, _params: unknown[] = []) => ({ lastInsertId: 0, rowsAffected: 1 })),
  query: vi.fn(async (_sql: string, _params: unknown[] = []): Promise<Array<Record<string, unknown>>> => []),
  encryptSecret: vi.fn(async (value: string) => `enc:${value}`),
  decryptSecret: vi.fn(async (value: string) => `dec:${value}`),
  getActive: vi.fn(async (): Promise<{ key: string; storeName: string; published: boolean } | null> => null),
  applyRemote: vi.fn(async () => null),
}))

vi.mock('../lib/api-client', () => ({
  requestApiJson,
}))

vi.mock('../lib/db-adapter', () => ({
  execute,
  query,
}))

vi.mock('../lib/desktop', () => ({
  requireDesktopApi: vi.fn(() => ({
    encryptSecret,
    decryptSecret,
    connection: { getActive, applyRemote },
  })),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: true,
}))

const { databaseSettingsService } = await import('./database-settings')

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    database_url: 'libsql://db.turso.io',
    auth_token_encrypted: 'enc:auth',
    api_token_encrypted: 'enc:api',
    org: 'my-org',
    group_name: 'my-group',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('DatabaseSettingsService.getSettings desktop', () => {
  beforeEach(() => {
    query.mockReset()
    query.mockResolvedValue([])
  })

  it('maps a full row', async () => {
    query.mockResolvedValueOnce([dbRow()])

    await expect(databaseSettingsService.getSettings()).resolves.toEqual({
      configured: true,
      hostedProvisioning: true,
      databaseUrl: 'libsql://db.turso.io',
      org: 'my-org',
      group: 'my-group',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('reports unconfigured when no row exists', async () => {
    query.mockResolvedValueOnce([])

    await expect(databaseSettingsService.getSettings()).resolves.toEqual({
      configured: false,
      hostedProvisioning: false,
      databaseUrl: null,
      org: null,
      group: null,
      updatedAt: null,
    })
  })

  it('reports partial rows', async () => {
    query.mockReset()
    query.mockResolvedValueOnce([dbRow({ auth_token_encrypted: null, api_token_encrypted: null })])

    const withoutSecrets = await databaseSettingsService.getSettings()

    expect(withoutSecrets.configured).toBe(false)
    expect(withoutSecrets.hostedProvisioning).toBe(false)

    query.mockReset()
    query.mockResolvedValueOnce([
      dbRow({ database_url: null, auth_token_encrypted: null, org: null, group_name: null, updated_at: null }),
    ])

    const empty = await databaseSettingsService.getSettings()

    expect(empty).toMatchObject({ configured: false, databaseUrl: null, org: null, group: null, updatedAt: null })
  })

  it('propagates query failures', async () => {
    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(databaseSettingsService.getSettings()).rejects.toThrow('db down')
  })
})

describe('DatabaseSettingsService.saveSettings desktop', () => {
  beforeEach(() => {
    query.mockReset()
    execute.mockReset()
    encryptSecret.mockClear()
    decryptSecret.mockClear()
    getActive.mockClear()
    applyRemote.mockClear()
    getActive.mockResolvedValue(null)
    applyRemote.mockResolvedValue(null)
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('inserts fresh settings and applies the remote connection', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([dbRow()])
    getActive.mockResolvedValueOnce({ key: 'OPK_1', storeName: 'Tienda', published: true })

    const settings = await databaseSettingsService.saveSettings({
      databaseUrl: '  libsql://db.turso.io  ',
      authToken: 'auth',
      apiToken: 'api',
      org: ' my-org ',
      group: ' my-group ',
    })

    expect(settings.configured).toBe(true)
    expect(encryptSecret).toHaveBeenCalledWith('auth')
    expect(encryptSecret).toHaveBeenCalledWith('api')
    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain('INSERT INTO database_settings')
    expect(params).toContain('libsql://db.turso.io')
    expect(applyRemote).toHaveBeenCalledWith({
      key: 'OPK_1',
      published: true,
      dataPlane: { url: 'libsql://db.turso.io', authToken: 'auth' },
    })
  })

  it('updates existing settings reusing stored secrets', async () => {
    query.mockResolvedValueOnce([dbRow()]).mockResolvedValueOnce([dbRow({ database_url: 'libsql://new.turso.io' })])

    const settings = await databaseSettingsService.saveSettings({ databaseUrl: 'libsql://new.turso.io' })

    expect(settings.configured).toBe(true)
    expect(encryptSecret).not.toHaveBeenCalled()
    expect(decryptSecret).toHaveBeenCalledWith('enc:auth')
    const [sql] = execute.mock.calls[0]
    expect(sql).toContain('UPDATE database_settings')
    expect(applyRemote).toHaveBeenCalledWith({
      key: undefined,
      published: true,
      dataPlane: { url: 'libsql://new.turso.io', authToken: 'dec:enc:auth' },
    })
  })

  it('keeps existing url, org, and group when inputs are omitted', async () => {
    query.mockResolvedValueOnce([dbRow()]).mockResolvedValueOnce([dbRow()])

    await databaseSettingsService.saveSettings({ authToken: 'fresh' })

    const [, params] = execute.mock.calls[0]
    expect(params).toContain('libsql://db.turso.io')
    expect(params).toContain('my-org')
    expect(params).toContain('my-group')
  })

  it('stores nulls when nothing was entered or stored', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const settings = await databaseSettingsService.saveSettings({})

    expect(settings.configured).toBe(false)
    expect(applyRemote).not.toHaveBeenCalled()
    const [, params] = execute.mock.calls[0]
    expect(params).toContain(null)
  })

  it('requires org, group, and api token together', async () => {
    query.mockResolvedValue([])

    await expect(databaseSettingsService.saveSettings({ org: 'my-org' })).rejects.toThrow(
      'Turso API token, org, and group are all required',
    )
    await expect(databaseSettingsService.saveSettings({ group: 'my-group' })).rejects.toThrow(
      'Turso API token, org, and group are all required',
    )
    await expect(
      databaseSettingsService.saveSettings({ org: 'my-org', group: 'my-group', apiToken: 'api' }),
    ).resolves.toBeDefined()
  })

  it('accepts a stored api token when org and group are provided', async () => {
    query.mockResolvedValue([dbRow({ api_token_encrypted: 'enc:api' })])

    await expect(databaseSettingsService.saveSettings({ org: 'my-org', group: 'my-group' })).resolves.toBeDefined()
  })

  it('requires a database url and token before publishing', async () => {
    query.mockResolvedValue([])

    await expect(databaseSettingsService.saveSettings({ publish: true })).rejects.toThrow(
      'Save a Turso database URL and token, or import the database from the first-run screen.',
    )
  })

  it('publishes when a url is present even without a token', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([dbRow({ auth_token_encrypted: null })])

    await expect(
      databaseSettingsService.saveSettings({ databaseUrl: 'libsql://db.turso.io', publish: true }),
    ).resolves.toBeDefined()
    expect(applyRemote).not.toHaveBeenCalled()
  })

  it('treats blank tokens as missing', async () => {
    query.mockResolvedValueOnce([dbRow()]).mockResolvedValueOnce([dbRow()])

    await databaseSettingsService.saveSettings({ authToken: '   ', apiToken: '   ' })

    expect(encryptSecret).not.toHaveBeenCalled()
  })

  it('nulls a blank existing url on update', async () => {
    query.mockResolvedValueOnce([dbRow({ database_url: '' })]).mockResolvedValueOnce([dbRow({ database_url: '' })])

    await databaseSettingsService.saveSettings({})

    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain('UPDATE database_settings')
    expect(params).toEqual([null, 'enc:auth', 'enc:api', 'my-org', 'my-group', expect.any(String)])
  })

  it('nulls blank existing org and group on update', async () => {
    const existing = dbRow({
      database_url: 'libsql://db.turso.io',
      auth_token_encrypted: null,
      api_token_encrypted: null,
      org: '',
      group_name: '',
    })
    query.mockResolvedValueOnce([existing]).mockResolvedValueOnce([existing])

    await databaseSettingsService.saveSettings({})

    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain('UPDATE database_settings')
    expect(params).toEqual(['libsql://db.turso.io', null, null, null, null, expect.any(String)])
    expect(applyRemote).not.toHaveBeenCalled()
  })
})

describe('DatabaseSettingsService.clearSettings desktop', () => {
  beforeEach(() => {
    execute.mockReset()
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
  })

  it('deletes the local row', async () => {
    await databaseSettingsService.clearSettings()

    expect(execute).toHaveBeenCalledWith('DELETE FROM database_settings WHERE id = 1')
    expect(requestApiJson).not.toHaveBeenCalled()
  })
})
