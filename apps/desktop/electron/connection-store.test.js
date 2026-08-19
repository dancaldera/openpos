import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const {
  publicEnvelope,
  readActiveConnection,
  readEnvelope,
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
