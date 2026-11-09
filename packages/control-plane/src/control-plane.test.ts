import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ControlPlane,
  controlPlaneFromEnv,
  decryptSecret,
  encryptSecret,
  parseBaseDomains,
  secretsEqual,
  TursoPlatform,
  tursoProvisioner,
} from './index.ts'
import { localProvisioner } from './local-provisioner.ts'
import type { DataPlaneConfig } from './sql.ts'

const OWNER = { name: 'Ana Owner', email: 'Owner@Example.com', password: 'Str0ng!Pass' }
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function setup(baseDomain = 'openpos.xyz') {
  const dir = mkdtempSync(join(tmpdir(), 'openpos-cp-'))
  dirs.push(dir)
  const cp = new ControlPlane({
    db: createClient({ url: `file:${join(dir, 'control.sqlite')}` }),
    secretsKey: 'test-secrets-key',
    openStoreDb: (config: DataPlaneConfig) => createClient(config),
    baseDomains: [baseDomain, 'localhost'],
  })
  return { cp, provisioner: localProvisioner(join(dir, 'stores')), dir }
}

describe('controlPlaneFromEnv', () => {
  it('requires a URL and secret, parses base domains, and reuses instances', () => {
    expect(() => controlPlaneFromEnv({ CONTROL_PLANE_SECRET: 's' })).toThrow('CONTROL_PLANE_URL')
    expect(() => controlPlaneFromEnv({ CONTROL_PLANE_URL: 'file::memory:' })).toThrow('CONTROL_PLANE_SECRET')
    const env = {
      CONTROL_PLANE_URL: 'file::memory:',
      CONTROL_PLANE_SECRET: 's',
      STORE_BASE_DOMAINS: ' OpenPOS.xyz, ,localhost',
    }
    const plane = controlPlaneFromEnv(env)
    expect(plane.baseDomains).toEqual(['openpos.xyz', 'localhost'])
    expect(controlPlaneFromEnv({ ...env })).toBe(plane)
    expect(parseBaseDomains(undefined)).toEqual([])
  })
})

describe('secret envelopes', () => {
  it('round-trips with WebCrypto', async () => {
    const sealed = await encryptSecret('turso-token', 'k')
    expect(sealed.startsWith('v1.')).toBe(true)
    expect(await decryptSecret(sealed, 'k')).toBe('turso-token')
    await expect(decryptSecret(sealed, 'other')).rejects.toThrow()
    await expect(decryptSecret('v2.a.b.c', 'k')).rejects.toThrow('Unsupported')
  })

  it('decrypts values produced by the previous node:crypto implementation', async () => {
    const key = createHash('sha256').update('legacy-secret').digest()
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update('s3-secret', 'utf8'), cipher.final()])
    const legacy = `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`
    expect(await decryptSecret(legacy, 'legacy-secret')).toBe('s3-secret')
  })

  it('compares secrets', async () => {
    expect(await secretsEqual('a', 'a')).toBe(true)
    expect(await secretsEqual('a', 'ab')).toBe(false)
  })
})

describe('ControlPlane stores', () => {
  it('creates a store with a migrated, seeded database and resolves it', async () => {
    const { cp, provisioner } = setup()
    const { store, connectionKey } = await cp.createStore(provisioner, {
      name: 'Demo Store',
      slug: 'demo',
      owner: OWNER,
    })
    expect(store.slug).toBe('demo')
    expect(store.databaseName).toBe('openpos-demo')
    expect(connectionKey).toMatch(/^OPK_/)

    expect((await cp.findStore({ key: connectionKey.toLowerCase().replaceAll('-', '') }))?.id).toBe(store.id)
    expect((await cp.findStore({ slug: 'DEMO' }))?.id).toBe(store.id)
    expect((await cp.findStore({ host: 'demo.openpos.xyz:443' }))?.id).toBe(store.id)
    expect((await cp.findStore({ host: 'demo.localhost:5173' }))?.id).toBe(store.id)
    expect(await cp.findStore({ host: 'api.openpos.xyz' })).toBeNull()
    expect(await cp.findStore({ host: 'a.b.openpos.xyz' })).toBeNull()
    expect(await cp.findStore({ key: 'nope' })).toBeNull()

    const dataPlane = await cp.dataPlaneFor(store.id)
    const client = createClient(dataPlane)
    const users = await client.execute('SELECT email, role FROM users WHERE deleted_at IS NULL')
    expect(users.rows.map((row) => row.email)).toEqual(['owner@example.com'])
    const meta = await client.execute('SELECT connection_key, store_name FROM connection_meta')
    expect(meta.rows[0].connection_key).toBe(connectionKey)
    client.close()

    const inspection = await cp.inspectStore(store.id)
    expect(inspection).toMatchObject({ reachable: true, activeUsers: 1, upToDate: true })
  })

  it('validates input and prevents duplicates', async () => {
    const { cp, provisioner } = setup()
    await expect(cp.createStore(provisioner, { name: 'X', slug: 'api', owner: OWNER })).rejects.toThrow('reserved')
    await expect(cp.createStore(provisioner, { name: 'X', slug: 'Bad Slug', owner: OWNER })).rejects.toThrow(
      'lowercase',
    )
    await expect(
      cp.createStore(provisioner, { name: 'X', slug: 'x', owner: { ...OWNER, password: 'weak' } }),
    ).rejects.toThrow()
    await cp.createStore(provisioner, { name: 'One', slug: 'one', owner: OWNER })
    await expect(cp.createStore(provisioner, { name: 'Two', slug: 'one', owner: OWNER })).rejects.toThrow(
      'already used',
    )
  })

  it('attaches an existing database and keeps its connection key', async () => {
    const { cp, provisioner } = setup()
    const created = await cp.createStore(provisioner, { name: 'Legacy', slug: 'legacy', owner: OWNER })
    const dataPlane = await cp.dataPlaneFor(created.store.id)
    await cp.deleteStore(created.store.id)

    const attached = await cp
      .attachDatabase(null, { slug: 'aldo', url: 'https://unused.example', authToken: 't' })
      .catch((error) => error)
    expect(attached).toBeInstanceOf(Error)

    const reattached = await cp.attachDatabase(provisioner, { slug: 'aldo', databaseName: 'openpos-legacy' })
    expect(reattached.connectionKey).toBe(created.connectionKey)
    expect(reattached.store.name).toBe('Legacy')
    expect(dataPlane.url).toBe(reattached.store.databaseUrl)
  })

  it('requires an owner when attaching an empty database', async () => {
    const { cp, provisioner } = setup()
    await provisioner.createDatabase('openpos-empty')
    await expect(cp.attachDatabase(provisioner, { slug: 'empty', databaseName: 'openpos-empty' })).rejects.toThrow(
      'no users',
    )
    const { store } = await cp.attachDatabase(provisioner, {
      slug: 'empty',
      databaseName: 'openpos-empty',
      owner: OWNER,
    })
    expect(store.name).toBe('empty')
  })

  it('updates, rotates keys, maps domains, migrates, and deletes', async () => {
    const { cp, provisioner } = setup()
    const { store, connectionKey } = await cp.createStore(provisioner, { name: 'Shop', slug: 'shop', owner: OWNER })

    const renamed = await cp.updateStore(store.id, { name: 'Shop 2', slug: 'shop-two', status: 'disabled' })
    expect(renamed).toMatchObject({ name: 'Shop 2', slug: 'shop-two', status: 'disabled' })

    const rotated = await cp.rotateConnectionKey(store.id)
    expect(rotated.connectionKey).not.toBe(connectionKey)
    expect(await cp.findStore({ key: connectionKey })).toBeNull()

    const withDomain = await cp.addDomain(store.id, 'POS.Example.com')
    expect(withDomain.domains).toEqual(['pos.example.com'])
    expect((await cp.findStore({ host: 'pos.example.com' }))?.id).toBe(store.id)
    await expect(cp.addDomain(store.id, 'not a host')).rejects.toThrow('valid hostname')
    expect((await cp.removeDomain(store.id, 'pos.example.com')).domains).toEqual([])

    expect((await cp.migrateStore(store.id)).appliedCount).toBe(0)
    expect((await cp.listStores()).map((item) => item.slug)).toEqual(['shop-two'])

    await cp.deleteStore(store.id, { provisioner, dropDatabase: true })
    expect(await cp.listStores()).toEqual([])
    expect(await provisioner.listDatabases()).toEqual([])
  })

  it('manages root users and the audit log', async () => {
    const { cp } = setup()
    expect(await cp.rootUserCount()).toBe(0)
    await cp.createRootUser('root@example.com', 'R00t!Password')
    await expect(cp.createRootUser('root@example.com', 'R00t!Password')).rejects.toThrow('already exists')
    expect(await cp.authenticateRoot('ROOT@example.com', 'R00t!Password')).toMatchObject({ email: 'root@example.com' })
    expect(await cp.authenticateRoot('root@example.com', 'wrong')).toBeNull()
    await cp.audit('root@example.com', 'store.create', 'demo')
    expect((await cp.recentAudit())[0]).toMatchObject({ action: 'store.create', target: 'demo' })
  })
})

describe('TursoPlatform', () => {
  it('maps Platform API responses and sends tokens as query parameters', async () => {
    const calls: Array<{ url: string; method: string }> = []
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, method: init?.method ?? 'GET' })
      if (url.endsWith('/databases') && (init?.method ?? 'GET') === 'GET') {
        return Response.json({
          databases: [
            {
              Name: 'openpos-a',
              DbId: '1',
              Hostname: 'openpos-a-acme.turso.io',
              group: 'default',
              regions: ['aws-us-east-1'],
            },
          ],
        })
      }
      if (url.endsWith('/databases/openpos-a')) {
        return Response.json({ database: { Name: 'openpos-a', Hostname: 'openpos-a-acme.turso.io' } })
      }
      if (url.endsWith('/databases/missing')) return Response.json({ error: 'not found' }, { status: 404 })
      if (url.includes('/auth/tokens')) return Response.json({ jwt: 'jwt-token' })
      if (url.endsWith('/databases') && init?.method === 'POST') {
        return Response.json({ error: 'database with name openpos-a already exists' }, { status: 409 })
      }
      return Response.json({})
    }) as typeof fetch

    const platform = new TursoPlatform({ apiToken: 't', org: 'acme', group: 'default', fetch: fakeFetch })
    expect((await platform.listDatabases())[0]).toMatchObject({
      name: 'openpos-a',
      hostname: 'openpos-a-acme.turso.io',
    })
    expect(await platform.getDatabase('missing')).toBeNull()
    await expect(platform.createDatabase('openpos-a')).rejects.toThrow('already exists')

    const provisioner = tursoProvisioner(platform)
    expect(await provisioner.connect('openpos-a')).toEqual({
      url: 'libsql://openpos-a-acme.turso.io',
      authToken: 'jwt-token',
    })
    expect(calls.find((call) => call.url.includes('/auth/tokens'))?.url).toContain(
      'expiration=never&authorization=full-access',
    )
  })
})
