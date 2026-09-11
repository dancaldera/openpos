import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET = 'connection-hosted-secret-connection-hosted'

const { createDataPlaneClient, executeWithClient, fetchMock, probeDataPlane, query, queryWithClient, mockBcryptHash, mockApplyRemoteMigrations } =
  vi.hoisted(() => ({
    createDataPlaneClient: vi.fn((config: unknown) => ({ fakeClient: true, config })),
    executeWithClient: vi.fn(
      async (
        _client: unknown,
        _sql: string,
        _params?: unknown[],
      ): Promise<{ lastInsertId: number; rowsAffected: number } | undefined> => undefined,
    ),
    fetchMock: vi.fn(async (_url: string, _init?: { method?: string }): Promise<unknown> => {
      throw new Error('unexpected fetch')
    }),
    probeDataPlane: vi.fn(async () => true),
    query: vi.fn(async (_sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> => []),
    queryWithClient: vi.fn(
      async (_client: unknown, _sql: string, _params?: unknown[]): Promise<Record<string, unknown>[]> => [],
    ),
    mockBcryptHash: vi.fn(async (value: string) => `hashed:${value}`),
    mockApplyRemoteMigrations: vi.fn(async () => {}),
  }))

vi.mock('./turso.js', () => ({
  createDataPlaneClient,
  executeWithClient,
  probeDataPlane,
  query,
  queryWithClient,
}))

vi.mock('bcryptjs', () => ({
  default: { hash: mockBcryptHash },
}))

vi.mock('@openpos/data', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, applyRemoteMigrations: mockApplyRemoteMigrations }
})

vi.stubGlobal('fetch', fetchMock)

const connection = await import('./connection.js')
const { generateConnectionKey, generateConnectionSeed, hashConnectionSeed, hostedDatabaseName } =
  await import('@openpos/data')

interface Script {
  metaRows: Record<string, unknown>[]
  userCount: number
  countRows: Record<string, unknown>[] | null
  companyRows: Record<string, unknown>[]
  dbSettingsRows: Record<string, unknown>[]
  ambientRows: Record<string, unknown>[]
}

const script: Script = {
  metaRows: [],
  userCount: 0,
  countRows: null,
  companyRows: [],
  dbSettingsRows: [],
  ambientRows: [],
}

function resetScript() {
  script.metaRows = []
  script.userCount = 0
  script.countRows = null
  script.companyRows = []
  script.dbSettingsRows = []
  script.ambientRows = []
}

const tempDirs: string[] = []
let connectionsDir = ''
let fetchHandler: (url: string, init?: { method?: string }) => unknown = () => {
  throw new Error('unexpected fetch')
}

function registryPath() {
  return join(connectionsDir, 'registry.json')
}

function writeRegistry(connections: unknown[]) {
  writeFileSync(registryPath(), JSON.stringify({ connections }))
}

function readRegistry() {
  return JSON.parse(readFileSync(registryPath(), 'utf8')) as { connections: Array<Record<string, unknown>> }
}

function findExecuted(sqlPart: string) {
  return executeWithClient.mock.calls.filter(([, sql]) => String(sql).includes(sqlPart))
}

function jsonResponse(payload: unknown, opts: { ok?: boolean; status?: number; textReject?: boolean; textValue?: string } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? (opts.ok === false ? 500 : 200),
    json: async () => payload,
    text: opts.textReject
      ? async () => {
          throw new Error('no text')
        }
      : async () => opts.textValue ?? JSON.stringify(payload),
  }
}

const ownerInput = {
  storeName: 'Shop',
  adminName: 'Ada',
  adminEmail: 'ada@example.com',
  adminPassword: 'Str0ng!pass',
}

const platform = { apiToken: 'pt', org: 'o', group: 'g' }

beforeEach(() => {
  connectionsDir = mkdtempSync(join(tmpdir(), 'openpos-conn-hosted-'))
  tempDirs.push(connectionsDir)
  process.env.OPENPOS_CONNECTIONS_DIR = connectionsDir
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
  resetScript()
  fetchHandler = () => {
    throw new Error('unexpected fetch')
  }

  for (const fn of [
    createDataPlaneClient,
    executeWithClient,
    fetchMock,
    probeDataPlane,
    query,
    queryWithClient,
    mockBcryptHash,
    mockApplyRemoteMigrations,
  ]) {
    fn.mockReset()
  }
  createDataPlaneClient.mockImplementation((config: unknown) => ({ fakeClient: true, config }))
  executeWithClient.mockResolvedValue(undefined)
  fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => fetchHandler(url, init))
  probeDataPlane.mockResolvedValue(true)
  query.mockImplementation(async () => script.ambientRows)
  queryWithClient.mockImplementation(async (_client: unknown, sql: string) => {
    if (sql.includes('connection_meta')) return script.metaRows
    if (sql.includes('COUNT(*)')) return script.countRows ?? [{ count: script.userCount }]
    if (sql.includes('company_settings')) return script.companyRows
    if (sql.includes('database_settings')) return script.dbSettingsRows
    return []
  })
  mockBcryptHash.mockImplementation(async (value: string) => `hashed:${value}`)
  mockApplyRemoteMigrations.mockResolvedValue(undefined)
})

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  delete process.env.TURSO_DATABASE_URL
  delete process.env.TURSO_AUTH_TOKEN
})

describe('resolveDataPlane configured recovery', () => {
  it('recovers hosted and file planes from API configuration', async () => {
    const key = generateConnectionKey()
    process.env.TURSO_DATABASE_URL = 'libsql://configured.turso.io'
    process.env.TURSO_AUTH_TOKEN = 'tok'
    script.metaRows = [{ connection_key: key, store_name: 'C Shop' }]

    const hosted = await connection.resolveDataPlane(key)
    expect(hosted).toEqual({ url: 'libsql://configured.turso.io', authToken: 'tok' })
    expect(readRegistry().connections[0]).toMatchObject({ key, adapter: 'hosted', storeName: 'C Shop' })

    rmSync(registryPath(), { force: true })
    delete process.env.TURSO_AUTH_TOKEN
    process.env.TURSO_DATABASE_URL = 'file:/tmp/cfg.sqlite'
    const file = await connection.resolveDataPlane(key)
    expect(file).toEqual({ url: 'file:/tmp/cfg.sqlite', authToken: undefined })
    expect(readRegistry().connections[0]).toMatchObject({ adapter: 'file' })
  })

  it('ignores mismatched or missing configured keys', async () => {
    const key = generateConnectionKey()
    process.env.TURSO_DATABASE_URL = 'libsql://configured.turso.io'
    process.env.TURSO_AUTH_TOKEN = 'tok'

    script.metaRows = [{ connection_key: generateConnectionKey(), store_name: 'Other' }]
    await expect(connection.resolveDataPlane(key)).resolves.toBeNull()

    script.metaRows = []
    await expect(connection.resolveDataPlane(key)).resolves.toBeNull()
  })

  it('defaults blank recovered store names', async () => {
    const key = generateConnectionKey()
    process.env.TURSO_DATABASE_URL = 'libsql://configured.turso.io'
    process.env.TURSO_AUTH_TOKEN = 'tok'
    script.metaRows = [{ connection_key: key, store_name: '' }]

    await connection.resolveDataPlane(key)
    expect(readRegistry().connections[0].storeName).toBe('OpenPOS')
  })
})

describe('readAssignedConnection hosted recovery', () => {
  it('recovers a hosted plane and marks it published', async () => {
    const key = generateConnectionKey()
    process.env.TURSO_DATABASE_URL = 'libsql://rec.turso.io'
    process.env.TURSO_AUTH_TOKEN = 'tok'
    script.metaRows = [{ connection_key: key, store_name: 'Rec Shop' }]

    await expect(connection.readAssignedConnection()).resolves.toEqual({
      key,
      storeName: 'Rec Shop',
      published: true,
    })
    expect(readRegistry().connections[0]).toMatchObject({ adapter: 'hosted' })
  })
})

describe('readCurrentConnectionMeta', () => {
  it('returns null without a valid key', async () => {
    script.ambientRows = []
    await expect(connection.readCurrentConnectionMeta()).resolves.toBeNull()

    script.ambientRows = [{}]
    await expect(connection.readCurrentConnectionMeta()).resolves.toBeNull()

    script.ambientRows = [{ connection_key: 'bogus' }]
    await expect(connection.readCurrentConnectionMeta()).resolves.toBeNull()
  })

  it('returns the key and store name', async () => {
    const key = generateConnectionKey()
    script.ambientRows = [{ connection_key: key, store_name: '' }]
    await expect(connection.readCurrentConnectionMeta()).resolves.toEqual({ key, storeName: 'OpenPOS' })

    script.ambientRows = [{ connection_key: key, store_name: 'Named' }]
    await expect(connection.readCurrentConnectionMeta()).resolves.toEqual({ key, storeName: 'Named' })
  })
})

describe('joinConnection hosted', () => {
  it('joins a hosted plane and defaults the store name', async () => {
    const key = generateConnectionKey()
    const seed = generateConnectionSeed()
    writeRegistry([{ key, adapter: 'hosted', url: 'libsql://db.turso.io', authToken: 't', storeName: 'X' }])
    script.metaRows = [{ connection_key: key, seed_verifier: hashConnectionSeed(seed), store_name: '' }]

    const result = await connection.joinConnection({ key, seed })
    expect(result).toMatchObject({ key, storeName: 'OpenPOS', published: true })
    expect(result.dataPlane).toEqual({ url: 'libsql://db.turso.io', authToken: 't' })
  })
})

describe('importRemoteConnection attach', () => {
  it('rejects unreachable databases', async () => {
    probeDataPlane.mockResolvedValueOnce(false)
    await expect(importRemote({})).rejects.toThrow('Unable to reach the database')
  })

  function importRemote(input: Record<string, unknown>) {
    return connection.importRemoteConnection({ url: 'file:/tmp/attach.sqlite', authToken: '', ...input })
  }

  it('attaches an empty database that already has a key', async () => {
    const metaKey = generateConnectionKey()
    script.userCount = 0
    script.metaRows = [{ connection_key: metaKey, seed_verifier: 'v', store_name: 'Old' }]

    const result = await importRemote({ ...ownerInput })
    expect(result.key).toBe(metaKey)
    expect(result.seed).toBeUndefined()
    expect(result.storeName).toBe('Shop')
    const writes = findExecuted('INSERT INTO connection_meta')
    expect(writes).toHaveLength(1)
    expect(writes[0][2]).toContain('v')
  })

  it('rejects invalid stored keys', async () => {
    script.metaRows = [{ connection_key: 'bogus', seed_verifier: 'v' }]

    script.userCount = 0
    await expect(importRemote({ ...ownerInput })).rejects.toThrow('invalid_connection_key')

    script.userCount = 1
    await expect(importRemote({})).rejects.toThrow('invalid_connection_key')
  })

  it('attaches a database with users and stored meta', async () => {
    const metaKey = generateConnectionKey()
    script.userCount = 1
    script.metaRows = [{ connection_key: metaKey, seed_verifier: 'v', store_name: 'Meta Shop' }]

    const result = await importRemote({})
    expect(result).toMatchObject({ key: metaKey, storeName: 'Meta Shop', published: false })
    expect(result.seed).toBeUndefined()

    script.metaRows = [{ connection_key: metaKey, seed_verifier: 'v', store_name: '' }]
    const blank = await importRemote({})
    expect(blank.storeName).toBe('OpenPOS')
  })

  it('names fresh attachments from the company row', async () => {
    script.userCount = 1
    script.companyRows = [{ name: 'Acme' }]

    const named = await importRemote({})
    expect(named.storeName).toBe('Acme')
    expect(named.seed).toMatch(/^OPS_/)

    script.companyRows = []
    const blank = await importRemote({})
    expect(blank.storeName).toBe('OpenPOS')
  })

  it('publishes hosted attachments', async () => {
    script.userCount = 1
    const result = await connection.importRemoteConnection({ url: 'libsql://h.turso.io', authToken: 't' })
    expect(result.published).toBe(true)
    expect(readRegistry().connections[0]).toMatchObject({ adapter: 'hosted' })
  })

  it('counts missing count rows as zero users', async () => {
    script.countRows = [{}]
    await expect(importRemote({})).rejects.toThrow('owner_required_for_empty_database')
  })

  it('updates existing database settings on attach', async () => {
    const metaKey = generateConnectionKey()
    script.userCount = 1
    script.metaRows = [{ connection_key: metaKey, seed_verifier: 'v', store_name: 'Meta' }]
    script.dbSettingsRows = [{ database_url: 'old', auth_token_encrypted: 'a', api_token_encrypted: null }]

    await importRemote({})
    const updates = findExecuted('UPDATE database_settings')
    expect(updates).toHaveLength(1)
  })
})

describe('registerConnection hosted', () => {
  it('requires a token and a reachable database', async () => {
    const key = generateConnectionKey()

    await expect(connection.registerConnection({ key, url: 'libsql://h.turso.io' })).rejects.toThrow(
      'Database auth token is required',
    )

    probeDataPlane.mockResolvedValueOnce(false)
    await expect(
      connection.registerConnection({ key, url: 'libsql://h.turso.io', authToken: 't' }),
    ).rejects.toThrow('Unable to reach the database')
  })

  it('registers hosted stores with meta, input, or default names', async () => {
    const key = generateConnectionKey()
    const input = { key, url: 'libsql://h.turso.io', authToken: 't' }

    script.metaRows = [{ store_name: 'Meta Shop' }]
    const fromMeta = await connection.registerConnection(input)
    expect(fromMeta).toMatchObject({ key, storeName: 'Meta Shop', published: true })
    expect(fromMeta.dataPlane).toEqual({ url: 'libsql://h.turso.io', authToken: 't' })
    expect(readRegistry().connections[0]).toMatchObject({ key, adapter: 'hosted' })

    script.metaRows = [{}]
    const fromInput = await connection.registerConnection({ ...input, storeName: '  In Shop ' })
    expect(fromInput.storeName).toBe('In Shop')

    script.metaRows = []
    const fallback = await connection.registerConnection(input)
    expect(fallback.storeName).toBe('OpenPOS')
  })
})

describe('registerConnection file path', () => {
  it('reuses an existing empty file plane', async () => {
    const key = generateConnectionKey()
    writeRegistry([{ key, adapter: 'file', url: 'file:/tmp/keep.sqlite', storeName: 'Old' }])
    script.userCount = 0

    const result = await connection.registerConnection({ key, ...ownerInput })
    expect(result.dataPlane.url).toBe('file:/tmp/keep.sqlite')
    expect(result.storeName).toBe('Shop')
    expect(result.published).toBe(false)
  })

  it('keeps the stored seed verifier and meta name', async () => {
    const key = generateConnectionKey()
    script.metaRows = [{ connection_key: key, seed_verifier: 'kept-v', store_name: 'Meta Shop' }]

    const result = await connection.registerConnection({
      key,
      adminName: 'Ada',
      adminEmail: 'ada@example.com',
      adminPassword: 'Str0ng!pass',
    })
    expect(result.storeName).toBe('Meta Shop')
    const writes = findExecuted('INSERT INTO connection_meta')
    expect(writes).toHaveLength(1)
    expect(writes[0][2]?.[1]).toBe('kept-v')
  })

  it('requires a store name from input or meta', async () => {
    await expect(
      connection.registerConnection({
        key: generateConnectionKey(),
        adminName: 'Ada',
        adminEmail: 'ada@example.com',
        adminPassword: 'Str0ng!pass',
      }),
    ).rejects.toThrow('Store name is required')
  })

  it('generates a fresh seed verifier for new stores', async () => {
    const result = await connection.registerConnection({ key: generateConnectionKey(), ...ownerInput })
    expect(result.storeName).toBe('Shop')
    const writes = findExecuted('INSERT INTO connection_meta')
    expect(writes).toHaveLength(1)
    expect(writes[0][2]?.[1]).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns existing stores with users', async () => {
    const key = generateConnectionKey()
    writeRegistry([{ key, adapter: 'file', url: 'file:/tmp/kept.sqlite', storeName: 'X' }])
    script.userCount = 1
    script.metaRows = []

    const result = await connection.registerConnection({ key })
    expect(result).toMatchObject({ key, storeName: 'OpenPOS', published: false })
  })
})

describe('bootstrapStoreOwner', () => {
  it('requires a valid key and a resolvable plane', async () => {
    await expect(connection.bootstrapStoreOwner({ key: 'bad', ...ownerInput })).rejects.toThrow(
      'invalid_connection_key',
    )
    await expect(
      connection.bootstrapStoreOwner({ key: generateConnectionKey(), ...ownerInput }),
    ).rejects.toThrow('connection_not_found')
  })

  it('inserts the owner and keeps the stored verifier', async () => {
    const key = generateConnectionKey()
    writeRegistry([{ key, adapter: 'file', url: 'file:/tmp/boot.sqlite', storeName: 'B' }])
    script.userCount = 0
    script.metaRows = [{ connection_key: key, seed_verifier: 'v' }]

    const result = await connection.bootstrapStoreOwner({ key, ...ownerInput })
    expect(result).toMatchObject({ key, storeName: 'Shop', published: false })
    expect(findExecuted('INSERT INTO users')).toHaveLength(1)
    const writes = findExecuted('INSERT INTO connection_meta')
    expect(writes).toHaveLength(1)
    expect(writes[0][2]?.[1]).toBe('v')
  })

  it('skips meta writes without stored meta', async () => {
    const key = generateConnectionKey()
    writeRegistry([{ key, adapter: 'file', url: 'file:/tmp/boot.sqlite', storeName: 'B' }])
    script.userCount = 0

    await connection.bootstrapStoreOwner({ key, ...ownerInput })
    expect(findExecuted('INSERT INTO users')).toHaveLength(1)
    expect(findExecuted('INSERT INTO connection_meta')).toHaveLength(0)
  })

  it('skips inserts when owners exist', async () => {
    const key = generateConnectionKey()
    writeRegistry([{ key, adapter: 'file', url: 'libsql://db.turso.io', authToken: 't', storeName: 'B' }])
    script.userCount = 1

    const result = await connection.bootstrapStoreOwner({ key, ...ownerInput })
    expect(result.published).toBe(true)
    expect(findExecuted('INSERT INTO users')).toHaveLength(0)
    expect(readRegistry().connections[0]).toMatchObject({ adapter: 'hosted' })
  })
})

describe('applyRemoteToConnection', () => {
  function fileEntry(key: string, extra: Record<string, unknown> = {}) {
    writeRegistry([{ key, adapter: 'file', url: 'file:/tmp/current.sqlite', storeName: 'C', ...extra }])
  }

  it('requires a valid key', async () => {
    await expect(connection.applyRemoteToConnection('bad', {})).rejects.toThrow('invalid_connection_key')
  })

  it('keeps the file plane without input', async () => {
    const key = generateConnectionKey()
    const result = await connection.applyRemoteToConnection(key, {})

    expect(result.dataPlane.url).toBe(`file:${join(connectionsDir, `${key.replaceAll('_', '-').toLowerCase()}.sqlite`)}`)
    expect(result).toMatchObject({ key, storeName: 'OpenPOS', published: false })
    const inserts = findExecuted('INSERT INTO database_settings')
    expect(inserts).toHaveLength(1)
    expect(inserts[0][2]?.slice(2, 5)).toEqual([null, null, null])
  })

  it('provisions a hosted plane and reports hostnames', async () => {
    const key = generateConnectionKey()
    fileEntry(key)
    const name = hostedDatabaseName(key)
    fetchHandler = (url, init) => {
      if (url.endsWith('/databases') && init?.method === 'POST') return jsonResponse({ ok: true })
      if (url.endsWith(`/databases/${name}`)) return jsonResponse({ hostname: 'h1' })
      if (url.endsWith('/auth/tokens')) return jsonResponse({ jwt: 'j1' })
      throw new Error(`unexpected ${url}`)
    }

    const result = await connection.applyRemoteToConnection(key, { platform })
    expect(result.dataPlane).toEqual({ url: 'libsql://h1', authToken: 'j1' })
    expect(result.published).toBe(true)
    expect(readRegistry().connections[0]).toMatchObject({ adapter: 'hosted' })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    fetchHandler = (url, init) => {
      if (url.endsWith('/databases') && init?.method === 'POST') return jsonResponse({}, { ok: false, status: 409 })
      if (url.endsWith(`/databases/${name}`)) return jsonResponse({ database: { hostname: 'n1' } })
      if (url.endsWith('/auth/tokens')) return jsonResponse({ jwt: 'j2' })
      throw new Error(`unexpected ${url}`)
    }
    const conflict = await connection.applyRemoteToConnection(key, { platform })
    expect(conflict.dataPlane.url).toBe('libsql://n1')

    fetchHandler = (url, init) => {
      if (url.endsWith('/databases') && init?.method === 'POST') return jsonResponse({ ok: true })
      if (url.endsWith(`/databases/${name}`)) return jsonResponse({})
      if (url.endsWith('/auth/tokens')) return jsonResponse({ jwt: 'j3' })
      throw new Error(`unexpected ${url}`)
    }
    const fallback = await connection.applyRemoteToConnection(key, { platform })
    expect(fallback.dataPlane.url).toBe(`libsql://${name}-o.turso.io`)
  })

  it('maps provisioning failures', async () => {
    const key = generateConnectionKey()
    fileEntry(key)
    const name = hostedDatabaseName(key)

    fetchHandler = (url, init) => {
      if (url.endsWith('/databases') && init?.method === 'POST')
        return jsonResponse({}, { ok: false, status: 500, textValue: 'detail!' })
      throw new Error(`unexpected ${url}`)
    }
    await expect(connection.applyRemoteToConnection(key, { platform })).rejects.toThrow('detail!')

    fetchHandler = (url, init) => {
      if (url.endsWith('/databases') && init?.method === 'POST')
        return jsonResponse({}, { ok: false, status: 500, textReject: true })
      throw new Error(`unexpected ${url}`)
    }
    await expect(connection.applyRemoteToConnection(key, { platform })).rejects.toThrow(
      'Unable to create the hosted store database',
    )

    fetchHandler = (url, init) => {
      if (url.endsWith('/databases') && init?.method === 'POST') return jsonResponse({ ok: true })
      if (url.endsWith(`/databases/${name}`)) return jsonResponse({}, { ok: false, status: 404 })
      throw new Error(`unexpected ${url}`)
    }
    await expect(connection.applyRemoteToConnection(key, { platform })).rejects.toThrow(
      'Unable to mint a hosted store token',
    )

    fetchHandler = (url, init) => {
      if (url.endsWith('/databases') && init?.method === 'POST') return jsonResponse({ ok: true })
      if (url.endsWith(`/databases/${name}`)) return jsonResponse({ hostname: 'h' })
      if (url.endsWith('/auth/tokens')) return jsonResponse({}, { ok: false, status: 500 })
      throw new Error(`unexpected ${url}`)
    }
    await expect(connection.applyRemoteToConnection(key, { platform })).rejects.toThrow(
      'Unable to mint a hosted store token',
    )

    fetchHandler = (url, init) => {
      if (url.endsWith('/databases') && init?.method === 'POST') return jsonResponse({ ok: true })
      if (url.endsWith(`/databases/${name}`)) return jsonResponse({ hostname: 'h' })
      if (url.endsWith('/auth/tokens')) return jsonResponse({})
      throw new Error(`unexpected ${url}`)
    }
    await expect(connection.applyRemoteToConnection(key, { platform })).rejects.toThrow(
      'Unable to mint a hosted store token',
    )
  })

  it('switches urls with token fallbacks', async () => {
    const key = generateConnectionKey()
    fileEntry(key, { authToken: 'curr-t' })

    const reused = await connection.applyRemoteToConnection(key, { url: 'libsql://new.turso.io' })
    expect(reused.dataPlane).toEqual({ url: 'libsql://new.turso.io', authToken: 'curr-t' })

    fileEntry(key)
    const explicit = await connection.applyRemoteToConnection(key, { url: 'libsql://new.turso.io', authToken: 'in-t' })
    expect(explicit.dataPlane).toEqual({ url: 'libsql://new.turso.io', authToken: 'in-t' })

    fileEntry(key)
    const file = await connection.applyRemoteToConnection(key, { url: 'file:/tmp/n.sqlite' })
    expect(file.dataPlane).toEqual({ url: 'file:/tmp/n.sqlite', authToken: undefined })

    fileEntry(key)
    await expect(connection.applyRemoteToConnection(key, { url: 'libsql://new.turso.io' })).rejects.toThrow(
      'Database auth token is required',
    )

    fileEntry(key)
    probeDataPlane.mockResolvedValueOnce(false)
    await expect(connection.applyRemoteToConnection(key, { url: 'file:/tmp/u2.sqlite' })).rejects.toThrow(
      'Unable to reach the database',
    )
  })

  it('prefers explicit urls over provisioning and writes platform settings', async () => {
    const key = generateConnectionKey()
    fileEntry(key)

    const result = await connection.applyRemoteToConnection(key, { url: 'file:/tmp/u.sqlite', platform })
    expect(result.dataPlane.url).toBe('file:/tmp/u.sqlite')
    expect(fetchMock).not.toHaveBeenCalled()
    const inserts = findExecuted('INSERT INTO database_settings')
    expect(inserts).toHaveLength(1)
    const params = inserts[0][2] as unknown[]
    expect(params[0]).toBe('file:/tmp/u.sqlite')
    expect(params[1]).toBeNull()
    expect(params[2]).not.toBeNull()
    expect(params.slice(3, 5)).toEqual(['o', 'g'])
  })

  it('writes platform settings over existing rows', async () => {
    const key = generateConnectionKey()
    fileEntry(key)
    script.dbSettingsRows = [
      { database_url: 'old', auth_token_encrypted: 'a', api_token_encrypted: 'keepApi', org: 'ko', group_name: 'kg' },
    ]

    await connection.applyRemoteToConnection(key, { url: 'file:/tmp/w.sqlite', platform })
    const updated = findExecuted('UPDATE database_settings')
    expect(updated).toHaveLength(1)
    const params = updated[0][2] as unknown[]
    expect(params[0]).toBe('file:/tmp/w.sqlite')
    expect(params[2]).not.toBe('keepApi')
    expect(params.slice(3, 5)).toEqual(['o', 'g'])

    executeWithClient.mockClear()
    await connection.applyRemoteToConnection(key, { url: 'file:/tmp/w.sqlite', platform: null })
    const nulled = findExecuted('UPDATE database_settings')
    expect(nulled).toHaveLength(1)
    expect((nulled[0][2] as unknown[]).slice(2, 5)).toEqual([null, null, null])

    executeWithClient.mockClear()
    await connection.applyRemoteToConnection(key, { url: 'file:/tmp/w.sqlite' })
    const kept = findExecuted('UPDATE database_settings')
    expect(kept).toHaveLength(1)
    expect((kept[0][2] as unknown[]).slice(2, 5)).toEqual(['keepApi', 'ko', 'kg'])
  })

  it('names applied planes from meta', async () => {
    const key = generateConnectionKey()
    fileEntry(key)
    script.metaRows = [{ store_name: 'Meta Shop' }]

    const result = await connection.applyRemoteToConnection(key, { url: 'file:/tmp/z.sqlite' })
    expect(result.storeName).toBe('Meta Shop')
  })
})
