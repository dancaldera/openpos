import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const {
  adoptLegacyLocalDatabase,
  getConnectionDbPath,
  getLegacyDbPath,
  publicEnvelope,
  readActiveConnection,
  readEnvelope,
  registerPayloadFromEnvelope,
  resetLocalDevice,
  revealSeed,
  unwrapSecret,
  wrapSecret,
  writeActiveConnection,
  writeEnvelope,
} = await import('./connection-store.cjs')

const tempDirs = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('connection-store', () => {
  it('persists an envelope and can unwrap the seed on this device', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'openpos-envelope-'))
    tempDirs.push(userDataPath)

    writeEnvelope(userDataPath, {
      key: 'OPK_ABCD-EFGH-JKMN-PQRS',
      storeName: 'Corner Shop',
      url: 'file:/tmp/store.sqlite',
      seed: 'OPS_AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
      published: false,
    })
    writeActiveConnection(userDataPath, {
      key: 'OPK_ABCD-EFGH-JKMN-PQRS',
      emergencyKitConfirmed: false,
    })

    const envelope = readEnvelope(userDataPath, 'opk_abcd-efgh-jkmn-pqrs')
    expect(envelope.storeName).toBe('Corner Shop')
    expect(envelope.seedWrapped).toEqual(expect.any(String))
    expect(revealSeed(userDataPath, envelope.key)).toBe('OPS_AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD')
    expect(publicEnvelope(envelope, readActiveConnection(userDataPath))).toEqual({
      key: 'OPK_ABCD-EFGH-JKMN-PQRS',
      storeName: 'Corner Shop',
      published: false,
      emergencyKitConfirmed: false,
      hasWrappedSeed: true,
    })
    expect(publicEnvelope(envelope, readActiveConnection(userDataPath)).url).toBeUndefined()
  })

  it('omits local file paths from the API register payload', () => {
    expect(
      registerPayloadFromEnvelope({
        key: 'OPK_ABCD-EFGH-JKMN-PQRS',
        storeName: 'Corner Shop',
        url: 'file:/tmp/store.sqlite',
      }),
    ).toEqual({
      key: 'OPK_ABCD-EFGH-JKMN-PQRS',
      storeName: 'Corner Shop',
    })
  })

  it('includes hosted database credentials in the API register payload', () => {
    expect(
      registerPayloadFromEnvelope({
        key: 'OPK_ABCD-EFGH-JKMN-PQRS',
        storeName: 'Corner Shop',
        url: 'libsql://store.turso.io',
        authToken: 'token',
      }),
    ).toEqual({
      key: 'OPK_ABCD-EFGH-JKMN-PQRS',
      storeName: 'Corner Shop',
      url: 'libsql://store.turso.io',
      authToken: 'token',
    })
  })

  it('deletes local keys and connection files without requiring a remote wipe', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'openpos-envelope-'))
    tempDirs.push(userDataPath)

    writeEnvelope(userDataPath, {
      key: 'OPK_ABCD-EFGH-JKMN-PQRS',
      storeName: 'Corner Shop',
      url: 'libsql://store.turso.io',
      authToken: 'token',
      seed: 'OPS_AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
      published: true,
    })
    writeActiveConnection(userDataPath, {
      key: 'OPK_ABCD-EFGH-JKMN-PQRS',
      emergencyKitConfirmed: true,
    })
    const extraDir = join(userDataPath, 'product-images')
    writeFileSync(join(userDataPath, 'config.json'), '{"apiUrl":"https://api.example.com"}\n')
    mkdirSync(extraDir)
    writeFileSync(join(extraDir, 'photo.jpg'), 'image')

    resetLocalDevice(userDataPath, [extraDir])

    expect(readActiveConnection(userDataPath)).toBeNull()
    expect(readEnvelope(userDataPath, 'OPK_ABCD-EFGH-JKMN-PQRS')).toBeNull()
    expect(existsSync(join(userDataPath, 'connections'))).toBe(false)
    expect(existsSync(join(userDataPath, 'device-secret'))).toBe(false)
    expect(existsSync(extraDir)).toBe(false)
    expect(existsSync(join(userDataPath, 'config.json'))).toBe(true)
  })

  it('keeps the wrapped seed when updating the remote url', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'openpos-envelope-'))
    tempDirs.push(userDataPath)

    writeEnvelope(userDataPath, {
      key: 'OPK_ABCD-EFGH-JKMN-PQRS',
      storeName: 'Corner Shop',
      url: 'file:/tmp/store.sqlite',
      seed: 'OPS_AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
      published: false,
    })
    writeEnvelope(userDataPath, {
      key: 'OPK_ABCD-EFGH-JKMN-PQRS',
      url: 'libsql://store.turso.io',
      authToken: 'token',
      published: true,
    })

    expect(revealSeed(userDataPath, 'OPK_ABCD-EFGH-JKMN-PQRS')).toBe('OPS_AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD')
    expect(readEnvelope(userDataPath, 'OPK_ABCD-EFGH-JKMN-PQRS')).toMatchObject({
      url: 'libsql://store.turso.io',
      authToken: 'token',
      published: true,
    })
  })
})

describe('connection-store branches', () => {
  const KEY = 'OPK_ABCD-EFGH-JKMN-PQRS'

  function freshDir() {
    const userDataPath = mkdtempSync(join(tmpdir(), 'openpos-envelope-'))
    tempDirs.push(userDataPath)
    return userDataPath
  }

  it('validates connection keys', () => {
    const userDataPath = freshDir()

    expect(() => writeActiveConnection(userDataPath, { key: 'bad' })).toThrow('Invalid connection key')
    expect(() => writeEnvelope(userDataPath, { key: 'bad', url: 'file:/x' })).toThrow('Invalid connection key')
    expect(readEnvelope(userDataPath, 'bad')).toBeNull()
    expect(revealSeed(userDataPath, 'bad')).toBeNull()

    writeEnvelope(userDataPath, { key: KEY, url: 'file:/x' })
    expect(revealSeed(userDataPath, KEY)).toBeNull()
  })

  it('wraps and unwraps secrets', () => {
    const userDataPath = freshDir()

    expect(unwrapSecret(userDataPath, wrapSecret(userDataPath, 'secret'))).toBe('secret')
    expect(() => unwrapSecret(userDataPath, 'bogus')).toThrow('Unsupported wrapped secret format')
    expect(() => unwrapSecret(userDataPath, null)).toThrow('Unsupported wrapped secret format')
  })

  it('defaults minimal envelopes', () => {
    const userDataPath = freshDir()

    writeEnvelope(userDataPath, { key: KEY, url: 'file:/x' })
    expect(readEnvelope(userDataPath, KEY)).toEqual({
      key: KEY,
      storeName: 'OpenPOS',
      url: 'file:/x',
      authToken: undefined,
      seedWrapped: undefined,
      published: false,
    })
  })

  it('keeps existing values on partial updates', () => {
    const userDataPath = freshDir()

    writeEnvelope(userDataPath, {
      key: KEY,
      storeName: 'Corner Shop',
      url: 'file:/tmp/store.sqlite',
      authToken: 'token',
      seed: 'OPS_AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
      published: true,
    })
    writeEnvelope(userDataPath, { key: KEY, seedWrapped: 'kept' })

    expect(readEnvelope(userDataPath, KEY)).toMatchObject({
      storeName: 'Corner Shop',
      url: 'file:/tmp/store.sqlite',
      authToken: 'token',
      seedWrapped: 'kept',
      published: true,
    })
  })

  it('reads sparse envelopes defensively', () => {
    const userDataPath = freshDir()
    const stem = KEY.replaceAll('_', '-').toLowerCase()
    const envelopePath = join(userDataPath, 'connections', stem, 'envelope.json')

    mkdirSync(join(userDataPath, 'connections', stem), { recursive: true })
    writeFileSync(envelopePath, JSON.stringify({ key: KEY, url: 'file:/x', seedWrapped: 123 }))

    expect(readEnvelope(userDataPath, KEY)).toMatchObject({ storeName: 'OpenPOS', seedWrapped: undefined })
  })

  it('handles null envelopes', () => {
    expect(publicEnvelope(null)).toBeNull()
    expect(registerPayloadFromEnvelope(null)).toBeNull()
    expect(registerPayloadFromEnvelope({ key: KEY, storeName: 'S' })).toEqual({ key: KEY, storeName: 'S' })
    expect(registerPayloadFromEnvelope({ key: KEY, storeName: 'S', url: 'libsql://x.turso.io' })).toEqual({
      key: KEY,
      storeName: 'S',
      url: 'libsql://x.turso.io',
      authToken: '',
    })
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

  it('adopts legacy databases', () => {
    const userDataPath = freshDir()

    expect(adoptLegacyLocalDatabase(userDataPath, KEY)).toBe(false)

    const legacyDb = getLegacyDbPath(userDataPath)
    const nextPath = getConnectionDbPath(userDataPath, KEY)
    writeFileSync(legacyDb, 'db')
    mkdirSync(join(userDataPath, 'connections', KEY.replaceAll('_', '-').toLowerCase()), { recursive: true })
    writeFileSync(nextPath, 'already here')
    expect(adoptLegacyLocalDatabase(userDataPath, KEY)).toBe(false)

    rmSync(nextPath)
    expect(adoptLegacyLocalDatabase(userDataPath, KEY)).toBe(true)
    expect(existsSync(legacyDb)).toBe(false)
    expect(existsSync(nextPath)).toBe(true)
  })
})
