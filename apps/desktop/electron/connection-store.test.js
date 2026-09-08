import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const {
  publicEnvelope,
  readActiveConnection,
  readEnvelope,
  registerPayloadFromEnvelope,
  resetLocalDevice,
  revealSeed,
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
