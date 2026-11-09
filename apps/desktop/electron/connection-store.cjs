const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { connectionFileStem, parseConnectionKey } = require('@openpos/data')

function encode(value) {
  return value.toString('base64url')
}

function decode(value) {
  return Buffer.from(value, 'base64url')
}

function getDeviceSecretPath(userDataPath) {
  return path.join(userDataPath, 'device-secret')
}

function getActiveConnectionPath(userDataPath) {
  return path.join(userDataPath, 'active-connection.json')
}

function getConnectionsRoot(userDataPath) {
  return path.join(userDataPath, 'connections')
}

function getConnectionDir(userDataPath, key) {
  return path.join(getConnectionsRoot(userDataPath), connectionFileStem(key))
}

function getEnvelopePath(userDataPath, key) {
  return path.join(getConnectionDir(userDataPath, key), 'envelope.json')
}

function getConnectionDbPath(userDataPath, key) {
  return path.join(getConnectionDir(userDataPath, key), 'postpos.db')
}

function getLegacyDbPath(userDataPath) {
  return path.join(userDataPath, 'postpos.db')
}

function ensureDeviceSecret(userDataPath) {
  const secretPath = getDeviceSecretPath(userDataPath)
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath)
  }

  fs.mkdirSync(userDataPath, { recursive: true })
  const secret = randomBytes(32)
  fs.writeFileSync(secretPath, secret, { mode: 0o600 })
  return secret
}

/** Encrypt a value with this device's secret (used for locally stored settings). */
function wrapSecret(userDataPath, plaintext) {
  const key = ensureDeviceSecret(userDataPath)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `v1.${encode(iv)}.${encode(authTag)}.${encode(ciphertext)}`
}

function unwrapSecret(userDataPath, payload) {
  const [version, encodedIv, encodedAuthTag, encodedCiphertext] = String(payload || '').split('.')
  if (version !== 'v1' || !encodedIv || !encodedAuthTag || !encodedCiphertext) {
    throw new Error('Unsupported wrapped secret format')
  }

  const decipher = createDecipheriv('aes-256-gcm', ensureDeviceSecret(userDataPath), decode(encodedIv))
  decipher.setAuthTag(decode(encodedAuthTag))
  return Buffer.concat([decipher.update(decode(encodedCiphertext)), decipher.final()]).toString('utf8')
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

function readActiveConnection(userDataPath) {
  const parsed = readJson(getActiveConnectionPath(userDataPath))
  const key = parseConnectionKey(parsed?.key || '')
  return key ? { key } : null
}

function writeActiveConnection(userDataPath, input) {
  const key = parseConnectionKey(input.key)
  if (!key) {
    throw new Error('Invalid connection key')
  }

  writeJson(getActiveConnectionPath(userDataPath), { key })
}

function readEnvelope(userDataPath, key) {
  const parsedKey = parseConnectionKey(key)
  if (!parsedKey) return null
  const parsed = readJson(getEnvelopePath(userDataPath, parsedKey))
  if (!parsed?.url) return null
  return {
    key: parsedKey,
    storeName: String(parsed.storeName || 'OpenPOS'),
    url: String(parsed.url),
    authToken: typeof parsed.authToken === 'string' ? parsed.authToken : undefined,
  }
}

function writeEnvelope(userDataPath, input) {
  const key = parseConnectionKey(input.key)
  if (!key) {
    throw new Error('Invalid connection key')
  }
  if (!input.url) {
    throw new Error('Store database URL is required')
  }

  writeJson(getEnvelopePath(userDataPath, key), {
    key,
    storeName: input.storeName || 'OpenPOS',
    url: input.url,
    ...(input.authToken ? { authToken: input.authToken } : {}),
  })
}

function clearActiveConnection(userDataPath) {
  const activePath = getActiveConnectionPath(userDataPath)
  if (fs.existsSync(activePath)) {
    fs.rmSync(activePath, { force: true })
  }
}

/** Wipe local connection files and the device secret. Does not touch the store database. */
function resetLocalDevice(userDataPath, extraPaths = []) {
  clearActiveConnection(userDataPath)

  const connectionsRoot = getConnectionsRoot(userDataPath)
  if (fs.existsSync(connectionsRoot)) {
    fs.rmSync(connectionsRoot, { recursive: true, force: true })
  }

  const legacyDb = getLegacyDbPath(userDataPath)
  for (const filePath of [legacyDb, `${legacyDb}-wal`, `${legacyDb}-shm`]) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true })
    }
  }

  const secretPath = getDeviceSecretPath(userDataPath)
  if (fs.existsSync(secretPath)) {
    fs.rmSync(secretPath, { force: true })
  }

  for (const extraPath of extraPaths) {
    if (extraPath && fs.existsSync(extraPath)) {
      fs.rmSync(extraPath, { recursive: true, force: true })
    }
  }
}

function publicEnvelope(envelope) {
  if (!envelope) return null
  return { key: envelope.key, storeName: envelope.storeName }
}

module.exports = {
  clearActiveConnection,
  getConnectionDbPath,
  getLegacyDbPath,
  publicEnvelope,
  readActiveConnection,
  readEnvelope,
  resetLocalDevice,
  unwrapSecret,
  wrapSecret,
  writeActiveConnection,
  writeEnvelope,
}
