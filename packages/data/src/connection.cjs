const { createHash, randomInt } = require('node:crypto')

const KEY_PREFIX = 'OPK'
const SEED_PREFIX = 'OPS'
const SECRET_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const DEMO_USER_EMAILS = ['admin@openpos.xyz', 'manager@openpos.xyz', 'user@openpos.xyz']

function randomSecret(length) {
  let value = ''
  for (let index = 0; index < length; index += 1) {
    value += SECRET_ALPHABET[randomInt(SECRET_ALPHABET.length)]
  }
  return value
}

function groupSecret(value, size) {
  const chunks = []
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size))
  }
  return chunks.join('-')
}

function normalizeConnectionSecret(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function parsePrefixedSecret(input, prefix, bodyLength) {
  const normalized = normalizeConnectionSecret(input)
  if (!normalized.startsWith(prefix)) {
    return null
  }

  const body = normalized.slice(prefix.length)
  if (body.length !== bodyLength) {
    return null
  }

  return `${prefix}_${groupSecret(body, prefix === KEY_PREFIX ? 4 : 8)}`
}

function generateConnectionKey() {
  return `${KEY_PREFIX}_${groupSecret(randomSecret(16), 4)}`
}

function generateConnectionSeed() {
  return `${SEED_PREFIX}_${groupSecret(randomSecret(32), 8)}`
}

function parseConnectionKey(input) {
  return parsePrefixedSecret(input, KEY_PREFIX, 16)
}

function parseConnectionSeed(input) {
  return parsePrefixedSecret(input, SEED_PREFIX, 32)
}

function hashConnectionSeed(seed) {
  const parsed = parseConnectionSeed(seed)
  if (!parsed) {
    throw new Error('Invalid connection seed')
  }

  return createHash('sha256').update(normalizeConnectionSecret(parsed)).digest('hex')
}

function connectionFileStem(key) {
  const parsed = parseConnectionKey(key)
  if (!parsed) {
    throw new Error('Invalid connection key')
  }

  return parsed.replaceAll('_', '-').toLowerCase()
}

function hostedDatabaseName(key) {
  return `openpos-${connectionFileStem(key).replace(/^opk-/, '')}`
}

async function seedFreshStore(run, input) {
  const now = input.now || new Date().toISOString()
  const connectionKey = parseConnectionKey(input.connectionKey)
  const storeName = String(input.storeName || '').trim()
  const adminName = String(input.adminName || '').trim()
  const adminEmail = String(input.adminEmail || '').trim().toLowerCase()
  const adminPasswordHash = String(input.adminPasswordHash || '')
  const seedVerifier = String(input.seedVerifier || '')

  if (!connectionKey) {
    throw new Error('Invalid connection key')
  }
  if (!storeName) {
    throw new Error('Store name is required')
  }
  if (!adminName) {
    throw new Error('Admin name is required')
  }
  if (!adminEmail) {
    throw new Error('Admin email is required')
  }
  if (!adminPasswordHash) {
    throw new Error('Admin password hash is required')
  }
  if (!seedVerifier) {
    throw new Error('Seed verifier is required')
  }

  await run(`DELETE FROM users WHERE email IN (?, ?, ?)`, DEMO_USER_EMAILS)
  await run(
    `INSERT INTO users (email, password, name, role, permissions, created_at, updated_at, password_hashed)
     VALUES (?, ?, ?, 'admin', ?, ?, ?, 1)`,
    [adminEmail, adminPasswordHash, adminName, '["*"]', now, now],
  )
  await run(
    `UPDATE company_settings
        SET name = ?, app_name = 'OpenPOS', updated_at = ?
      WHERE id = 1`,
    [storeName, now],
  )
  await run(
    `INSERT OR IGNORE INTO customers (
      customer_number, first_name, last_name, customer_type, is_active, created_at, updated_at
    ) VALUES ('CUST-00001', 'Walk-In', 'Customer', 'individual', 1, ?, ?)`,
    [now, now],
  )
  await run(`DELETE FROM connection_meta WHERE id = 1`, [])
  await run(
    `INSERT INTO connection_meta (id, connection_key, seed_verifier, store_name, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?)`,
    [connectionKey, seedVerifier, storeName, now, now],
  )
}

async function readConnectionMeta(query) {
  const rows = await query(
    `SELECT connection_key, seed_verifier, store_name, created_at, updated_at
       FROM connection_meta
      WHERE id = 1
      LIMIT 1`,
  )
  return rows[0] || null
}

async function writeConnectionMeta(run, input) {
  const now = input.now || new Date().toISOString()
  const connectionKey = parseConnectionKey(input.connectionKey)
  if (!connectionKey) {
    throw new Error('Invalid connection key')
  }

  await run(`DELETE FROM connection_meta WHERE id = 1`, [])
  await run(
    `INSERT INTO connection_meta (id, connection_key, seed_verifier, store_name, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?)`,
    [connectionKey, input.seedVerifier, input.storeName, now, now],
  )
}

module.exports = {
  DEMO_USER_EMAILS,
  connectionFileStem,
  generateConnectionKey,
  generateConnectionSeed,
  hashConnectionSeed,
  hostedDatabaseName,
  normalizeConnectionSecret,
  parseConnectionKey,
  parseConnectionSeed,
  readConnectionMeta,
  seedFreshStore,
  writeConnectionMeta,
}
