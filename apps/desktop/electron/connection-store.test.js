import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const {
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
} = await import('./connection-store.cjs')

const KEY = 'OPK_ABCD-EFGH-JKMN-PQRS'
const STEM = 'opk-abcd-efgh-jkmn-pqrs'
const tempDirs = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function freshDir() {
  const userDataPath = mkdtempSync(join(tmpdir(), 'openpos-envelope-'))
  tempDirs.push(userDataPath)
  return userDataPath
}

describe('connection-store envelopes', () => {
  it('persists an envelope and normalizes the key on read', () => {
    const userDataPath = freshDir()

    writeEnvelope(userDataPath, {
      key: KEY,
      storeName: 'Corner Shop',
      url: 'libsql://store.turso.io',
      authToken: 'token',
    })

    const envelope = readEnvelope(userDataPath, KEY.toLowerCase())
    expect(envelope).toEqual({
      key: KEY,
      storeName: 'Corner Shop',
      url: 'libsql://store.turso.io',
      authToken: 'token',
    })
    expect(publicEnvelope(envelope)).toEqual({ key: KEY, storeName: 'Corner Shop' })
  })

  it('defaults the store name and omits a missing token', () => {
    const userDataPath = freshDir()

    writeEnvelope(userDataPath, { key: KEY, url: 'file:/tmp/store.sqlite' })

    expect(readEnvelope(userDataPath, KEY)).toEqual({
      key: KEY,
      storeName: 'OpenPOS',
      url: 'file:/tmp/store.sqlite',
      authToken: undefined,
    })
  })

  it('validates envelope input', () => {
    const userDataPath = freshDir()

    expect(() => writeEnvelope(userDataPath, { key: 'bad', url: 'file:/x' })).toThrow('Invalid connection key')
    expect(() => writeEnvelope(userDataPath, { key: KEY, url: '' })).toThrow('Store database URL is required')
    expect(readEnvelope(userDataPath, 'bad')).toBeNull()
    expect(readEnvelope(userDataPath, KEY)).toBeNull()
  })

  it('reads sparse or corrupt envelopes defensively', () => {
    const userDataPath = freshDir()
    const dir = join(userDataPath, 'connections', STEM)
    const envelopePath = join(dir, 'envelope.json')
    mkdirSync(dir, { recursive: true })

    writeFileSync(envelopePath, JSON.stringify({ storeName: 'No URL' }))
    expect(readEnvelope(userDataPath, KEY)).toBeNull()

    writeFileSync(envelopePath, JSON.stringify({ url: 'file:/x', authToken: 123 }))
    expect(readEnvelope(userDataPath, KEY)).toEqual({
      key: KEY,
      storeName: 'OpenPOS',
      url: 'file:/x',
      authToken: undefined,
    })

    writeFileSync(envelopePath, '{nope')
    expect(readEnvelope(userDataPath, KEY)).toBeNull()
  })

  it('handles null envelopes', () => {
    expect(publicEnvelope(null)).toBeNull()
  })

  it('places the connection database under the connection directory', () => {
    const userDataPath = freshDir()

    expect(getConnectionDbPath(userDataPath, KEY)).toBe(join(userDataPath, 'connections', STEM, 'postpos.db'))
    expect(getLegacyDbPath(userDataPath)).toBe(join(userDataPath, 'postpos.db'))
  })
})

describe('connection-store active connection', () => {
  it('writes, reads, and clears the active connection', () => {
    const userDataPath = freshDir()

    expect(readActiveConnection(userDataPath)).toBeNull()
    writeActiveConnection(userDataPath, { key: KEY.toLowerCase() })
    expect(readActiveConnection(userDataPath)).toEqual({ key: KEY })

    clearActiveConnection(userDataPath)
    expect(readActiveConnection(userDataPath)).toBeNull()
    expect(() => clearActiveConnection(userDataPath)).not.toThrow()
  })

  it('rejects invalid keys and ignores invalid stored keys', () => {
    const userDataPath = freshDir()

    expect(() => writeActiveConnection(userDataPath, { key: 'bad' })).toThrow('Invalid connection key')

    writeFileSync(join(userDataPath, 'active-connection.json'), JSON.stringify({ key: 'bad' }))
    expect(readActiveConnection(userDataPath)).toBeNull()

    writeFileSync(join(userDataPath, 'active-connection.json'), JSON.stringify({}))
    expect(readActiveConnection(userDataPath)).toBeNull()
  })
})

describe('connection-store secrets', () => {
  it('wraps and unwraps secrets with the device secret', () => {
    const userDataPath = freshDir()

    const wrapped = wrapSecret(userDataPath, 'secret')
    expect(wrapped).toMatch(/^v1\./)
    expect(existsSync(join(userDataPath, 'device-secret'))).toBe(true)
    expect(unwrapSecret(userDataPath, wrapped)).toBe('secret')
    expect(unwrapSecret(userDataPath, wrapSecret(userDataPath, 'again'))).toBe('again')
  })

  it('rejects unsupported formats', () => {
    const userDataPath = freshDir()

    expect(() => unwrapSecret(userDataPath, 'bogus')).toThrow('Unsupported wrapped secret format')
    expect(() => unwrapSecret(userDataPath, null)).toThrow('Unsupported wrapped secret format')
  })

  it('creates the user data directory for a new device secret', () => {
    const userDataPath = join(freshDir(), 'nested')

    expect(unwrapSecret(userDataPath, wrapSecret(userDataPath, 'secret'))).toBe('secret')
  })
})

describe('connection-store reset', () => {
  it('deletes local keys and connection files but keeps runtime config', () => {
    const userDataPath = freshDir()

    writeEnvelope(userDataPath, { key: KEY, storeName: 'Corner Shop', url: 'libsql://store.turso.io', authToken: 't' })
    writeActiveConnection(userDataPath, { key: KEY })
    wrapSecret(userDataPath, 'secret')
    const extraDir = join(userDataPath, 'product-images')
    writeFileSync(join(userDataPath, 'config.json'), '{"apiUrl":"https://api.example.com"}\n')
    mkdirSync(extraDir)
    writeFileSync(join(extraDir, 'photo.jpg'), 'image')

    resetLocalDevice(userDataPath, [extraDir])

    expect(readActiveConnection(userDataPath)).toBeNull()
    expect(readEnvelope(userDataPath, KEY)).toBeNull()
    expect(existsSync(join(userDataPath, 'connections'))).toBe(false)
    expect(existsSync(join(userDataPath, 'device-secret'))).toBe(false)
    expect(existsSync(extraDir)).toBe(false)
    expect(existsSync(join(userDataPath, 'config.json'))).toBe(true)
  })

  it('resets empty devices', () => {
    const userDataPath = freshDir()

    expect(() => resetLocalDevice(userDataPath)).not.toThrow()
    expect(() => resetLocalDevice(userDataPath, ['', join(userDataPath, 'missing')])).not.toThrow()
  })

  it('removes legacy database files on reset', () => {
    const userDataPath = freshDir()
    const legacyDb = getLegacyDbPath(userDataPath)
    writeFileSync(legacyDb, 'db')
    writeFileSync(`${legacyDb}-wal`, 'wal')
    writeFileSync(`${legacyDb}-shm`, 'shm')

    resetLocalDevice(userDataPath)

    expect(existsSync(legacyDb)).toBe(false)
    expect(existsSync(`${legacyDb}-wal`)).toBe(false)
    expect(existsSync(`${legacyDb}-shm`)).toBe(false)
  })
})
