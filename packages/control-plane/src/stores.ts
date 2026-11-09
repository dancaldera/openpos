import {
  applyStoreMigrations,
  ensureStoreOwner,
  generateConnectionKey,
  latestMigrationName,
  migrationsTable,
  parseConnectionKey,
  readConnectionMeta,
  writeConnectionMeta,
} from '@openpos/data/src/runtime.js'
import { validatePasswordStrength } from '@openpos/domain'
import bcrypt from 'bcryptjs'
import { decryptSecret, encryptSecret } from './crypto.ts'
import { ControlPlaneError } from './errors.ts'
import { assertDatabaseName, type DatabaseProvisioner } from './provisioner.ts'
import { ensureControlPlaneSchema } from './schema.ts'
import { all, type DataPlaneConfig, first, querier, run, runner, type SqlClient } from './sql.ts'

const BCRYPT_ROUNDS = 12
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
/** Subdomains used by platform services; stores cannot claim them. */
export const RESERVED_SLUGS = new Set(['admin', 'api', 'app', 'assets', 'docs', 'releases', 'static', 'status', 'www'])
/** connection_meta.seed_verifier is NOT NULL; admin-managed stores have no seed. */
const MANAGED_SEED_VERIFIER = 'control-plane'

export { ControlPlaneError }

export type StoreStatus = 'active' | 'disabled'

export interface StoreRecord {
  id: string
  slug: string
  name: string
  connectionKey: string
  databaseName: string
  databaseUrl: string
  status: StoreStatus
  domains: string[]
  createdAt: string
  updatedAt: string
}

export interface StoreOwnerInput {
  name: string
  email: string
  password: string
}

export interface CreateStoreInput {
  name: string
  slug: string
  owner: StoreOwnerInput
  databaseName?: string
}

export interface AttachDatabaseInput {
  slug: string
  name?: string
  /** Database managed by the provisioner. */
  databaseName?: string
  /** Or an external database reached by URL and token. */
  url?: string
  authToken?: string
  owner?: StoreOwnerInput
}

export interface StoreLookup {
  id?: string | null
  key?: string | null
  slug?: string | null
  host?: string | null
}

export interface StoreInspection {
  reachable: boolean
  error: string | null
  activeUsers: number | null
  appliedMigration: string | null
  latestMigration: string | null
  upToDate: boolean
}

export interface AuditEntry {
  id: number
  actor: string | null
  action: string
  target: string | null
  createdAt: string
}

export interface ControlPlaneOptions {
  db: SqlClient
  /** Encrypts store database tokens at rest. */
  secretsKey: string
  /** Open a client for a store database (libsql `createClient`). */
  openStoreDb: (config: DataPlaneConfig) => SqlClient
  /** Parent domains for `<slug>.<domain>` web hosts (e.g. pos.softmelody.dev, localhost). */
  baseDomains?: string[]
  now?: () => string
}

interface StoreRow {
  id: string
  slug: string
  name: string
  connection_key: string
  database_name: string
  database_url: string
  database_token_encrypted: string | null
  status: StoreStatus
  created_at: string
  updated_at: string
}

function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function normalizeSlug(input: string): string {
  const slug = input.trim().toLowerCase()
  if (!SLUG_PATTERN.test(slug)) {
    throw new ControlPlaneError('Store address uses lowercase letters, numbers, and dashes (max 32 characters)')
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new ControlPlaneError(`"${slug}" is reserved for platform services`)
  }
  return slug
}

export function normalizeHostname(input: string): string {
  const host = input.trim().toLowerCase().replace(/\.$/, '').replace(/:\d+$/, '')
  if (!HOSTNAME_PATTERN.test(host)) {
    throw new ControlPlaneError('Enter a valid hostname such as pos.example.com')
  }
  return host
}

function parseOwner(owner: StoreOwnerInput | undefined): StoreOwnerInput {
  const name = owner?.name?.trim() || ''
  const email = owner?.email?.trim().toLowerCase() || ''
  const password = owner?.password || ''
  if (!name) throw new ControlPlaneError('Owner name is required')
  if (!isValidEmail(email)) throw new ControlPlaneError('A valid owner email is required')
  const passwordError = validatePasswordStrength(password)
  if (passwordError) throw new ControlPlaneError(passwordError)
  return { name, email, password }
}

function hostOf(url: string): string {
  try {
    return new URL(url.replace(/^libsql:/, 'https:')).hostname || url
  } catch {
    return url
  }
}

export class ControlPlane {
  private readonly db: SqlClient
  private readonly now: () => string

  constructor(private readonly options: ControlPlaneOptions) {
    this.db = options.db
    this.now = options.now ?? (() => new Date().toISOString())
  }

  get baseDomains(): string[] {
    return this.options.baseDomains ?? []
  }

  ready(): Promise<void> {
    return ensureControlPlaneSchema(this.db)
  }

  // -------------------------------------------------------------------------
  // Stores
  // -------------------------------------------------------------------------

  private async toRecord(row: StoreRow, domains?: string[]): Promise<StoreRecord> {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      connectionKey: row.connection_key,
      databaseName: row.database_name,
      databaseUrl: row.database_url,
      status: row.status === 'disabled' ? 'disabled' : 'active',
      domains:
        domains ??
        (
          await all<{ hostname: string }>(
            this.db,
            'SELECT hostname FROM store_domains WHERE store_id = ? ORDER BY hostname',
            [row.id],
          )
        ).map((domain) => domain.hostname),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async listStores(): Promise<StoreRecord[]> {
    await this.ready()
    const rows = await all<StoreRow>(this.db, 'SELECT * FROM stores ORDER BY name COLLATE NOCASE')
    const domains = await all<{ hostname: string; store_id: string }>(
      this.db,
      'SELECT hostname, store_id FROM store_domains ORDER BY hostname',
    )
    return Promise.all(
      rows.map((row) =>
        this.toRecord(
          row,
          domains.filter((domain) => domain.store_id === row.id).map((domain) => domain.hostname),
        ),
      ),
    )
  }

  private async row(where: string, value: string): Promise<StoreRow | null> {
    await this.ready()
    return first<StoreRow>(this.db, `SELECT * FROM stores WHERE ${where} = ? LIMIT 1`, [value])
  }

  async getStore(id: string): Promise<StoreRecord> {
    const row = await this.row('id', id)
    if (!row) throw new ControlPlaneError('Store not found', 404)
    return this.toRecord(row)
  }

  /** Resolve a store from request context: id, connection key, slug, or web host. */
  async findStore(lookup: StoreLookup): Promise<StoreRecord | null> {
    let row: StoreRow | null = null
    if (lookup.id) row = await this.row('id', lookup.id)
    if (!row && lookup.key) {
      const key = parseConnectionKey(lookup.key)
      if (key) row = await this.row('connection_key', key)
    }
    if (!row && lookup.slug) row = await this.row('slug', lookup.slug.trim().toLowerCase())
    if (!row && lookup.host) row = await this.rowForHost(lookup.host)
    return row ? this.toRecord(row) : null
  }

  private async rowForHost(rawHost: string): Promise<StoreRow | null> {
    const host = rawHost.trim().toLowerCase().replace(/:\d+$/, '')
    if (!host) return null
    await this.ready()
    const mapped = await first<{ store_id: string }>(
      this.db,
      'SELECT store_id FROM store_domains WHERE hostname = ? LIMIT 1',
      [host],
    )
    if (mapped) return this.row('id', mapped.store_id)

    for (const rawBase of this.baseDomains) {
      const base = rawBase.trim().toLowerCase()
      if (!base || !host.endsWith(`.${base}`)) continue
      const label = host.slice(0, -(base.length + 1))
      if (label && !label.includes('.') && !RESERVED_SLUGS.has(label)) return this.row('slug', label)
    }
    return null
  }

  async dataPlaneFor(storeId: string): Promise<DataPlaneConfig> {
    const row = await this.row('id', storeId)
    if (!row) throw new ControlPlaneError('Store not found', 404)
    return {
      url: row.database_url,
      ...(row.database_token_encrypted
        ? { authToken: await decryptSecret(row.database_token_encrypted, this.options.secretsKey) }
        : {}),
    }
  }

  private async assertSlugFree(slug: string, exceptId?: string): Promise<void> {
    const existing = await this.row('slug', slug)
    if (existing && existing.id !== exceptId) throw new ControlPlaneError(`Address "${slug}" is already used`, 409)
  }

  private async assertDatabaseFree(databaseName: string): Promise<void> {
    if (await this.row('database_name', databaseName)) {
      throw new ControlPlaneError(`Database "${databaseName}" is already assigned to a store`, 409)
    }
  }

  private async insertStore(input: {
    slug: string
    name: string
    key: string
    databaseName: string
    dataPlane: DataPlaneConfig
  }): Promise<StoreRecord> {
    const id = crypto.randomUUID()
    const now = this.now()
    const token = input.dataPlane.authToken
      ? await encryptSecret(input.dataPlane.authToken, this.options.secretsKey)
      : null
    await run(
      this.db,
      `INSERT INTO stores (id, slug, name, connection_key, database_name, database_url, database_token_encrypted, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [id, input.slug, input.name, input.key, input.databaseName, input.dataPlane.url, token, now, now],
    )
    return this.getStore(id)
  }

  private async withStoreDb<T>(dataPlane: DataPlaneConfig, fn: (client: SqlClient) => Promise<T>): Promise<T> {
    const client = this.options.openStoreDb(dataPlane)
    try {
      return await fn(client)
    } finally {
      client.close?.()
    }
  }

  private async seedOwner(client: SqlClient, storeName: string, owner: StoreOwnerInput): Promise<void> {
    await ensureStoreOwner(runner(client), {
      storeName,
      adminName: owner.name,
      adminEmail: owner.email,
      adminPasswordHash: await bcrypt.hash(owner.password, BCRYPT_ROUNDS),
      now: this.now(),
    })
  }

  private async countUsers(client: SqlClient): Promise<number> {
    const row = await first<{ count: number }>(client, 'SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL')
    return Number(row?.count ?? 0)
  }

  /** Provision a database, migrate it, seed the owner, and register the store. */
  async createStore(
    provisioner: DatabaseProvisioner,
    input: CreateStoreInput,
  ): Promise<{ store: StoreRecord; connectionKey: string }> {
    await this.ready()
    const name = input.name?.trim()
    if (!name) throw new ControlPlaneError('Store name is required')
    const slug = normalizeSlug(input.slug)
    const owner = parseOwner(input.owner)
    const databaseName = assertDatabaseName(input.databaseName || `openpos-${slug}`)
    await this.assertSlugFree(slug)
    await this.assertDatabaseFree(databaseName)

    await provisioner.createDatabase(databaseName)
    const dataPlane = await provisioner.connect(databaseName)
    const key = generateConnectionKey()

    await this.withStoreDb(dataPlane, async (client) => {
      await applyStoreMigrations(client)
      await this.seedOwner(client, name, owner)
      await writeConnectionMeta(runner(client), {
        connectionKey: key,
        seedVerifier: MANAGED_SEED_VERIFIER,
        storeName: name,
        now: this.now(),
      })
    })

    const store = await this.insertStore({ slug, name, key, databaseName, dataPlane })
    return { store, connectionKey: key }
  }

  /**
   * Register an existing database as a store. A connection key already stored
   * in the database is kept so devices that joined it before keep working.
   */
  async attachDatabase(
    provisioner: DatabaseProvisioner | null,
    input: AttachDatabaseInput,
  ): Promise<{ store: StoreRecord; connectionKey: string }> {
    await this.ready()
    const slug = normalizeSlug(input.slug)
    await this.assertSlugFree(slug)

    let databaseName: string
    let dataPlane: DataPlaneConfig
    if (input.url?.trim()) {
      const url = input.url.trim()
      if (!/^(libsql|https?):\/\//.test(url))
        throw new ControlPlaneError('Database URL must start with libsql:// or https://')
      databaseName = hostOf(url)
      dataPlane = { url, ...(input.authToken?.trim() ? { authToken: input.authToken.trim() } : {}) }
    } else {
      if (!provisioner) throw new ControlPlaneError('A database name or URL is required')
      databaseName = assertDatabaseName(input.databaseName || '')
      dataPlane = await provisioner.connect(databaseName)
    }
    await this.assertDatabaseFree(databaseName)

    const { key, name } = await this.withStoreDb(dataPlane, async (client) => {
      try {
        await client.execute('SELECT 1')
      } catch {
        throw new ControlPlaneError('Unable to reach the database')
      }
      await applyStoreMigrations(client)
      const meta = await readConnectionMeta(querier(client))
      const company = await first<{ name: string }>(client, 'SELECT name FROM company_settings WHERE id = 1 LIMIT 1')
      const storeName = input.name?.trim() || String(meta?.store_name || company?.name || slug)

      if ((await this.countUsers(client)) === 0) {
        if (!input.owner) throw new ControlPlaneError('This database has no users yet: add an owner to attach it')
        await this.seedOwner(client, storeName, parseOwner(input.owner))
      }

      const existingKey = parseConnectionKey(String(meta?.connection_key || ''))
      const keyInUse = existingKey ? await this.row('connection_key', existingKey) : null
      const storeKey = existingKey && !keyInUse ? existingKey : generateConnectionKey()
      await writeConnectionMeta(runner(client), {
        connectionKey: storeKey,
        seedVerifier: String(meta?.seed_verifier || MANAGED_SEED_VERIFIER),
        storeName,
        now: this.now(),
      })
      return { key: storeKey, name: storeName }
    })

    const store = await this.insertStore({ slug, name, key, databaseName, dataPlane })
    return { store, connectionKey: key }
  }

  async updateStore(id: string, patch: { name?: string; slug?: string; status?: StoreStatus }): Promise<StoreRecord> {
    const current = await this.getStore(id)
    const name = patch.name === undefined ? current.name : patch.name.trim()
    if (!name) throw new ControlPlaneError('Store name is required')
    const slug = patch.slug === undefined ? current.slug : normalizeSlug(patch.slug)
    if (slug !== current.slug) await this.assertSlugFree(slug, id)
    const status = patch.status ?? current.status
    if (status !== 'active' && status !== 'disabled') throw new ControlPlaneError('Status must be active or disabled')

    await run(this.db, 'UPDATE stores SET name = ?, slug = ?, status = ?, updated_at = ? WHERE id = ?', [
      name,
      slug,
      status,
      this.now(),
      id,
    ])
    if (name !== current.name) {
      const dataPlane = await this.dataPlaneFor(id)
      await this.withStoreDb(dataPlane, async (client) => {
        await run(client, 'UPDATE connection_meta SET store_name = ?, updated_at = ? WHERE id = 1', [name, this.now()])
      })
    }
    return this.getStore(id)
  }

  /** Issue a new connection key. Devices connected with the old key must reconnect. */
  async rotateConnectionKey(id: string): Promise<{ store: StoreRecord; connectionKey: string }> {
    const store = await this.getStore(id)
    const key = generateConnectionKey()
    await this.withStoreDb(await this.dataPlaneFor(id), async (client) => {
      const meta = await readConnectionMeta(querier(client))
      await writeConnectionMeta(runner(client), {
        connectionKey: key,
        seedVerifier: String(meta?.seed_verifier || MANAGED_SEED_VERIFIER),
        storeName: store.name,
        now: this.now(),
      })
    })
    await run(this.db, 'UPDATE stores SET connection_key = ?, updated_at = ? WHERE id = ?', [key, this.now(), id])
    return { store: await this.getStore(id), connectionKey: key }
  }

  /** Remove a store from the registry, optionally deleting its database. */
  async deleteStore(id: string, options: { provisioner?: DatabaseProvisioner; dropDatabase?: boolean } = {}) {
    const store = await this.getStore(id)
    if (options.dropDatabase) {
      if (!options.provisioner) throw new ControlPlaneError('A provisioner is required to delete the database')
      await options.provisioner.deleteDatabase(store.databaseName)
    }
    await run(this.db, 'DELETE FROM store_domains WHERE store_id = ?', [id])
    await run(this.db, 'DELETE FROM stores WHERE id = ?', [id])
    return store
  }

  async addDomain(id: string, hostname: string): Promise<StoreRecord> {
    await this.getStore(id)
    const host = normalizeHostname(hostname)
    const existing = await first<{ store_id: string }>(
      this.db,
      'SELECT store_id FROM store_domains WHERE hostname = ?',
      [host],
    )
    if (existing && existing.store_id !== id)
      throw new ControlPlaneError(`${host} is already used by another store`, 409)
    if (!existing) {
      await run(this.db, 'INSERT INTO store_domains (hostname, store_id, created_at) VALUES (?, ?, ?)', [
        host,
        id,
        this.now(),
      ])
    }
    return this.getStore(id)
  }

  async removeDomain(id: string, hostname: string): Promise<StoreRecord> {
    await run(this.db, 'DELETE FROM store_domains WHERE hostname = ? AND store_id = ?', [
      hostname.trim().toLowerCase(),
      id,
    ])
    return this.getStore(id)
  }

  async migrateStore(id: string) {
    return this.withStoreDb(await this.dataPlaneFor(id), (client) => applyStoreMigrations(client))
  }

  async inspectStore(id: string): Promise<StoreInspection> {
    const latest = latestMigrationName()
    try {
      return await this.withStoreDb(await this.dataPlaneFor(id), async (client) => {
        await client.execute('SELECT 1')
        const applied = await first<{ name: string }>(
          client,
          `SELECT name FROM "${migrationsTable}" ORDER BY id DESC LIMIT 1`,
        ).catch(() => null)
        const activeUsers = await this.countUsers(client).catch(() => null)
        return {
          reachable: true,
          error: null,
          activeUsers,
          appliedMigration: applied?.name ?? null,
          latestMigration: latest,
          upToDate: Boolean(applied && applied.name === latest),
        }
      })
    } catch (error) {
      return {
        reachable: false,
        error: error instanceof Error ? error.message : String(error),
        activeUsers: null,
        appliedMigration: null,
        latestMigration: latest,
        upToDate: false,
      }
    }
  }

  // -------------------------------------------------------------------------
  // Root users
  // -------------------------------------------------------------------------

  async rootUserCount(): Promise<number> {
    await this.ready()
    const row = await first<{ count: number }>(this.db, 'SELECT COUNT(*) AS count FROM root_users')
    return Number(row?.count ?? 0)
  }

  async createRootUser(emailInput: string, password: string): Promise<{ id: string; email: string }> {
    await this.ready()
    const email = emailInput.trim().toLowerCase()
    if (!isValidEmail(email)) throw new ControlPlaneError('A valid email is required')
    const passwordError = validatePasswordStrength(password)
    if (passwordError) throw new ControlPlaneError(passwordError)
    if (await first(this.db, 'SELECT id FROM root_users WHERE email = ?', [email])) {
      throw new ControlPlaneError('A root user with that email already exists', 409)
    }
    const id = crypto.randomUUID()
    await run(this.db, 'INSERT INTO root_users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)', [
      id,
      email,
      await bcrypt.hash(password, BCRYPT_ROUNDS),
      this.now(),
    ])
    return { id, email }
  }

  async authenticateRoot(emailInput: string, password: string): Promise<{ id: string; email: string } | null> {
    await this.ready()
    const email = emailInput.trim().toLowerCase()
    const user = await first<{ id: string; email: string; password_hash: string }>(
      this.db,
      'SELECT id, email, password_hash FROM root_users WHERE email = ? LIMIT 1',
      [email],
    )
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return null
    await run(this.db, 'UPDATE root_users SET last_login_at = ? WHERE id = ?', [this.now(), user.id])
    return { id: user.id, email: user.email }
  }

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------

  async audit(actor: string | null, action: string, target: string | null = null): Promise<void> {
    await this.ready()
    await run(this.db, 'INSERT INTO audit_log (actor, action, target, created_at) VALUES (?, ?, ?, ?)', [
      actor,
      action,
      target,
      this.now(),
    ])
  }

  async recentAudit(limit = 50): Promise<AuditEntry[]> {
    await this.ready()
    const rows = await all<{
      id: number
      actor: string | null
      action: string
      target: string | null
      created_at: string
    }>(this.db, 'SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [Math.max(1, Math.min(500, Math.trunc(limit)))])
    return rows.map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      target: row.target,
      createdAt: row.created_at,
    }))
  }
}
