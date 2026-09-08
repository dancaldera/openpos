/**
 * Desktop-native store connections. Packaged installs talk to local SQLite
 * or Turso for store data. The OpenPOS HTTP API is required for sign-in,
 * password recovery, product images, and administration.
 */

const bcrypt = require('bcryptjs')
const Database = require('better-sqlite3')
const { existsSync } = require('node:fs')
const { createClient } = require('@libsql/client')
const {
  applyRemoteMigrations,
  ensureStoreOwner,
  generateConnectionKey,
  generateConnectionSeed,
  hashConnectionSeed,
  parseConnectionKey,
  parseConnectionSeed,
  readConnectionMeta,
  seedFreshStore,
  writeConnectionMeta,
} = require('@openpos/data')
const { getConnectionDbPath } = require('./connection-store.cjs')

const BCRYPT_ROUNDS = 12

const CONNECTION_ERRORS = {
  invalidKey: 'invalid_connection_key',
  invalidSeed: 'invalid_connection_secret',
  notFound: 'connection_not_found',
  ownerRequired: 'owner_required_for_empty_database',
  joinNeedsImport:
    'This device does not have that store yet. Import the Turso database URL and token, or create a new store on this computer.',
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

function validatePasswordStrength(password) {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain a number'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain a special character'
  return null
}

function hasAnyOwnerInput(input = {}) {
  return Boolean(input.storeName?.trim() || input.adminName?.trim() || input.adminEmail?.trim() || input.adminPassword)
}

function parseStoreOwnerInput(input = {}) {
  const storeName = String(input.storeName || '').trim()
  const adminName = String(input.adminName || '').trim()
  const adminEmail = String(input.adminEmail || '').trim().toLowerCase()
  const passwordError = validatePasswordStrength(input.adminPassword || '')

  if (!storeName) throw new Error('Store name is required')
  if (!adminName) throw new Error('Admin name is required')
  if (!isValidEmail(adminEmail)) throw new Error('A valid admin email is required')
  if (passwordError) throw new Error(passwordError)

  return { storeName, adminName, adminEmail, adminPassword: input.adminPassword || '' }
}

function runSqlite(database, sql, params = []) {
  database.prepare(sql).run(...params)
}

function querySqlite(database, sql, params = []) {
  return database.prepare(sql).all(...params)
}

function countActiveUsersSqlite(database) {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL`).get()
  return Number(row?.count ?? 0)
}

async function seedSqliteStore(database, owner, key, seed) {
  const passwordHash = await bcrypt.hash(owner.adminPassword, BCRYPT_ROUNDS)
  await seedFreshStore((sql, params) => runSqlite(database, sql, params || []), {
    storeName: owner.storeName,
    adminName: owner.adminName,
    adminEmail: owner.adminEmail,
    adminPasswordHash: passwordHash,
    connectionKey: key,
    seedVerifier: hashConnectionSeed(seed),
  })
}

function normalizeRemoteUrl(url) {
  const trimmed = String(url || '').trim()
  if (!trimmed) {
    throw new Error('Database URL is required')
  }
  if (!(trimmed.startsWith('libsql://') || trimmed.startsWith('https://') || trimmed.startsWith('file:'))) {
    throw new Error('Database URL must start with libsql://, https://, or file:')
  }
  return trimmed
}

function rowsFromExecute(result) {
  const rows = result?.rows || []
  if (!rows.length) return []
  const first = rows[0]
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    return rows
  }
  const columns = result.columns || []
  return rows.map((row) => {
    const object = {}
    columns.forEach((column, index) => {
      object[column] = row[index]
    })
    return object
  })
}

async function runRemote(client, sql, params = []) {
  await client.execute(sql, params)
}

async function queryRemote(client, sql, params = []) {
  const result = await client.execute(sql, params)
  return rowsFromExecute(result)
}

async function countActiveUsersRemote(client) {
  const rows = await queryRemote(client, 'SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL')
  return Number(rows[0]?.count ?? 0)
}

function createRemoteClient(dataPlane) {
  return createClient({
    url: dataPlane.url,
    ...(dataPlane.authToken ? { authToken: dataPlane.authToken } : {}),
  })
}

async function createLocalStore({ userDataPath, owner }) {
  const parsedOwner = parseStoreOwnerInput(owner)
  const key = generateConnectionKey()
  const seed = generateConnectionSeed()
  const dbPath = getConnectionDbPath(userDataPath, key)

  return {
    key,
    seed,
    storeName: parsedOwner.storeName,
    published: false,
    dataPlane: { url: `file:${dbPath}` },
    owner: parsedOwner,
  }
}

async function seedBoundLocalStore(database, result) {
  await seedSqliteStore(database, result.owner, result.key, result.seed)
}

async function joinLocalStore({ userDataPath, key, seed, openDatabase }) {
  const parsedKey = parseConnectionKey(key)
  const parsedSeed = parseConnectionSeed(seed)
  if (!parsedKey) throw new Error(CONNECTION_ERRORS.invalidKey)
  if (!parsedSeed) throw new Error(CONNECTION_ERRORS.invalidSeed)

  const dbPath = getConnectionDbPath(userDataPath, parsedKey)
  if (!existsSync(dbPath)) {
    throw new Error(CONNECTION_ERRORS.joinNeedsImport)
  }

  const open = openDatabase || ((filePath, sqliteOptions) => new Database(filePath, sqliteOptions))
  const database = open(dbPath, { readonly: true })

  try {
    const meta = await readConnectionMeta((sql, params) => querySqlite(database, sql, params || []))
    if (!meta || String(meta.seed_verifier) !== hashConnectionSeed(parsedSeed)) {
      throw new Error(CONNECTION_ERRORS.invalidSeed)
    }

    return {
      key: parsedKey,
      storeName: String(meta.store_name || 'OpenPOS'),
      published: false,
      dataPlane: { url: `file:${dbPath}` },
    }
  } finally {
    database.close()
  }
}

async function attachRemoteStore(input) {
  const url = normalizeRemoteUrl(input.url)
  const authToken = String(input.authToken || '').trim()
  if (!url.startsWith('file:') && !authToken) {
    throw new Error('Database auth token is required')
  }

  const dataPlane = { url, authToken: authToken || undefined }
  const client = createRemoteClient(dataPlane)

  try {
    await client.execute('SELECT 1')
  } catch {
    throw new Error('Unable to reach the database')
  }

  await applyRemoteMigrations(client)
  const existing = await readConnectionMeta((sql, params) => queryRemote(client, sql, params || []))
  const activeUsers = await countActiveUsersRemote(client)
  const ownerInput = {
    storeName: input.storeName,
    adminName: input.adminName,
    adminEmail: input.adminEmail,
    adminPassword: input.adminPassword,
  }

  let key
  let seed
  let storeName

  if (activeUsers === 0) {
    if (!hasAnyOwnerInput(ownerInput)) {
      throw new Error(CONNECTION_ERRORS.ownerRequired)
    }
    const owner = parseStoreOwnerInput(ownerInput)

    if (existing?.connection_key && existing.seed_verifier) {
      const parsed = parseConnectionKey(String(existing.connection_key))
      if (!parsed) throw new Error(CONNECTION_ERRORS.invalidKey)
      key = parsed
      storeName = owner.storeName
      const passwordHash = await bcrypt.hash(owner.adminPassword, BCRYPT_ROUNDS)
      await ensureStoreOwner((sql, params) => runRemote(client, sql, params || []), {
        storeName: owner.storeName,
        adminName: owner.adminName,
        adminEmail: owner.adminEmail,
        adminPasswordHash: passwordHash,
      })
      await writeConnectionMeta((sql, params) => runRemote(client, sql, params || []), {
        connectionKey: key,
        seedVerifier: String(existing.seed_verifier),
        storeName,
      })
    } else {
      key = generateConnectionKey()
      seed = generateConnectionSeed()
      storeName = owner.storeName
      const passwordHash = await bcrypt.hash(owner.adminPassword, BCRYPT_ROUNDS)
      await seedFreshStore((sql, params) => runRemote(client, sql, params || []), {
        storeName: owner.storeName,
        adminName: owner.adminName,
        adminEmail: owner.adminEmail,
        adminPasswordHash: passwordHash,
        connectionKey: key,
        seedVerifier: hashConnectionSeed(seed),
      })
    }
  } else if (existing?.connection_key && existing.seed_verifier) {
    const parsed = parseConnectionKey(String(existing.connection_key))
    if (!parsed) throw new Error(CONNECTION_ERRORS.invalidKey)
    key = parsed
    storeName = String(existing.store_name || 'OpenPOS')
  } else {
    key = generateConnectionKey()
    seed = generateConnectionSeed()
    const company = (await queryRemote(client, 'SELECT name FROM company_settings WHERE id = 1 LIMIT 1'))[0]
    storeName = String(company?.name || 'OpenPOS')
    await writeConnectionMeta((sql, params) => runRemote(client, sql, params || []), {
      connectionKey: key,
      seedVerifier: hashConnectionSeed(seed),
      storeName,
    })
  }

  return {
    key,
    seed,
    storeName,
    published: !url.startsWith('file:'),
    dataPlane,
  }
}

async function bootstrapLocalOwner(database, ownerInput) {
  const owner = parseStoreOwnerInput(ownerInput)
  if (countActiveUsersSqlite(database) > 0) {
    return { storeName: owner.storeName }
  }

  const passwordHash = await bcrypt.hash(owner.adminPassword, BCRYPT_ROUNDS)
  const existing = await readConnectionMeta((sql, params) => querySqlite(database, sql, params || []))
  await ensureStoreOwner((sql, params) => runSqlite(database, sql, params || []), {
    storeName: owner.storeName,
    adminName: owner.adminName,
    adminEmail: owner.adminEmail,
    adminPasswordHash: passwordHash,
  })
  if (existing?.connection_key && existing.seed_verifier) {
    await writeConnectionMeta((sql, params) => runSqlite(database, sql, params || []), {
      connectionKey: String(existing.connection_key),
      seedVerifier: String(existing.seed_verifier),
      storeName: owner.storeName,
    })
  }
  return { storeName: owner.storeName }
}

module.exports = {
  CONNECTION_ERRORS,
  attachRemoteStore,
  bootstrapLocalOwner,
  createLocalStore,
  joinLocalStore,
  parseStoreOwnerInput,
  seedBoundLocalStore,
}
