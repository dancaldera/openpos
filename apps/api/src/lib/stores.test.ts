import type { ControlPlane } from '@openpos/control-plane'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearStoreCache,
  getControlPlane,
  publicStore,
  requestConnectionKey,
  requestHost,
  resolveRequestStore,
  resolveStore,
  setControlPlaneForTests,
} from './stores.js'

const savedEnv = { ...process.env }
const store = { id: 'store-1', slug: 'demo', name: 'Demo', status: 'active' }
const dataPlane = { url: 'libsql://demo', authToken: 'token' }

const plane = {
  findStore: vi.fn(),
  migrateStore: vi.fn(),
  dataPlaneFor: vi.fn(),
}

function headers(values: Record<string, string>) {
  return { header: (name: string) => values[name] }
}

beforeEach(() => {
  plane.findStore.mockReset().mockResolvedValue(store)
  plane.migrateStore.mockReset().mockResolvedValue(undefined)
  plane.dataPlaneFor.mockReset().mockResolvedValue(dataPlane)
  setControlPlaneForTests(plane as unknown as ControlPlane)
  delete process.env.DEFAULT_STORE
})

afterEach(() => {
  setControlPlaneForTests(null)
  process.env = { ...savedEnv }
})

describe('getControlPlane', () => {
  it('prefers the test override and otherwise reads the environment', () => {
    expect(getControlPlane()).toBe(plane)

    setControlPlaneForTests(null)
    delete process.env.CONTROL_PLANE_URL
    expect(() => getControlPlane()).toThrow('CONTROL_PLANE_URL is not configured')
  })
})

describe('resolveStore', () => {
  it('ignores empty lookups', async () => {
    await expect(resolveStore({})).resolves.toBeNull()
    expect(plane.findStore).not.toHaveBeenCalled()
  })

  it('resolves active stores, migrates them once, and caches results', async () => {
    await expect(resolveStore({ id: 'store-1' })).resolves.toEqual({ store, dataPlane })
    await expect(resolveStore({ id: 'store-1' })).resolves.toEqual({ store, dataPlane })
    expect(plane.findStore).toHaveBeenCalledTimes(1)

    await resolveStore({ slug: 'demo' })
    expect(plane.findStore).toHaveBeenCalledTimes(2)
    expect(plane.migrateStore).toHaveBeenCalledTimes(1)

    clearStoreCache()
    await resolveStore({ id: 'store-1' })
    expect(plane.findStore).toHaveBeenCalledTimes(3)
    expect(plane.migrateStore).toHaveBeenCalledTimes(2)
  })

  it('treats missing and inactive stores as unresolved and caches the miss', async () => {
    plane.findStore.mockResolvedValueOnce(null)
    await expect(resolveStore({ key: 'OPK_missing' })).resolves.toBeNull()
    await expect(resolveStore({ key: 'OPK_missing' })).resolves.toBeNull()
    expect(plane.findStore).toHaveBeenCalledTimes(1)

    plane.findStore.mockResolvedValueOnce({ ...store, status: 'disabled' })
    await expect(resolveStore({ host: 'demo.openpos.xyz' })).resolves.toBeNull()
    expect(plane.migrateStore).not.toHaveBeenCalled()
  })

  it('retries migrations that failed', async () => {
    plane.migrateStore.mockRejectedValueOnce(new Error('migration failed'))
    await expect(resolveStore({ id: 'store-1' })).rejects.toThrow('migration failed')

    await expect(resolveStore({ slug: 'demo' })).resolves.toEqual({ store, dataPlane })
    expect(plane.migrateStore).toHaveBeenCalledTimes(2)
  })
})

describe('request helpers', () => {
  it('reads the connection key header', () => {
    expect(requestConnectionKey(headers({}))).toBeNull()
    expect(requestConnectionKey(headers({ 'X-OpenPOS-Connection': 'nope' }))).toBeNull()
  })

  it('prefers the forwarded host and normalizes it', () => {
    expect(requestHost(headers({}))).toBeNull()
    expect(requestHost(headers({ Host: 'Demo.OpenPOS.xyz' }))).toBe('demo.openpos.xyz')
    expect(requestHost(headers({ Host: 'api.openpos.xyz', 'X-Forwarded-Host': ' aldo.openpos.xyz , proxy' }))).toBe(
      'aldo.openpos.xyz',
    )
  })

  it('falls back to DEFAULT_STORE', async () => {
    await expect(resolveRequestStore(headers({}))).resolves.toBeNull()
    expect(plane.findStore).not.toHaveBeenCalled()

    plane.findStore.mockResolvedValueOnce(null)
    process.env.DEFAULT_STORE = ' demo '
    await expect(resolveRequestStore(headers({ Host: 'localhost' }))).resolves.toEqual({ store, dataPlane })
    expect(plane.findStore).toHaveBeenNthCalledWith(1, { key: null, host: 'localhost' })
    expect(plane.findStore).toHaveBeenNthCalledWith(2, { slug: 'demo' })
  })

  it('exposes only public store fields', () => {
    expect(publicStore({ ...store, connectionKey: 'OPK_secret' } as never)).toEqual({
      id: 'store-1',
      name: 'Demo',
      slug: 'demo',
    })
  })
})
