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

function getConnectionDir(userDataPath, key) {
  return path.join(userDataPath, 'connections', connectionFileStem(key))
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
  if (!key) return null
  return {
    key,
    emergencyKitConfirmed: Boolean(parsed.emergencyKitConfirmed),
  }
}

function writeActiveConnection(userDataPath, input) {
  const key = parseConnectionKey(input.key)
  if (!key) {
    throw new Error('Invalid connection key')
  }

  writeJson(getActiveConnectionPath(userDataPath), {
    key,
    emergencyKitConfirmed: Boolean(input.emergencyKitConfirmed),
  })
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
    seedWrapped: typeof parsed.seedWrapped === 'string' ? parsed.seedWrapped : undefined,
    published: Boolean(parsed.published),
  }
}

function writeEnvelope(userDataPath, input) {
  const key = parseConnectionKey(input.key)
  if (!key) {
    throw new Error('Invalid connection key')
  }

  const existing = readEnvelope(userDataPath, key)
  const seedWrapped = input.seed
    ? wrapSecret(userDataPath, input.seed)
    : typeof input.seedWrapped === 'string'
      ? input.seedWrapped
      : existing?.seedWrapped

  writeJson(getEnvelopePath(userDataPath, key), {
    key,
    storeName: input.storeName ?? existing?.storeName ?? 'OpenPOS',
    url: input.url ?? existing?.url,
    ...(input.authToken || existing?.authToken
      ? { authToken: input.authToken ?? existing?.authToken }
      : {}),
    ...(seedWrapped ? { seedWrapped } : {}),
    published: input.published === undefined ? Boolean(existing?.published) : Boolean(input.published),
  })
}

function revealSeed(userDataPath, key) {
  const envelope = readEnvelope(userDataPath, key)
  if (!envelope?.seedWrapped) return null
  return unwrapSecret(userDataPath, envelope.seedWrapped)
}

function clearActiveConnection(userDataPath) {
  const activePath = getActiveConnectionPath(userDataPath)
  if (fs.existsSync(activePath)) {
    fs.rmSync(activePath, { force: true })
  }
}

function adoptLegacyLocalDatabase(userDataPath, key) {
  const legacyPath = getLegacyDbPath(userDataPath)
  const nextPath = getConnectionDbPath(userDataPath, key)
  if (!fs.existsSync(legacyPath) || fs.existsSync(nextPath)) {
    return false
  }

  fs.mkdirSync(path.dirname(nextPath), { recursive: true })
  fs.renameSync(legacyPath, nextPath)
  return true
}

function publicEnvelope(envelope, active) {
  if (!envelope) return null
  return {
    key: envelope.key,
    storeName: envelope.storeName,
    published: envelope.published,
    emergencyKitConfirmed: Boolean(active?.emergencyKitConfirmed),
    hasWrappedSeed: Boolean(envelope.seedWrapped),
  }
}

module.exports = {
  adoptLegacyLocalDatabase,
  clearActiveConnection,
  getConnectionDbPath,
  getLegacyDbPath,
  publicEnvelope,
  readActiveConnection,
  readEnvelope,
  revealSeed,
  writeActiveConnection,
  writeEnvelope,
}
