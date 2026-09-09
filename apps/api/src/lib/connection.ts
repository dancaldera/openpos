/**
 * Connection module: create, join, and resolve a store's data plane.
 *
 * New stores use a local file. Hosted Turso URL/token and platform credentials
 * are saved from Settings into database_settings, not process env.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyRemoteMigrations,
  ensureStoreOwner,
  generateConnectionKey,
  generateConnectionSeed,
  hashConnectionSeed,
  hostedDatabaseName,
  parseConnectionKey,
  parseConnectionSeed,
  readConnectionMeta,
  seedFreshStore,
  writeConnectionMeta,
} from '@openpos/data'
import bcrypt from 'bcryptjs'
import { validatePasswordStrength } from './password.js'
import { encryptSecret, isValidEmail } from './secrets.js'
import {
  createDataPlaneClient,
  type DataPlaneConfig,
  executeWithClient,
  probeDataPlane,
  type QueryableClient,
  query,
  queryWithClient,
} from './turso.js'

const BCRYPT_ROUNDS = 12

export const CONNECTION_ERRORS = {
  invalidKey: 'invalid_connection_key',
  invalidSeed: 'invalid_connection_secret',
  notFound: 'connection_not_found',
  required: 'Store connection required',
  ownerRequired: 'owner_required_for_empty_database',
} as const

interface RegistryEntry {
  key: string
  adapter: 'file' | 'hosted' | 'legacy'
  url: string
  authToken?: string
  storeName: string
}

interface RegistryFile {
  connections: RegistryEntry[]
}

export interface CreateConnectionInput {
  storeName: string
  adminName: string
  adminEmail: string
  adminPassword: string
}

export interface JoinConnectionInput {
  key: string
  seed: string
}

export interface ConnectionResult {
  key: string
  seed?: string
  storeName: string
  published: boolean
  dataPlane: DataPlaneConfig
}

export interface PlatformConfig {
  apiToken: string
  org: string
  group: string
}

export interface StoreOwnerInput {
  storeName: string
  adminName: string
  adminEmail: string
  adminPassword: string
}

export interface ImportRemoteInput {
  url: string
  authToken: string
  storeName?: string
  adminName?: string
  adminEmail?: string
  adminPassword?: string
}

export interface RegisterConnectionInput {
  key: string
  url?: string
  authToken?: string
  storeName?: string
  adminName?: string
  adminEmail?: string
  adminPassword?: string
}

export interface BootstrapOwnerInput extends StoreOwnerInput {
  key: string
}

function getConnectionsDir(): string {
  return process.env.OPENPOS_CONNECTIONS_DIR || join(process.cwd(), 'data', 'connections')
}

function getRegistryPath(): string {
  return join(getConnectionsDir(), 'registry.json')
}

function readRegistry(): RegistryFile {
  try {
    const parsed = JSON.parse(readFileSync(getRegistryPath(), 'utf8')) as RegistryFile
    return { connections: Array.isArray(parsed.connections) ? parsed.connections : [] }
  } catch {
    return { connections: [] }
  }
}

function writeRegistry(registry: RegistryFile): void {
  mkdirSync(getConnectionsDir(), { recursive: true })
  writeFileSync(getRegistryPath(), `${JSON.stringify(registry, null, 2)}\n`)
}

function upsertRegistry(entry: RegistryEntry): void {
  const registry = readRegistry()
  const next = registry.connections.filter((item) => item.key !== entry.key)
  next.push(entry)
  writeRegistry({ connections: next })
}

function findRegistry(key: string): RegistryEntry | undefined {
  // Callers pass validated connection keys (see resolveDataPlane).
  return readRegistry().connections.find((item) => item.key === key)
}

function filePathForKey(key: string): string {
  // Callers pass validated connection keys (see fileDataPlane/resolveDataPlane).
  return join(getConnectionsDir(), `${key.replaceAll('_', '-').toLowerCase()}.sqlite`)
}

function fileDataPlane(key: string): DataPlaneConfig {
  mkdirSync(getConnectionsDir(), { recursive: true })
  return { url: `file:${filePathForKey(key)}` }
}

function normalizeRemoteUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) {
    throw new Error('Database URL is required')
  }
  if (!(trimmed.startsWith('libsql://') || trimmed.startsWith('https://') || trimmed.startsWith('file:'))) {
    throw new Error('Database URL must start with libsql://, https://, or file:')
  }
  return trimmed
}

function readConfiguredDataPlane(): DataPlaneConfig | null {
  const url = process.env.TURSO_DATABASE_URL?.trim() || ''
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || ''
  if (!url && !authToken) return null

  const normalizedUrl = normalizeRemoteUrl(url)
  if (!normalizedUrl.startsWith('file:') && !authToken) {
    throw new Error('Database auth token is required')
  }

  return { url: normalizedUrl, authToken: authToken || undefined }
}

export function parsePlatformConfig(input: { apiToken?: string; org?: string; group?: string }): PlatformConfig | null {
  const apiToken = input.apiToken?.trim() || ''
  const org = input.org?.trim() || ''
  const group = input.group?.trim() || ''
  if (!apiToken && !org && !group) return null
  if (!apiToken || !org || !group) {
    throw new Error('Turso API token, org, and group are all required')
  }
  return { apiToken, org, group }
}

async function tursoPlatformRequest(creds: PlatformConfig, path: string, init: RequestInit = {}): Promise<Response> {
  // No caller passes custom headers; auth and content type are always set here.
  return fetch(`https://api.turso.tech/v1/organizations/${creds.org}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      'Content-Type': 'application/json',
    },
  })
}

async function lookupHostedDataPlane(creds: PlatformConfig, key: string): Promise<DataPlaneConfig | null> {
  const name = hostedDatabaseName(key)
  const databaseResponse = await tursoPlatformRequest(creds, `/databases/${name}`)
  if (!databaseResponse.ok) {
    return null
  }

  const tokenResponse = await tursoPlatformRequest(creds, `/databases/${name}/auth/tokens`, {
    method: 'POST',
    body: JSON.stringify({ expiration: 'never' }),
  })
  if (!tokenResponse.ok) {
    return null
  }

  const tokenPayload = (await tokenResponse.json()) as { jwt?: string }
  const databasePayload = (await databaseResponse.json()) as {
    hostname?: string
    database?: { hostname?: string }
  }
  const hostname = databasePayload.hostname || databasePayload.database?.hostname || `${name}-${creds.org}.turso.io`

  if (!tokenPayload.jwt) {
    return null
  }

  return {
    url: `libsql://${hostname}`,
    authToken: tokenPayload.jwt,
  }
}

async function provisionHostedDataPlane(creds: PlatformConfig, key: string): Promise<DataPlaneConfig> {
  const name = hostedDatabaseName(key)
  const created = await tursoPlatformRequest(creds, '/databases', {
    method: 'POST',
    body: JSON.stringify({ name, group: creds.group }),
  })

  if (!created.ok && created.status !== 409) {
    const detail = await created.text().catch(() => '')
    throw new Error(detail || 'Unable to create the hosted store database')
  }

  const lookup = await lookupHostedDataPlane(creds, key)
  if (!lookup) {
    throw new Error('Unable to mint a hosted store token')
  }
  return lookup
}

async function runOnClient(client: QueryableClient, sql: string, params: unknown[] = []): Promise<void> {
  await executeWithClient(client, sql, params)
}

async function queryOnClient<T extends Record<string, unknown>>(
  client: QueryableClient,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return queryWithClient<T>(client, sql, params)
}

async function prepareDataPlane(config: DataPlaneConfig): Promise<QueryableClient> {
  const client = createDataPlaneClient(config)
  await applyRemoteMigrations(client)
  return client
}

export async function resolveDataPlane(key: string): Promise<DataPlaneConfig | null> {
  const parsed = parseConnectionKey(key)
  if (!parsed) return null

  const registered = findRegistry(parsed)
  if (registered) {
    return { url: registered.url, authToken: registered.authToken }
  }

  const filePath = filePathForKey(parsed)
  if (existsSync(filePath)) {
    return { url: `file:${filePath}` }
  }

  const configured = readConfiguredDataPlane()
  if (configured) {
    const client = await prepareDataPlane(configured)
    const meta = await readConnectionMeta((sql, params) => queryOnClient(client, sql, params))
    const configuredKey = parseConnectionKey(String(meta?.connection_key || ''))
    if (configuredKey === parsed) {
      upsertRegistry({
        key: configuredKey,
        adapter: isHostedUrl(configured.url) ? 'hosted' : 'file',
        url: configured.url,
        authToken: configured.authToken,
        storeName: String(meta?.store_name || 'OpenPOS'),
      })
      return configured
    }
  }

  return null
}

async function writeDatabaseSettings(
  client: QueryableClient,
  input: {
    // Both callers always pass the active data plane url and token (possibly null).
    databaseUrl: string
    authToken: string | null
    apiToken?: string | null
    org?: string | null
    group?: string | null
  },
): Promise<void> {
  const existing = (
    await queryOnClient<{
      database_url?: string | null
      auth_token_encrypted?: string | null
      api_token_encrypted?: string | null
      org?: string | null
      group_name?: string | null
    }>(client, 'SELECT * FROM database_settings WHERE id = 1 LIMIT 1')
  )[0]
  const now = new Date().toISOString()
  const databaseUrl = input.databaseUrl
  const authTokenEncrypted = input.authToken ? encryptSecret(input.authToken) : null
  const apiTokenEncrypted =
    input.apiToken === undefined
      ? existing?.api_token_encrypted || null
      : input.apiToken
        ? encryptSecret(input.apiToken)
        : null
  const org = input.org === undefined ? existing?.org || null : input.org
  const groupName = input.group === undefined ? existing?.group_name || null : input.group

  if (existing) {
    await runOnClient(
      client,
      `UPDATE database_settings
       SET database_url = ?, auth_token_encrypted = ?, api_token_encrypted = ?, org = ?, group_name = ?, updated_at = ?
       WHERE id = 1`,
      [databaseUrl, authTokenEncrypted, apiTokenEncrypted, org, groupName, now],
    )
    return
  }

  await runOnClient(
    client,
    `INSERT INTO database_settings
     (id, database_url, auth_token_encrypted, api_token_encrypted, org, group_name, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    [databaseUrl, authTokenEncrypted, apiTokenEncrypted, org, groupName, now, now],
  )
}

export async function createConnection(input: CreateConnectionInput): Promise<ConnectionResult> {
  const storeName = input.storeName.trim()
  const adminName = input.adminName.trim()
  const adminEmail = input.adminEmail.trim().toLowerCase()
  const passwordError = validatePasswordStrength(input.adminPassword)

  if (!storeName) {
    throw new Error('Store name is required')
  }
  if (!adminName) {
    throw new Error('Admin name is required')
  }
  if (!isValidEmail(adminEmail)) {
    throw new Error('A valid admin email is required')
  }
  if (passwordError) {
    throw new Error(passwordError)
  }

  const key = generateConnectionKey()
  const seed = generateConnectionSeed()
  const dataPlane = fileDataPlane(key)
  const client = await prepareDataPlane(dataPlane)
  const passwordHash = await bcrypt.hash(input.adminPassword, BCRYPT_ROUNDS)

  await seedFreshStore((sql, params) => runOnClient(client, sql, params), {
    storeName,
    adminName,
    adminEmail,
    adminPasswordHash: passwordHash,
    connectionKey: key,
    seedVerifier: hashConnectionSeed(seed),
  })

  upsertRegistry({
    key,
    adapter: 'file',
    url: dataPlane.url,
    storeName,
  })

  return {
    key,
    seed,
    storeName,
    published: false,
    dataPlane,
  }
}

export async function joinConnection(input: JoinConnectionInput): Promise<ConnectionResult> {
  const key = parseConnectionKey(input.key)
  const seed = parseConnectionSeed(input.seed)
  if (!key) {
    throw new Error(CONNECTION_ERRORS.invalidKey)
  }
  if (!seed) {
    throw new Error(CONNECTION_ERRORS.invalidSeed)
  }

  const dataPlane = await resolveDataPlane(key)
  if (!dataPlane) {
    throw new Error(CONNECTION_ERRORS.notFound)
  }

  const client = await prepareDataPlane(dataPlane)
  const meta = await readConnectionMeta((sql, params) => queryOnClient(client, sql, params))
  if (!meta || String(meta.seed_verifier) !== hashConnectionSeed(seed)) {
    throw new Error(CONNECTION_ERRORS.invalidSeed)
  }

  const storeName = String(meta.store_name || 'OpenPOS')
  upsertRegistry({
    key,
    adapter: dataPlane.url.startsWith('file:') ? 'file' : 'hosted',
    url: dataPlane.url,
    authToken: dataPlane.authToken,
    storeName,
  })

  return {
    key,
    storeName,
    published: !dataPlane.url.startsWith('file:'),
    dataPlane,
  }
}

function hasAnyOwnerInput(input: {
  storeName?: string
  adminName?: string
  adminEmail?: string
  adminPassword?: string
}): boolean {
  return Boolean(input.storeName?.trim() || input.adminName?.trim() || input.adminEmail?.trim() || input.adminPassword)
}

function parseStoreOwnerInput(input: {
  storeName?: string
  adminName?: string
  adminEmail?: string
  adminPassword?: string
}): StoreOwnerInput {
  const storeName = input.storeName?.trim() || ''
  const adminName = input.adminName?.trim() || ''
  const adminEmail = input.adminEmail?.trim().toLowerCase() || ''
  const adminPassword = input.adminPassword || ''
  const passwordError = validatePasswordStrength(adminPassword)

  if (!storeName) {
    throw new Error('Store name is required')
  }
  if (!adminName) {
    throw new Error('Admin name is required')
  }
  if (!isValidEmail(adminEmail)) {
    throw new Error('A valid admin email is required')
  }
  if (passwordError) {
    throw new Error(passwordError)
  }

  return {
    storeName,
    adminName,
    adminEmail,
    adminPassword,
  }
}

async function countActiveUsers(client: QueryableClient): Promise<number> {
  const row = (
    await queryOnClient<{ count?: number }>(client, 'SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL')
  )[0]
  return Number(row?.count ?? 0)
}

async function insertStoreOwner(client: QueryableClient, owner: StoreOwnerInput): Promise<void> {
  const passwordHash = await bcrypt.hash(owner.adminPassword, BCRYPT_ROUNDS)
  await ensureStoreOwner((sql, params) => runOnClient(client, sql, params), {
    storeName: owner.storeName,
    adminName: owner.adminName,
    adminEmail: owner.adminEmail,
    adminPasswordHash: passwordHash,
  })
}

async function attachRemoteDataPlane(
  dataPlane: DataPlaneConfig,
  extras: {
    apiToken?: string | null
    org?: string | null
    group?: string | null
    ownerInput: {
      storeName?: string
      adminName?: string
      adminEmail?: string
      adminPassword?: string
    }
  } = { ownerInput: {} },
): Promise<ConnectionResult> {
  const reachable = await probeDataPlane(dataPlane)
  if (!reachable) {
    throw new Error('Unable to reach the database')
  }

  const client = await prepareDataPlane(dataPlane)
  const existing = await readConnectionMeta((sql, params) => queryOnClient(client, sql, params))
  const activeUsers = await countActiveUsers(client)
  let key: string
  let seed: string | undefined
  let storeName: string

  if (activeUsers === 0) {
    if (!hasAnyOwnerInput(extras.ownerInput)) {
      throw new Error(CONNECTION_ERRORS.ownerRequired)
    }
    const owner = parseStoreOwnerInput(extras.ownerInput)

    if (existing?.connection_key && existing.seed_verifier) {
      const parsed = parseConnectionKey(String(existing.connection_key))
      if (!parsed) {
        throw new Error(CONNECTION_ERRORS.invalidKey)
      }
      key = parsed
      storeName = owner.storeName
      await insertStoreOwner(client, owner)
      await writeConnectionMeta((sql, params) => runOnClient(client, sql, params), {
        connectionKey: key,
        seedVerifier: String(existing.seed_verifier),
        storeName,
      })
    } else {
      key = generateConnectionKey()
      seed = generateConnectionSeed()
      storeName = owner.storeName
      await seedFreshStore((sql, params) => runOnClient(client, sql, params), {
        storeName: owner.storeName,
        adminName: owner.adminName,
        adminEmail: owner.adminEmail,
        adminPasswordHash: await bcrypt.hash(owner.adminPassword, BCRYPT_ROUNDS),
        connectionKey: key,
        seedVerifier: hashConnectionSeed(seed),
      })
    }
  } else if (existing?.connection_key && existing.seed_verifier) {
    const parsed = parseConnectionKey(String(existing.connection_key))
    if (!parsed) {
      throw new Error(CONNECTION_ERRORS.invalidKey)
    }
    key = parsed
    storeName = String(existing.store_name || 'OpenPOS')
  } else {
    key = generateConnectionKey()
    seed = generateConnectionSeed()
    const company = (
      await queryOnClient<{ name?: string }>(client, 'SELECT name FROM company_settings WHERE id = 1 LIMIT 1')
    )[0]
    storeName = String(company?.name || 'OpenPOS')
    await writeConnectionMeta((sql, params) => runOnClient(client, sql, params), {
      connectionKey: key,
      seedVerifier: hashConnectionSeed(seed),
      storeName,
    })
  }

  await writeDatabaseSettings(client, {
    databaseUrl: dataPlane.url,
    authToken: dataPlane.authToken || null,
    apiToken: extras.apiToken,
    org: extras.org,
    group: extras.group,
  })

  upsertRegistry({
    key,
    adapter: dataPlane.url.startsWith('file:') ? 'file' : 'hosted',
    url: dataPlane.url,
    authToken: dataPlane.authToken,
    storeName,
  })

  return {
    key,
    seed,
    storeName,
    published: !dataPlane.url.startsWith('file:'),
    dataPlane,
  }
}

export async function importRemoteConnection(input: ImportRemoteInput): Promise<ConnectionResult> {
  const url = normalizeRemoteUrl(input.url)
  const authToken = input.authToken.trim()
  if (!url.startsWith('file:') && !authToken) {
    throw new Error('Database auth token is required')
  }

  return attachRemoteDataPlane(
    { url, authToken: authToken || undefined },
    {
      ownerInput: {
        storeName: input.storeName,
        adminName: input.adminName,
        adminEmail: input.adminEmail,
        adminPassword: input.adminPassword,
      },
    },
  )
}

function isHostedUrl(url: string): boolean {
  return url.startsWith('libsql://') || url.startsWith('https://')
}

async function connectionResultFromDataPlane(key: string, dataPlane: DataPlaneConfig): Promise<ConnectionResult> {
  const client = await prepareDataPlane(dataPlane)
  const meta = await readConnectionMeta((sql, params) => queryOnClient(client, sql, params))
  const storeName = String(meta?.store_name || 'OpenPOS')
  return {
    key,
    storeName,
    published: isHostedUrl(dataPlane.url),
    dataPlane,
  }
}

export async function registerConnection(input: RegisterConnectionInput): Promise<ConnectionResult> {
  const key = parseConnectionKey(input.key)
  if (!key) {
    throw new Error(CONNECTION_ERRORS.invalidKey)
  }

  const url = input.url?.trim() || ''
  if (isHostedUrl(url)) {
    const dataPlane = {
      url: normalizeRemoteUrl(url),
      authToken: input.authToken?.trim() || undefined,
    }
    if (!dataPlane.authToken) {
      throw new Error('Database auth token is required')
    }

    const reachable = await probeDataPlane(dataPlane)
    if (!reachable) {
      throw new Error('Unable to reach the database')
    }

    const client = await prepareDataPlane(dataPlane)
    const meta = await readConnectionMeta((sql, params) => queryOnClient(client, sql, params))
    const storeName = String(meta?.store_name || input.storeName?.trim() || 'OpenPOS')
    upsertRegistry({
      key,
      adapter: 'hosted',
      url: dataPlane.url,
      authToken: dataPlane.authToken,
      storeName,
    })
    return { key, storeName, published: true, dataPlane }
  }

  const existing = await resolveDataPlane(key)
  if (existing) {
    const client = await prepareDataPlane(existing)
    const activeUsers = await countActiveUsers(client)
    if (activeUsers > 0) {
      return connectionResultFromDataPlane(key, existing)
    }
  }

  const dataPlane = existing && !isHostedUrl(existing.url) ? existing : fileDataPlane(key)
  const client = await prepareDataPlane(dataPlane)
  const meta = await readConnectionMeta((sql, params) => queryOnClient(client, sql, params))
  const owner = parseStoreOwnerInput({
    storeName: input.storeName || String(meta?.store_name || ''),
    adminName: input.adminName,
    adminEmail: input.adminEmail,
    adminPassword: input.adminPassword,
  })
  await insertStoreOwner(client, owner)
  await writeConnectionMeta((sql, params) => runOnClient(client, sql, params), {
    connectionKey: key,
    seedVerifier: String(meta?.seed_verifier || hashConnectionSeed(generateConnectionSeed())),
    storeName: owner.storeName,
  })
  upsertRegistry({
    key,
    adapter: 'file',
    url: dataPlane.url,
    storeName: owner.storeName,
  })

  return {
    key,
    storeName: owner.storeName,
    published: false,
    dataPlane,
  }
}

export async function bootstrapStoreOwner(input: BootstrapOwnerInput): Promise<ConnectionResult> {
  const key = parseConnectionKey(input.key)
  if (!key) {
    throw new Error(CONNECTION_ERRORS.invalidKey)
  }

  const dataPlane = await resolveDataPlane(key)
  if (!dataPlane) {
    throw new Error(CONNECTION_ERRORS.notFound)
  }

  const owner = parseStoreOwnerInput(input)
  const client = await prepareDataPlane(dataPlane)
  const activeUsers = await countActiveUsers(client)
  const existing = await readConnectionMeta((sql, params) => queryOnClient(client, sql, params))

  if (activeUsers === 0) {
    await insertStoreOwner(client, owner)
    if (existing?.connection_key && existing.seed_verifier) {
      await writeConnectionMeta((sql, params) => runOnClient(client, sql, params), {
        connectionKey: key,
        seedVerifier: String(existing.seed_verifier),
        storeName: owner.storeName,
      })
    }
  }

  // parseStoreOwnerInput guarantees a non-empty store name.
  const storeName = owner.storeName
  upsertRegistry({
    key,
    adapter: dataPlane.url.startsWith('file:') ? 'file' : 'hosted',
    url: dataPlane.url,
    authToken: dataPlane.authToken,
    storeName,
  })

  return {
    key,
    storeName,
    published: !dataPlane.url.startsWith('file:'),
    dataPlane,
  }
}

export async function applyRemoteToConnection(
  key: string,
  input: {
    url?: string
    authToken?: string
    platform?: PlatformConfig | null
  },
): Promise<ConnectionResult> {
  const parsed = parseConnectionKey(key)
  if (!parsed) {
    throw new Error(CONNECTION_ERRORS.invalidKey)
  }

  const current = (await resolveDataPlane(parsed)) || fileDataPlane(parsed)
  let dataPlane = current

  if (input.platform && !input.url) {
    dataPlane = await provisionHostedDataPlane(input.platform, parsed)
  } else if (input.url) {
    const url = normalizeRemoteUrl(input.url)
    const authToken = input.authToken?.trim() || current.authToken || ''
    if (!url.startsWith('file:') && !authToken) {
      throw new Error('Database auth token is required')
    }
    dataPlane = { url, authToken: authToken || undefined }
    const reachable = await probeDataPlane(dataPlane)
    if (!reachable) {
      throw new Error('Unable to reach the database')
    }
  }

  const client = await prepareDataPlane(dataPlane)
  const meta = await readConnectionMeta((sql, params) => queryOnClient(client, sql, params))
  const storeName = String(meta?.store_name || 'OpenPOS')

  await writeDatabaseSettings(client, {
    databaseUrl: dataPlane.url,
    authToken: dataPlane.authToken || null,
    apiToken: input.platform === undefined ? undefined : input.platform?.apiToken || null,
    org: input.platform === undefined ? undefined : input.platform?.org || null,
    group: input.platform === undefined ? undefined : input.platform?.group || null,
  })

  upsertRegistry({
    key: parsed,
    adapter: dataPlane.url.startsWith('file:') ? 'file' : 'hosted',
    url: dataPlane.url,
    authToken: dataPlane.authToken,
    storeName,
  })

  return {
    key: parsed,
    storeName,
    published: !dataPlane.url.startsWith('file:'),
    dataPlane,
  }
}

export interface AssignedConnection {
  key: string
  storeName: string
  published: boolean
}

export async function readAssignedConnection(): Promise<AssignedConnection | null> {
  const registry = readRegistry()
  const configured = readConfiguredDataPlane()
  if (configured) {
    const configuredEntry = registry.connections.findLast(
      (item) => item.url === configured.url && (item.authToken || '') === (configured.authToken || ''),
    )
    const configuredKey = parseConnectionKey(configuredEntry?.key || '')
    if (configuredEntry && configuredKey) {
      return {
        key: configuredKey,
        storeName: configuredEntry.storeName || 'OpenPOS',
        published: isHostedUrl(configuredEntry.url),
      }
    }

    const client = await prepareDataPlane(configured)
    const meta = await readConnectionMeta((sql, params) => queryOnClient(client, sql, params))
    const key = parseConnectionKey(String(meta?.connection_key || ''))
    if (!key) return null

    const storeName = String(meta?.store_name || 'OpenPOS')
    upsertRegistry({
      key,
      adapter: isHostedUrl(configured.url) ? 'hosted' : 'file',
      url: configured.url,
      authToken: configured.authToken,
      storeName,
    })
    return { key, storeName, published: isHostedUrl(configured.url) }
  }

  const entry = registry.connections.at(-1)
  const key = parseConnectionKey(entry?.key || '')
  if (!entry || !key) return null
  return {
    key,
    storeName: entry.storeName || 'OpenPOS',
    published: isHostedUrl(entry.url),
  }
}

export async function readCurrentConnectionMeta(): Promise<{ key: string; storeName: string } | null> {
  const meta = await readConnectionMeta((sql, params) => query(sql, params || []))
  if (!meta?.connection_key) return null
  const key = parseConnectionKey(String(meta.connection_key))
  if (!key) return null
  return { key, storeName: String(meta.store_name || 'OpenPOS') }
}

export function connectionErrorStatus(error: unknown): 400 | 404 | 500 {
  const message = error instanceof Error ? error.message : String(error)
  if (message === CONNECTION_ERRORS.notFound) return 404
  if (
    message === CONNECTION_ERRORS.invalidKey ||
    message === CONNECTION_ERRORS.invalidSeed ||
    message === CONNECTION_ERRORS.ownerRequired ||
    message === 'Store name is required' ||
    message === 'Admin name is required' ||
    message === 'A valid admin email is required' ||
    message === 'Database URL is required' ||
    message === 'Database auth token is required' ||
    message === 'Turso API token, org, and group are all required' ||
    message.startsWith('Database URL must') ||
    message.startsWith('Password must')
  ) {
    return 400
  }
  return 500
}
