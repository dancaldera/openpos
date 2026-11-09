/**
 * OpenPOS root admin: stores, their Turso databases, connection keys, and
 * domains. Server-rendered with hono/jsx so it runs unchanged on Workers
 * (src/worker.ts) and Node (src/index.ts).
 */

import { type ControlPlane, ControlPlaneError, secretsEqual } from '@openpos/control-plane'
import { type Context, Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { sign, verify } from 'hono/jwt'
import {
  type AdminEnv,
  type AdminServices,
  defaultServices,
  isPlatformHost,
  primaryWebHost,
  storeWebUrl,
} from './env.ts'
import {
  AttachStorePage,
  AuditPage,
  DatabasesPage,
  type DomainStatus,
  LoginPage,
  NewStorePage,
  PlatformPage,
  type RootUser,
  type ServiceCheck,
  SetupPage,
  StoreDetailPage,
  StoresPage,
} from './views.tsx'

const SESSION_COOKIE = 'openpos_admin'
const SESSION_SECONDS = 12 * 60 * 60
const PUBLIC_PATHS = new Set(['/login', '/setup', '/health'])

type AdminAppEnv = {
  Bindings: AdminEnv
  Variables: { root: RootUser; plane: ControlPlane }
}
type AdminContext = Context<AdminAppEnv>

function sessionSecret(env: AdminEnv): string {
  const secret = env.ADMIN_SESSION_SECRET?.trim()
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured')
  return secret
}

function field(form: Record<string, unknown>, name: string): string {
  const value = form[name]
  return typeof value === 'string' ? value.trim() : ''
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function withMessage(path: string, kind: 'notice' | 'error', message: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(message)}`
}

function flash(c: AdminContext) {
  return { notice: c.req.query('notice') ?? null, error: c.req.query('error') ?? null }
}

async function checkUrl(
  fetchImpl: typeof fetch,
  url: string,
): Promise<{ ok: boolean; detail: string; body?: unknown }> {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000) })
    const body = await response.json().catch(() => null)
    return { ok: response.ok, detail: `HTTP ${response.status}`, body }
  } catch (error) {
    return { ok: false, detail: messageOf(error) }
  }
}

export function createAdminApp(overrides: Partial<AdminServices> = {}) {
  const services = defaultServices(overrides)
  const app = new Hono<AdminAppEnv>()

  app.use('*', csrf())

  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.use('*', async (c, next) => {
    c.set('plane', services.controlPlane(c.env))
    if (PUBLIC_PATHS.has(c.req.path)) return next()
    const token = getCookie(c, SESSION_COOKIE)
    if (token) {
      try {
        const payload = await verify(token, sessionSecret(c.env), 'HS256')
        c.set('root', { id: String(payload.sub), email: String(payload.email) })
        return next()
      } catch {
        deleteCookie(c, SESSION_COOKIE, { path: '/' })
      }
    }
    return c.redirect('/login')
  })

  async function startSession(c: AdminContext, user: RootUser) {
    const now = Math.floor(Date.now() / 1000)
    const token = await sign(
      { sub: user.id, email: user.email, iat: now, exp: now + SESSION_SECONDS },
      sessionSecret(c.env),
      'HS256',
    )
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: new URL(c.req.url).protocol === 'https:',
      path: '/',
      maxAge: SESSION_SECONDS,
    })
  }

  /** Run a form action, then redirect with a notice or the error message. */
  async function act(c: AdminContext, back: string, action: () => Promise<string | { to: string; notice: string }>) {
    try {
      const result = await action()
      const target = typeof result === 'string' ? { to: back, notice: result } : result
      return c.redirect(withMessage(target.to, 'notice', target.notice))
    } catch (error) {
      if (!(error instanceof ControlPlaneError)) console.error('[admin]', error)
      return c.redirect(withMessage(back, 'error', messageOf(error)))
    }
  }

  const audit = (c: AdminContext, action: string, target: string | null) =>
    c.var.plane.audit(c.var.root.email, action, target)

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  app.get('/login', async (c) =>
    c.html(<LoginPage needsSetup={(await c.var.plane.rootUserCount()) === 0} error={c.req.query('error')} />),
  )

  app.post('/login', async (c) => {
    const form = await c.req.parseBody()
    const email = field(form, 'email')
    const user = await c.var.plane.authenticateRoot(email, String(form.password ?? ''))
    if (!user) {
      await c.var.plane.audit(email || null, 'root.login_failed', null)
      return c.html(<LoginPage needsSetup={false} email={email} error="Invalid email or password" />, 401)
    }
    await startSession(c, user)
    await c.var.plane.audit(user.email, 'root.login', null)
    return c.redirect('/')
  })

  app.post('/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.redirect('/login')
  })

  app.get('/setup', async (c) => {
    if ((await c.var.plane.rootUserCount()) > 0) return c.redirect('/login')
    return c.html(<SetupPage enabled={Boolean(c.env.ADMIN_SETUP_TOKEN?.trim())} error={c.req.query('error')} />)
  })

  app.post('/setup', async (c) => {
    if ((await c.var.plane.rootUserCount()) > 0) return c.redirect('/login')
    const expected = c.env.ADMIN_SETUP_TOKEN?.trim()
    const form = await c.req.parseBody()
    if (!expected || !(await secretsEqual(field(form, 'token'), expected))) {
      return c.html(<SetupPage enabled={Boolean(expected)} error="Invalid setup token" />, 403)
    }
    try {
      const user = await c.var.plane.createRootUser(field(form, 'email'), String(form.password ?? ''))
      await c.var.plane.audit(user.email, 'root.setup', user.email)
      await startSession(c, user)
      return c.redirect('/')
    } catch (error) {
      return c.html(<SetupPage enabled error={messageOf(error)} />, 400)
    }
  })

  // ---------------------------------------------------------------------------
  // Stores
  // ---------------------------------------------------------------------------

  app.get('/', async (c) => {
    const stores = await c.var.plane.listStores()
    return c.html(
      <StoresPage
        root={c.var.root}
        stores={stores.map((store) => ({ store, webUrl: storeWebUrl(c.env, store.slug) }))}
        provisioner={services.provisioner(c.env)?.description ?? null}
        {...flash(c)}
      />,
    )
  })

  app.get('/stores/new', (c) =>
    c.html(
      <NewStorePage
        root={c.var.root}
        provisioner={services.provisioner(c.env)?.description ?? null}
        values={c.req.query()}
        error={c.req.query('error')}
      />,
    ),
  )

  app.post('/stores', async (c) => {
    const form = await c.req.parseBody()
    const values = {
      name: field(form, 'name'),
      slug: field(form, 'slug'),
      databaseName: field(form, 'databaseName'),
      ownerName: field(form, 'ownerName'),
      ownerEmail: field(form, 'ownerEmail'),
    }
    const provisioner = services.provisioner(c.env)
    try {
      if (!provisioner) throw new ControlPlaneError('No database provisioner is configured')
      const { store } = await c.var.plane.createStore(provisioner, {
        name: values.name,
        slug: values.slug,
        databaseName: values.databaseName || undefined,
        owner: { name: values.ownerName, email: values.ownerEmail, password: String(form.ownerPassword ?? '') },
      })
      await audit(c, 'store.create', store.slug)
      const warning = await publishHosts(c.env, webHosts(c.env, store))
      return c.redirect(afterPublish(`/stores/${store.id}`, 'Store created', warning))
    } catch (error) {
      if (!(error instanceof ControlPlaneError)) console.error('[admin]', error)
      return c.html(
        <NewStorePage
          root={c.var.root}
          provisioner={provisioner?.description ?? null}
          values={values}
          error={messageOf(error)}
        />,
        400,
      )
    }
  })

  async function unassignedDatabases(c: AdminContext) {
    const provisioner = services.provisioner(c.env)
    if (!provisioner) return []
    const assigned = new Set((await c.var.plane.listStores()).map((store) => store.databaseName))
    return (await provisioner.listDatabases()).filter((database) => !assigned.has(database.name))
  }

  app.get('/stores/attach', async (c) => {
    let error = c.req.query('error') ?? null
    const databases = await unassignedDatabases(c).catch((cause) => {
      error = messageOf(cause)
      return []
    })
    return c.html(
      <AttachStorePage
        root={c.var.root}
        databases={databases}
        values={{ databaseName: c.req.query('database') ?? '' }}
        error={error}
      />,
    )
  })

  app.post('/stores/attach', async (c) => {
    const form = await c.req.parseBody()
    const values = {
      slug: field(form, 'slug'),
      name: field(form, 'name'),
      databaseName: field(form, 'databaseName'),
      url: field(form, 'url'),
      ownerName: field(form, 'ownerName'),
      ownerEmail: field(form, 'ownerEmail'),
    }
    const ownerPassword = String(form.ownerPassword ?? '')
    try {
      const { store } = await c.var.plane.attachDatabase(services.provisioner(c.env), {
        slug: values.slug,
        name: values.name || undefined,
        databaseName: values.databaseName || undefined,
        url: values.url || undefined,
        authToken: field(form, 'authToken') || undefined,
        owner:
          values.ownerName || values.ownerEmail || ownerPassword
            ? { name: values.ownerName, email: values.ownerEmail, password: ownerPassword }
            : undefined,
      })
      await audit(c, 'store.attach', store.slug)
      const warning = await publishHosts(c.env, webHosts(c.env, store))
      return c.redirect(afterPublish(`/stores/${store.id}`, 'Database attached', warning))
    } catch (error) {
      if (!(error instanceof ControlPlaneError)) console.error('[admin]', error)
      const databases = await unassignedDatabases(c).catch(() => [])
      return c.html(
        <AttachStorePage root={c.var.root} databases={databases} values={values} error={messageOf(error)} />,
        400,
      )
    }
  })

  async function domainStatuses(c: AdminContext, domains: string[]): Promise<DomainStatus[]> {
    const hostnames = services.customHostnames(c.env)
    return Promise.all(
      domains.map(async (hostname) => {
        const platform = isPlatformHost(c.env, hostname)
        if (platform) return { hostname, platform, status: await webHostStatus(c.env, hostname) }
        if (!hostnames) return { hostname, platform, status: null }
        const entry = await hostnames.find(hostname).catch((error) => ({ status: messageOf(error), sslStatus: null }))
        const status = entry ? `${entry.status}${entry.sslStatus ? ` · SSL ${entry.sslStatus}` : ''}` : 'Not registered'
        return { hostname, platform, status }
      }),
    )
  }

  /** Hosts served by the web Worker for a store: its subdomain plus assigned domains under a base domain. */
  function webHosts(env: AdminEnv, store: { slug: string; domains: string[] }): string[] {
    const primary = primaryWebHost(env, store.slug)
    return [...new Set([...(primary ? [primary] : []), ...store.domains.filter((d) => isPlatformHost(env, d))])]
  }

  /** Attach hosts to the web Worker. Returns a message when any could not be published. */
  async function publishHosts(env: AdminEnv, hosts: string[]): Promise<string | null> {
    const workerDomains = services.workerDomains(env)
    if (!workerDomains) return null
    const failures: string[] = []
    for (const host of hosts) {
      try {
        await workerDomains.attach(host)
      } catch (error) {
        failures.push(`${host}: ${messageOf(error)}`)
      }
    }
    return failures.length ? `Web address not published (${failures.join('; ')})` : null
  }

  async function unpublishHosts(env: AdminEnv, hosts: string[]): Promise<void> {
    const workerDomains = services.workerDomains(env)
    if (!workerDomains) return
    await Promise.all(hosts.map((host) => workerDomains.detach(host).catch(() => false)))
  }

  /** Null when web hosts are not managed here (local dev, or no Cloudflare credentials). */
  async function webHostStatus(env: AdminEnv, hostname: string): Promise<string | null> {
    const workerDomains = services.workerDomains(env)
    if (!workerDomains) return null
    try {
      const domain = await workerDomains.find(hostname)
      if (!domain) return 'Not published'
      return domain.service === workerDomains.service ? 'Published' : `Points to ${domain.service}`
    } catch (error) {
      return messageOf(error)
    }
  }

  function afterPublish(path: string, done: string, warning: string | null): string {
    return warning ? withMessage(path, 'error', `${done}. ${warning}`) : withMessage(path, 'notice', done)
  }
  app.get('/stores/:id', async (c) => {
    const plane = c.var.plane
    const store = await plane.getStore(c.req.param('id')).catch(() => null)
    if (!store) return c.redirect(withMessage('/', 'error', 'Store not found'))
    const primary = primaryWebHost(c.env, store.slug)
    const [inspection, domains, webStatus] = await Promise.all([
      plane.inspectStore(store.id),
      domainStatuses(c, store.domains),
      primary ? webHostStatus(c.env, primary) : null,
    ])
    return c.html(
      <StoreDetailPage
        root={c.var.root}
        store={store}
        inspection={inspection}
        webUrl={storeWebUrl(c.env, store.slug)}
        webStatus={webStatus}
        apiUrl={c.env.PUBLIC_API_URL?.trim() || null}
        domains={domains}
        customDomainTarget={c.env.CUSTOM_DOMAIN_TARGET?.trim() || null}
        canDropDatabase={Boolean(services.provisioner(c.env))}
        {...flash(c)}
      />,
    )
  })

  app.post('/stores/:id', async (c) => {
    const id = c.req.param('id')
    const form = await c.req.parseBody()
    const back = `/stores/${id}`
    try {
      const before = await c.var.plane.getStore(id)
      const store = await c.var.plane.updateStore(id, {
        name: field(form, 'name'),
        slug: field(form, 'slug'),
        status: field(form, 'status') === 'disabled' ? 'disabled' : 'active',
      })
      await audit(c, 'store.update', store.slug)
      let warning: string | null = null
      if (before.slug !== store.slug) {
        const oldHost = primaryWebHost(c.env, before.slug)
        if (oldHost) await unpublishHosts(c.env, [oldHost])
        const newHost = primaryWebHost(c.env, store.slug)
        warning = newHost ? await publishHosts(c.env, [newHost]) : null
      }
      return c.redirect(afterPublish(back, 'Store saved', warning))
    } catch (error) {
      if (!(error instanceof ControlPlaneError)) console.error('[admin]', error)
      return c.redirect(withMessage(back, 'error', messageOf(error)))
    }
  })

  app.post('/stores/:id/publish', async (c) => {
    const id = c.req.param('id')
    return act(c, `/stores/${id}`, async () => {
      const store = await c.var.plane.getStore(id)
      if (!services.workerDomains(c.env)) {
        throw new ControlPlaneError('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to publish web addresses')
      }
      const warning = await publishHosts(c.env, webHosts(c.env, store))
      if (warning) throw new ControlPlaneError(warning)
      await audit(c, 'store.publish', store.slug)
      return 'Web address published'
    })
  })

  app.post('/stores/:id/rotate-key', async (c) => {
    const id = c.req.param('id')
    return act(c, `/stores/${id}`, async () => {
      const { store } = await c.var.plane.rotateConnectionKey(id)
      await audit(c, 'store.rotate_key', store.slug)
      return 'New connection key issued. Devices using the old key must reconnect.'
    })
  })

  app.post('/stores/:id/migrate', async (c) => {
    const id = c.req.param('id')
    return act(c, `/stores/${id}`, async () => {
      const result = await c.var.plane.migrateStore(id)
      const store = await c.var.plane.getStore(id)
      await audit(c, 'store.migrate', store.slug)
      return result.appliedCount ? `Applied ${result.appliedCount} migration(s)` : 'Schema is already up to date'
    })
  })

  app.post('/stores/:id/domains', async (c) => {
    const id = c.req.param('id')
    const form = await c.req.parseBody()
    return act(c, `/stores/${id}`, async () => {
      const before = await c.var.plane.getStore(id)
      const store = await c.var.plane.addDomain(id, field(form, 'hostname'))
      const added = store.domains.find((domain) => !before.domains.includes(domain))
      const hostnames = services.customHostnames(c.env)
      const workerDomains = services.workerDomains(c.env)
      const platform = added ? isPlatformHost(c.env, added) : false
      const register = added
        ? platform
          ? workerDomains && (() => workerDomains.attach(added))
          : hostnames && (() => hostnames.create(added))
        : null
      if (added && register) {
        try {
          await register()
        } catch (error) {
          await c.var.plane.removeDomain(id, added)
          throw new ControlPlaneError(`Cloudflare rejected ${added}: ${messageOf(error)}`)
        }
      }
      if (added) await audit(c, 'store.domain_add', `${store.slug} ${added}`)
      return added ? `${added} added` : 'Domain already assigned'
    })
  })

  app.post('/stores/:id/domains/remove', async (c) => {
    const id = c.req.param('id')
    const form = await c.req.parseBody()
    const hostname = field(form, 'hostname').toLowerCase()
    return act(c, `/stores/${id}`, async () => {
      const store = await c.var.plane.removeDomain(id, hostname)
      const hostnames = services.customHostnames(c.env)
      if (isPlatformHost(c.env, hostname)) {
        if (hostname !== primaryWebHost(c.env, store.slug)) await unpublishHosts(c.env, [hostname])
      } else if (hostnames) {
        await hostnames.remove(hostname)
      }
      await audit(c, 'store.domain_remove', `${store.slug} ${hostname}`)
      return `${hostname} removed`
    })
  })

  app.post('/stores/:id/delete', async (c) => {
    const id = c.req.param('id')
    const form = await c.req.parseBody()
    return act(c, `/stores/${id}`, async () => {
      const store = await c.var.plane.getStore(id)
      if (field(form, 'confirm') !== store.slug) throw new ControlPlaneError('Type the store address to confirm')
      const dropDatabase = field(form, 'dropDatabase') === '1'
      const hostnames = services.customHostnames(c.env)
      await c.var.plane.deleteStore(id, { provisioner: services.provisioner(c.env) ?? undefined, dropDatabase })
      await unpublishHosts(c.env, webHosts(c.env, store))
      if (hostnames) {
        for (const domain of store.domains) {
          if (!isPlatformHost(c.env, domain)) await hostnames.remove(domain).catch(() => false)
        }
      }
      await audit(c, dropDatabase ? 'store.delete_with_database' : 'store.delete', store.slug)
      return { to: '/', notice: `${store.name} deleted` }
    })
  })

  // ---------------------------------------------------------------------------
  // Databases, platform, audit
  // ---------------------------------------------------------------------------

  app.get('/databases', async (c) => {
    const provisioner = services.provisioner(c.env)
    let { error, notice } = flash(c)
    let databases: Awaited<ReturnType<NonNullable<typeof provisioner>['listDatabases']>> = []
    const stores = await c.var.plane.listStores()
    if (provisioner) {
      databases = await provisioner.listDatabases().catch((cause) => {
        error = messageOf(cause)
        notice = null
        return []
      })
    }
    const byDatabase = new Map(stores.map((store) => [store.databaseName, store]))
    return c.html(
      <DatabasesPage
        root={c.var.root}
        provisioner={provisioner?.description ?? null}
        databases={databases.map((database) => ({ ...database, store: byDatabase.get(database.name) ?? null }))}
        error={error}
        notice={notice}
      />,
    )
  })

  app.post('/databases', async (c) => {
    const form = await c.req.parseBody()
    return act(c, '/databases', async () => {
      const provisioner = services.provisioner(c.env)
      if (!provisioner) throw new ControlPlaneError('No database provisioner is configured')
      const database = await provisioner.createDatabase(field(form, 'name').toLowerCase())
      await audit(c, 'database.create', database.name)
      return `${database.name} created`
    })
  })

  app.get('/platform', async (c) => {
    const env = c.env
    const apiUrl = env.PUBLIC_API_URL?.trim().replace(/\/+$/, '') || null
    const releasesUrl = env.RELEASES_URL?.trim().replace(/\/+$/, '') || null
    const provisioner = services.provisioner(env)
    const hostnames = services.customHostnames(env)
    const workerDomains = services.workerDomains(env)

    const [api, releases] = await Promise.all([
      apiUrl ? checkUrl(services.fetch, `${apiUrl}/api/health`) : null,
      releasesUrl ? checkUrl(services.fetch, `${releasesUrl}/releases/latest.json`) : null,
    ])
    const releaseVersion = (releases?.body as { version?: string } | null)?.version
    const checks: ServiceCheck[] = [
      { name: 'API', target: apiUrl, ok: api?.ok ?? null, detail: api?.detail ?? 'Set PUBLIC_API_URL' },
      {
        name: 'Releases',
        target: releasesUrl,
        ok: releases?.ok ?? null,
        detail: releases
          ? `${releases.detail}${releaseVersion ? ` · latest ${releaseVersion}` : ''}`
          : 'Set RELEASES_URL',
      },
      {
        name: 'Databases',
        target: provisioner?.description ?? null,
        ok: provisioner ? true : null,
        detail: provisioner ? 'Configured' : 'Attach by URL only',
      },
      {
        name: 'Store web addresses',
        target: workerDomains ? `Workers Custom Domains on ${workerDomains.service}` : null,
        ok: workerDomains ? true : null,
        detail: workerDomains ? 'Configured' : 'Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID',
      },
      {
        name: 'Custom domains',
        target: hostnames ? 'Cloudflare for SaaS' : null,
        ok: hostnames ? true : null,
        detail: hostnames ? 'Configured' : 'Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID',
      },
    ]
    const settings: Array<[string, string]> = [
      ['Store base domains', env.STORE_BASE_DOMAINS?.trim() || 'none'],
      ['Store web address', storeWebUrl(env, '{slug}') ?? 'none'],
      ['Custom domain CNAME target', env.CUSTOM_DOMAIN_TARGET?.trim() || 'none'],
      ['Stores', String((await c.var.plane.listStores()).length)],
    ]
    return c.html(<PlatformPage root={c.var.root} checks={checks} settings={settings} />)
  })

  app.get('/audit', async (c) => c.html(<AuditPage root={c.var.root} entries={await c.var.plane.recentAudit(200)} />))

  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse()
    console.error('[admin] Unhandled error:', error)
    return c.text(`Admin error: ${error.message}`, 500)
  })

  return app
}
