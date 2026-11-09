import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { ControlPlane, type DataPlaneConfig } from '@openpos/control-plane'
import { localProvisioner } from '@openpos/control-plane/local'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAdminApp } from './app.tsx'
import { CloudflareCustomHostnames, CloudflareWorkerDomains } from './cloudflare.ts'
import {
  type AdminEnv,
  defaultCustomHostnames,
  defaultProvisioner,
  defaultWorkerDomains,
  isPlatformHost,
  primaryWebHost,
  storeWebUrl,
} from './env.ts'

const ROOT = { email: 'root@example.com', password: 'R00t!Password' }
const OWNER = { ownerName: 'Ana Owner', ownerEmail: 'ana@example.com', ownerPassword: 'Str0ng!Pass' }

let dir: string
let plane: ControlPlane
let cfHostnames: Map<string, string>
let workerHosts: Map<string, { id: string; service: string }>
let failFind: boolean
let requests: string[]

const env: AdminEnv = {
  ADMIN_SESSION_SECRET: 'session-secret',
  ADMIN_SETUP_TOKEN: 'setup-token',
  STORE_BASE_DOMAINS: 'openpos.xyz',
  PUBLIC_API_URL: 'https://api.openpos.xyz',
  RELEASES_URL: 'https://releases.openpos.xyz',
  CUSTOM_DOMAIN_TARGET: 'stores.openpos.xyz',
}

const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input))
  const method = init?.method ?? 'GET'
  requests.push(`${method} ${url.pathname}${url.search}`)
  if (url.hostname === 'api.openpos.xyz') return Response.json({ status: 'ok' })
  if (url.hostname === 'releases.openpos.xyz') return Response.json({ version: '0.3.11' })
  if (url.pathname.endsWith('/workers/domains') && method === 'GET') {
    if (failFind) return Response.json({ success: false, errors: [{ message: 'lookup failed' }] }, { status: 500 })
    const hostname = url.searchParams.get('hostname') ?? ''
    const entry = workerHosts.get(hostname)
    return Response.json({ success: true, result: entry ? [{ ...entry, hostname }] : [] })
  }
  if (url.pathname.endsWith('/workers/domains') && method === 'PUT') {
    const { hostname, service, zone_name } = JSON.parse(String(init?.body))
    if (hostname.startsWith('fail.')) {
      return Response.json({ success: false, errors: [{ message: 'hostname not allowed' }] }, { status: 400 })
    }
    expect(zone_name).toBe('openpos.xyz')
    workerHosts.set(hostname, { id: `wd-${hostname}`, service })
    return Response.json({ success: true, result: { id: `wd-${hostname}`, hostname, service } })
  }
  if (url.pathname.includes('/workers/domains/') && method === 'DELETE') {
    for (const [hostname, entry] of workerHosts) if (url.pathname.endsWith(`/${entry.id}`)) workerHosts.delete(hostname)
    return Response.json({ success: true, result: null })
  }
  if (url.pathname.endsWith('/custom_hostnames') && method === 'GET') {
    const hostname = url.searchParams.get('hostname') ?? ''
    const id = cfHostnames.get(hostname)
    return Response.json({
      success: true,
      result: id ? [{ id, hostname, status: 'pending', ssl: { status: 'pending_validation' } }] : [],
    })
  }
  if (url.pathname.endsWith('/custom_hostnames') && method === 'POST') {
    const { hostname } = JSON.parse(String(init?.body))
    if (hostname === 'blocked.example.com') {
      return Response.json({ success: false, errors: [{ message: 'hostname not allowed' }] }, { status: 400 })
    }
    cfHostnames.set(hostname, `cf-${hostname}`)
    return Response.json({ success: true, result: { id: `cf-${hostname}`, hostname, status: 'pending' } })
  }
  if (method === 'DELETE') {
    for (const [hostname, id] of cfHostnames) if (url.pathname.endsWith(`/${id}`)) cfHostnames.delete(hostname)
    return Response.json({ success: true, result: {} })
  }
  return Response.json({ success: false }, { status: 404 })
}) as typeof fetch

function makeApp(options: { provisioner?: boolean; workerDomains?: boolean } = {}) {
  const provisioner = localProvisioner(join(dir, 'stores'))
  const workerDomains = new CloudflareWorkerDomains({
    apiToken: 't',
    accountId: 'acct',
    service: 'openpos-web',
    zoneName: 'openpos.xyz',
    fetch: fakeFetch,
  })
  return createAdminApp({
    controlPlane: () => plane,
    provisioner: () => (options.provisioner === false ? null : provisioner),
    customHostnames: () => new CloudflareCustomHostnames({ apiToken: 't', zoneId: 'zone', fetch: fakeFetch }),
    workerDomains: () => (options.workerDomains ? workerDomains : null),
    fetch: fakeFetch,
  })
}

type App = ReturnType<typeof makeApp>

function client(app: App, testEnv: AdminEnv = env) {
  let cookie = ''
  const send = async (path: string, init: RequestInit = {}) => {
    const response = await app.request(
      path,
      { ...init, headers: { Origin: 'http://localhost', ...(cookie ? { Cookie: cookie } : {}), ...init.headers } },
      testEnv,
    )
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0].endsWith('=') ? '' : setCookie.split(';')[0]
    return response
  }
  return {
    get: (path: string) => send(path),
    post: (path: string, fields: Record<string, string> = {}) =>
      send(path, { method: 'POST', body: new URLSearchParams(fields) }),
    get cookie() {
      return cookie
    },
  }
}

async function signedIn(app: App = makeApp()) {
  await plane.createRootUser(ROOT.email, ROOT.password)
  const http = client(app)
  const response = await http.post('/login', ROOT)
  expect(response.status).toBe(302)
  return http
}

function location(response: Response): string {
  return decodeURIComponent(response.headers.get('location') ?? '')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'openpos-admin-'))
  cfHostnames = new Map()
  workerHosts = new Map()
  failFind = false
  requests = []
  plane = new ControlPlane({
    db: createClient({ url: `file:${join(dir, 'control.sqlite')}` }),
    secretsKey: 'cp-secret',
    openStoreDb: (config: DataPlaneConfig) => createClient(config),
    baseDomains: ['openpos.xyz'],
  })
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('admin session', () => {
  it('redirects to login, offers setup, and creates the first root user with the setup token', async () => {
    const http = client(makeApp())
    expect((await http.get('/health')).status).toBe(200)
    expect(location(await http.get('/'))).toBe('/login')
    expect(await (await http.get('/login')).text()).toContain('/setup')

    expect(await (await http.get('/setup')).text()).toContain('Setup token')
    expect((await http.post('/setup', { token: 'wrong', email: ROOT.email, password: ROOT.password })).status).toBe(403)
    expect((await http.post('/setup', { token: 'setup-token', email: ROOT.email, password: 'weak' })).status).toBe(400)
    const created = await http.post('/setup', { token: 'setup-token', ...ROOT })
    expect(location(created)).toBe('/')
    expect(http.cookie).toMatch(/^openpos_admin=/)
    expect((await http.get('/')).status).toBe(200)

    expect(location(await http.get('/setup'))).toBe('/login')
    expect(location(await http.post('/setup', { token: 'setup-token', ...ROOT }))).toBe('/login')
  })

  it('disables setup without a token, rejects bad logins and tampered cookies, and signs out', async () => {
    const app = makeApp()
    const noToken = client(app, { ...env, ADMIN_SETUP_TOKEN: '' })
    expect(await (await noToken.get('/setup')).text()).toContain('Set the')
    expect((await noToken.post('/setup', { token: '', ...ROOT })).status).toBe(403)

    await plane.createRootUser(ROOT.email, ROOT.password)
    const http = client(app)
    expect((await http.post('/login', { email: ROOT.email, password: 'nope' })).status).toBe(401)
    const tampered = await app.request('/', { headers: { Cookie: 'openpos_admin=bad.token.value' } }, env)
    expect(tampered.headers.get('location')).toBe('/login')

    await http.post('/login', ROOT)
    expect(location(await http.post('/logout'))).toBe('/login')
    expect(location(await http.get('/'))).toBe('/login')
    expect((await plane.recentAudit()).map((entry) => entry.action)).toEqual(['root.login', 'root.login_failed'])
  })

  it('rejects cross-site form posts', async () => {
    const response = await makeApp().request(
      '/login',
      { method: 'POST', body: new URLSearchParams(ROOT), headers: { Origin: 'https://evil.example' } },
      env,
    )
    expect(response.status).toBe(403)
  })

  it('fails closed without a session secret', async () => {
    await plane.createRootUser(ROOT.email, ROOT.password)
    const http = client(makeApp(), { ...env, ADMIN_SESSION_SECRET: '' })
    expect((await http.post('/login', ROOT)).status).toBe(500)
  })
})

describe('admin stores', () => {
  it('creates a store, shows its key, and manages settings, keys, migrations, domains, and deletion', async () => {
    const http = await signedIn()
    expect(await (await http.get('/stores/new')).text()).toContain('Create store')

    const invalid = await http.post('/stores', { name: 'Demo', slug: 'api', ...OWNER })
    expect(invalid.status).toBe(400)
    expect(await invalid.text()).toContain('reserved')

    const created = await http.post('/stores', { name: 'Demo Store', slug: 'demo', ...OWNER })
    const detailPath = location(created).split('?')[0]
    expect(detailPath).toMatch(/^\/stores\/[0-9a-f-]+$/)
    const [store] = await plane.listStores()

    const detail = await (await http.get(detailPath)).text()
    expect(detail).toContain(store.connectionKey)
    expect(detail).toContain('https://demo.openpos.xyz')
    expect(detail).toContain('Up to date')
    expect(await (await http.get('/')).text()).toContain('Demo Store')

    expect(location(await http.post(detailPath, { name: 'Demo 2', slug: 'demo', status: 'disabled' }))).toContain(
      'Store saved',
    )
    expect((await plane.getStore(store.id)).status).toBe('disabled')
    expect(location(await http.post(detailPath, { name: '', slug: 'demo' }))).toContain('error=Store name is required')

    await http.post(`${detailPath}/rotate-key`)
    expect((await plane.getStore(store.id)).connectionKey).not.toBe(store.connectionKey)
    expect(location(await http.post(`${detailPath}/migrate`))).toContain('already up to date')

    await http.post(`${detailPath}/domains`, { hostname: 'shop.openpos.xyz' })
    await http.post(`${detailPath}/domains`, { hostname: 'POS.Example.com' })
    expect(location(await http.post(`${detailPath}/domains`, { hostname: 'pos.example.com' }))).toContain('already')
    expect(location(await http.post(`${detailPath}/domains`, { hostname: 'blocked.example.com' }))).toContain(
      'Cloudflare rejected blocked.example.com: hostname not allowed',
    )
    expect((await plane.getStore(store.id)).domains).toEqual(['pos.example.com', 'shop.openpos.xyz'])
    expect([...cfHostnames.keys()]).toEqual(['pos.example.com'])
    const withDomains = await (await http.get(detailPath)).text()
    expect(withDomains).toContain('Platform domain')
    expect(withDomains).toContain('pending · SSL pending_validation')

    await http.post(`${detailPath}/domains/remove`, { hostname: 'pos.example.com' })
    expect(cfHostnames.size).toBe(0)

    expect(location(await http.post(`${detailPath}/delete`, { confirm: 'nope' }))).toContain('error=Type the store')
    expect(location(await http.post(`${detailPath}/delete`, { confirm: 'demo', dropDatabase: '1' }))).toBe(
      '/?notice=Demo 2 deleted',
    )
    expect(await plane.listStores()).toEqual([])
    expect(location(await http.get(detailPath))).toContain('Store not found')

    const audit = await (await http.get('/audit')).text()
    for (const action of [
      'store.create',
      'store.update',
      'store.rotate_key',
      'store.migrate',
      'store.domain_add',
      'store.domain_remove',
      'store.delete_with_database',
    ]) {
      expect(audit).toContain(action)
    }
  })

  it('lists databases, creates empty ones, and attaches them to stores', async () => {
    const http = await signedIn()
    expect(location(await http.post('/databases', { name: 'openpos-aldo' }))).toContain('openpos-aldo created')
    expect(location(await http.post('/databases', { name: 'Bad Name!' }))).toContain('error=')

    const list = await (await http.get('/databases')).text()
    expect(list).toContain('/stores/attach?database=openpos-aldo')

    const attachForm = await (await http.get('/stores/attach?database=openpos-aldo')).text()
    expect(attachForm).toContain('<option value="openpos-aldo" selected="">')

    const missingOwner = await http.post('/stores/attach', { slug: 'aldo', databaseName: 'openpos-aldo' })
    expect(missingOwner.status).toBe(400)
    expect(await missingOwner.text()).toContain('no users')

    const attached = await http.post('/stores/attach', {
      slug: 'aldo',
      name: 'Aldo',
      databaseName: 'openpos-aldo',
      ...OWNER,
    })
    expect(location(attached)).toContain('Database attached')
    expect(await (await http.get('/databases')).text()).toContain('>Aldo</a>')
    expect(await (await http.get('/stores/attach')).text()).not.toContain('openpos-aldo')
  })

  it('never offers or attaches the admin control plane database', async () => {
    const reservedEnv: AdminEnv = { ...env, CONTROL_PLANE_URL: 'libsql://localhost' }
    const app = makeApp()
    await plane.createRootUser(ROOT.email, ROOT.password)
    const http = client(app, reservedEnv)
    await http.post('/login', ROOT)
    expect(location(await http.post('/databases', { name: 'openpos-control' }))).toContain('openpos-control created')

    expect(await (await http.get('/stores/attach')).text()).not.toContain('<option value="openpos-control"')
    const byName = await http.post('/stores/attach', { slug: 'cp', databaseName: 'openpos-control', ...OWNER })
    expect(byName.status).toBe(400)
    expect(await byName.text()).toContain('admin database')
    const byUrl = await http.post('/stores/attach', { slug: 'cp', url: 'libsql://localhost', ...OWNER })
    expect(byUrl.status).toBe(400)
    expect(await byUrl.text()).toContain('admin database')
    expect(await plane.listStores()).toEqual([])
  })

  it('explains what to configure when no provisioner is available', async () => {
    const http = await signedIn(makeApp({ provisioner: false }))
    expect(await (await http.get('/stores/new')).text()).toContain('TURSO_API_TOKEN')
    expect(await (await http.get('/databases')).text()).toContain('TURSO_ORG')
    expect((await http.post('/stores', { name: 'X', slug: 'x', ...OWNER })).status).toBe(400)
    expect(location(await http.post('/databases', { name: 'x' }))).toContain('No database provisioner')
  })

  it('reports platform services', async () => {
    const http = await signedIn()
    const page = await (await http.get('/platform')).text()
    expect(page).toContain('latest 0.3.11')
    expect(page).toContain('https://{slug}.openpos.xyz')
    expect(requests).toContain('GET /api/health')
  })
})

describe('store web addresses', () => {
  it('publishes store hosts as Workers Custom Domains and keeps them in sync', async () => {
    const http = await signedIn(makeApp({ workerDomains: true }))

    const created = await http.post('/stores', { name: 'Demo', slug: 'demo', ...OWNER })
    expect(location(created)).toContain('notice=Store created')
    expect([...workerHosts.keys()]).toEqual(['demo.openpos.xyz'])
    const detailPath = location(created).split('?')[0]
    expect(await (await http.get(detailPath)).text()).toContain('(Published)')

    await http.post(`${detailPath}/domains`, { hostname: 'shop.openpos.xyz' })
    expect(workerHosts.has('shop.openpos.xyz')).toBe(true)
    expect(await (await http.get(detailPath)).text()).toContain('Platform domain · Published')
    expect(location(await http.post(`${detailPath}/domains`, { hostname: 'fail.openpos.xyz' }))).toContain(
      'Cloudflare rejected fail.openpos.xyz: hostname not allowed',
    )
    const [store] = await plane.listStores()
    expect(store.domains).toEqual(['shop.openpos.xyz'])

    expect(location(await http.post(detailPath, { name: 'Demo', slug: 'demo2', status: 'active' }))).toContain(
      'notice=Store saved',
    )
    expect([...workerHosts.keys()].sort()).toEqual(['demo2.openpos.xyz', 'shop.openpos.xyz'])

    workerHosts.delete('demo2.openpos.xyz')
    const unpublished = await (await http.get(detailPath)).text()
    expect(unpublished).toContain('(Not published)')
    expect(unpublished).toContain('Publish web address')
    expect(location(await http.post(`${detailPath}/publish`))).toContain('notice=Web address published')
    expect(workerHosts.has('demo2.openpos.xyz')).toBe(true)

    workerHosts.set('demo2.openpos.xyz', { id: 'other', service: 'openpos-landing' })
    expect(await (await http.get(detailPath)).text()).toContain('Points to openpos-landing')
    failFind = true
    expect(await (await http.get(detailPath)).text()).toContain('lookup failed')
    failFind = false

    await http.post(`${detailPath}/domains/remove`, { hostname: 'shop.openpos.xyz' })
    expect(workerHosts.has('shop.openpos.xyz')).toBe(false)

    await http.post(`${detailPath}/delete`, { confirm: 'demo2' })
    // A host that points at another Worker is left alone.
    expect([...workerHosts.keys()]).toEqual(['demo2.openpos.xyz'])

    const platform = await (await http.get('/platform')).text()
    expect(platform).toContain('Workers Custom Domains on openpos-web')
  })

  it('reports hosts that could not be published', async () => {
    const http = await signedIn(makeApp({ workerDomains: true }))
    const created = await http.post('/stores', { name: 'Fail', slug: 'fail', ...OWNER })
    expect(location(created)).toContain(
      'error=Store created. Web address not published (fail.openpos.xyz: hostname not allowed)',
    )
    const detailPath = location(created).split('?')[0]
    expect(location(await http.post(`${detailPath}/publish`))).toContain('error=Web address not published')
    expect(location(await http.post(detailPath, { name: 'Fail', slug: 'fail', status: 'active' }))).toContain(
      'notice=Store saved',
    )
    expect(location(await http.post(detailPath, { name: '', slug: 'other' }))).toContain('error=Store name is required')
  })

  it('needs Cloudflare credentials to publish', async () => {
    const http = await signedIn()
    const created = await http.post('/stores', { name: 'Demo', slug: 'demo', ...OWNER })
    const detailPath = location(created).split('?')[0]
    expect(location(await http.post(`${detailPath}/publish`))).toContain('error=Set CLOUDFLARE_API_TOKEN')
    expect(await (await http.get('/platform')).text()).toContain('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID')
  })
})
describe('admin env helpers', () => {
  it('builds providers only when configured and derives store URLs', () => {
    expect(defaultProvisioner({})).toBeNull()
    expect(defaultProvisioner({ TURSO_API_TOKEN: 't', TURSO_ORG: 'acme' })?.description).toContain('"acme"')
    expect(defaultCustomHostnames({})).toBeNull()
    expect(defaultCustomHostnames({ CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ZONE_ID: 'z' })).toBeInstanceOf(
      CloudflareCustomHostnames,
    )
    expect(defaultWorkerDomains({ CLOUDFLARE_API_TOKEN: 't' })).toBeNull()
    const workerDomains = defaultWorkerDomains({ CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' })
    expect(workerDomains).toBeInstanceOf(CloudflareWorkerDomains)
    expect(workerDomains?.service).toBe('openpos-web')
    expect(
      defaultWorkerDomains({ CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a', WEB_WORKER_NAME: 'w' })?.service,
    ).toBe('w')
    expect(primaryWebHost({}, 'demo')).toBeNull()
    expect(primaryWebHost({ STORE_BASE_DOMAINS: 'pos.example.com,localhost' }, 'demo')).toBe('demo.pos.example.com')
    expect(storeWebUrl({}, 'demo')).toBeNull()
    expect(storeWebUrl({ STORE_WEB_URL_TEMPLATE: 'http://{slug}.localhost:5173' }, 'demo')).toBe(
      'http://demo.localhost:5173',
    )
    expect(isPlatformHost({ STORE_BASE_DOMAINS: 'openpos.xyz' }, 'a.openpos.xyz')).toBe(true)
    expect(isPlatformHost({ STORE_BASE_DOMAINS: 'openpos.xyz' }, 'evilopenpos.xyz')).toBe(false)
  })
})
