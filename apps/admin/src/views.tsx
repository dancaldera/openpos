import type { AuditEntry, ProvisionedDatabase, StoreInspection, StoreRecord } from '@openpos/control-plane'
import type { Child, FC, PropsWithChildren } from 'hono/jsx'

const STYLES = `
:root { color-scheme: light dark; --bg: #f6f7f9; --panel: #fff; --text: #1d2330; --muted: #667085; --line: #e3e6eb;
  --accent: #2459d6; --danger: #c62828; --ok: #1b7f3b; --warn: #b26a00; }
@media (prefers-color-scheme: dark) { :root { --bg: #11141a; --panel: #191d25; --text: #e8eaf0; --muted: #98a2b3;
  --line: #2a303b; --accent: #6b93ff; --danger: #ff6b6b; --ok: #4cc77a; --warn: #f0b247; } }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.5 system-ui, sans-serif; background: var(--bg); color: var(--text); }
header { display: flex; gap: 20px; align-items: center; padding: 12px 24px; background: var(--panel); border-bottom: 1px solid var(--line); }
header strong { margin-right: 12px; }
header nav { display: flex; gap: 16px; flex: 1; }
header form { margin: 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
main { max-width: 1040px; margin: 0 auto; padding: 24px; }
h1 { font-size: 22px; margin: 0 0 16px; }
h2 { font-size: 16px; margin: 0 0 12px; }
section { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 18px; margin-bottom: 18px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; font-size: 13px; }
label { display: block; margin-bottom: 12px; font-size: 13px; color: var(--muted); }
input, select { display: block; width: 100%; margin-top: 4px; padding: 8px 10px; font: inherit; color: var(--text);
  background: var(--bg); border: 1px solid var(--line); border-radius: 6px; }
input[type=checkbox] { display: inline; width: auto; margin: 0 6px 0 0; }
button { font: inherit; padding: 8px 14px; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; }
button.secondary { background: transparent; color: var(--accent); }
button.danger { background: var(--danger); border-color: var(--danger); }
button.link { background: none; border: none; color: var(--muted); padding: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0 16px; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.muted { color: var(--muted); font-size: 13px; }
.notice, .error { padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; }
.notice { background: color-mix(in srgb, var(--ok) 12%, transparent); color: var(--ok); }
.error { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }
.badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; border: 1px solid currentColor; }
.ok { color: var(--ok); } .warn { color: var(--warn); } .bad { color: var(--danger); }
code, .key { font-family: ui-monospace, monospace; font-size: 13px; }
.key { padding: 10px 12px; background: var(--bg); border: 1px dashed var(--line); border-radius: 6px; user-select: all; word-break: break-all; }
.auth { max-width: 380px; margin: 10vh auto; }
`

export interface RootUser {
  id: string
  email: string
}

interface LayoutProps {
  title: string
  root?: RootUser | null
  notice?: string | null
  error?: string | null
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({ title, root, notice, error, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>{`${title} · OpenPOS Admin`}</title>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
    </head>
    <body>
      {root ? (
        <header>
          <strong>OpenPOS Admin</strong>
          <nav>
            <a href="/">Stores</a>
            <a href="/databases">Databases</a>
            <a href="/platform">Platform</a>
            <a href="/audit">Audit log</a>
          </nav>
          <span class="muted">{root.email}</span>
          <form method="post" action="/logout">
            <button type="submit" class="link">
              Sign out
            </button>
          </form>
        </header>
      ) : null}
      <main class={root ? '' : 'auth'}>
        {notice ? <div class="notice">{notice}</div> : null}
        {error ? <div class="error">{error}</div> : null}
        {children}
      </main>
    </body>
  </html>
)

export const LoginPage: FC<{ error?: string | null; needsSetup: boolean; email?: string }> = ({
  error,
  needsSetup,
  email,
}) => (
  <Layout title="Sign in" error={error}>
    <section>
      <h1>OpenPOS Admin</h1>
      {needsSetup ? (
        <p>
          No root users yet. <a href="/setup">Create the first root user</a>.
        </p>
      ) : null}
      <form method="post" action="/login">
        <label>
          Email
          <input type="email" name="email" value={email ?? ''} required autocomplete="username" />
        </label>
        <label>
          Password
          <input type="password" name="password" required autocomplete="current-password" />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </section>
  </Layout>
)

export const SetupPage: FC<{ error?: string | null; enabled: boolean }> = ({ error, enabled }) => (
  <Layout title="Setup" error={error}>
    <section>
      <h1>Create the first root user</h1>
      {enabled ? (
        <form method="post" action="/setup">
          <label>
            Setup token (ADMIN_SETUP_TOKEN)
            <input type="password" name="token" required />
          </label>
          <label>
            Email
            <input type="email" name="email" required autocomplete="username" />
          </label>
          <label>
            Password
            <input type="password" name="password" required autocomplete="new-password" />
          </label>
          <button type="submit">Create root user</button>
        </form>
      ) : (
        <p>
          Set the <code>ADMIN_SETUP_TOKEN</code> secret on the admin Worker, then reload this page.
        </p>
      )}
    </section>
  </Layout>
)

const StatusBadge: FC<{ status: string }> = ({ status }) => (
  <span class={`badge ${status === 'active' ? 'ok' : 'bad'}`}>{status}</span>
)

export interface StoreRow {
  store: StoreRecord
  webUrl: string | null
}

export const StoresPage: FC<{
  root: RootUser
  stores: StoreRow[]
  provisioner: string | null
  notice?: string | null
  error?: string | null
}> = ({ root, stores, provisioner, notice, error }) => (
  <Layout title="Stores" root={root} notice={notice} error={error}>
    <div class="row" style="justify-content: space-between; margin-bottom: 16px">
      <h1 style="margin: 0">Stores</h1>
      <div class="row">
        <a href="/stores/attach">
          <button type="button" class="secondary">
            Attach existing database
          </button>
        </a>
        <a href="/stores/new">
          <button type="button">New store</button>
        </a>
      </div>
    </div>
    <section>
      {stores.length === 0 ? (
        <p class="muted">No stores yet. Create one to get a connection key for its POS devices.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Web</th>
              <th>Database</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {stores.map(({ store, webUrl }) => (
              <tr>
                <td>
                  <a href={`/stores/${store.id}`}>{store.name}</a>
                  <div class="muted">{store.slug}</div>
                </td>
                <td>
                  {webUrl ? <a href={webUrl}>{webUrl.replace(/^https?:\/\//, '')}</a> : null}
                  {store.domains.map((domain) => (
                    <div class="muted">{domain}</div>
                  ))}
                </td>
                <td>
                  <code>{store.databaseName}</code>
                </td>
                <td>
                  <StatusBadge status={store.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
    <p class="muted">Databases: {provisioner ?? 'no provisioner configured (attach databases by URL)'}</p>
  </Layout>
)

type FormValues = Record<string, string>

const OwnerFields: FC<{ values: FormValues; optional?: boolean }> = ({ values, optional }) => (
  <div class="grid">
    <label>
      Owner name
      <input name="ownerName" value={values.ownerName ?? ''} required={!optional} />
    </label>
    <label>
      Owner email
      <input type="email" name="ownerEmail" value={values.ownerEmail ?? ''} required={!optional} />
    </label>
    <label>
      Owner password
      <input type="password" name="ownerPassword" required={!optional} autocomplete="new-password" />
    </label>
  </div>
)

export const NewStorePage: FC<{
  root: RootUser
  provisioner: string | null
  values: FormValues
  error?: string | null
}> = ({ root, provisioner, values, error }) => (
  <Layout title="New store" root={root} error={error}>
    <h1>New store</h1>
    <section>
      {provisioner ? (
        <form method="post" action="/stores">
          <div class="grid">
            <label>
              Store name
              <input name="name" value={values.name ?? ''} required />
            </label>
            <label>
              Address (subdomain)
              <input name="slug" value={values.slug ?? ''} required pattern="[a-z0-9-]+" />
            </label>
            <label>
              Database name (optional)
              <input name="databaseName" value={values.databaseName ?? ''} placeholder="openpos-<address>" />
            </label>
          </div>
          <h2>Store owner</h2>
          <OwnerFields values={values} />
          <p class="muted">A new database is created in {provisioner}, migrated, and seeded with the owner account.</p>
          <button type="submit">Create store</button>
        </form>
      ) : (
        <p>
          Configure <code>TURSO_API_TOKEN</code> and <code>TURSO_ORG</code> to create databases, or{' '}
          <a href="/stores/attach">attach an existing database</a>.
        </p>
      )}
    </section>
  </Layout>
)

export const AttachStorePage: FC<{
  root: RootUser
  databases: ProvisionedDatabase[]
  values: FormValues
  error?: string | null
}> = ({ root, databases, values, error }) => (
  <Layout title="Attach database" root={root} error={error}>
    <h1>Attach an existing database</h1>
    <section>
      <form method="post" action="/stores/attach">
        <div class="grid">
          <label>
            Address (subdomain)
            <input name="slug" value={values.slug ?? ''} required pattern="[a-z0-9-]+" />
          </label>
          <label>
            Store name (optional)
            <input name="name" value={values.name ?? ''} placeholder="Read from the database" />
          </label>
        </div>
        {databases.length > 0 ? (
          <label>
            Unassigned database
            <select name="databaseName">
              <option value="">Use a URL instead</option>
              {databases.map((database) => (
                <option value={database.name} selected={database.name === values.databaseName}>
                  {database.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div class="grid">
          <label>
            Database URL
            <input name="url" value={values.url ?? ''} placeholder="libsql://name-org.turso.io" />
          </label>
          <label>
            Auth token
            <input type="password" name="authToken" />
          </label>
        </div>
        <h2>Owner (only if the database has no users)</h2>
        <OwnerFields values={values} optional />
        <p class="muted">
          Pending migrations are applied. A connection key already stored in the database is kept, so devices that
          joined it before keep working.
        </p>
        <button type="submit">Attach database</button>
      </form>
    </section>
  </Layout>
)

export interface DomainStatus {
  hostname: string
  platform: boolean
  status: string | null
}

const InspectionPanel: FC<{ inspection: StoreInspection }> = ({ inspection }) => (
  <table>
    <tbody>
      <tr>
        <th>Reachable</th>
        <td class={inspection.reachable ? 'ok' : 'bad'}>
          {inspection.reachable ? 'Yes' : `No${inspection.error ? `: ${inspection.error}` : ''}`}
        </td>
      </tr>
      <tr>
        <th>Active users</th>
        <td>{inspection.activeUsers ?? 'unknown'}</td>
      </tr>
      <tr>
        <th>Schema</th>
        <td class={inspection.upToDate ? 'ok' : 'warn'}>
          {inspection.upToDate
            ? 'Up to date'
            : `${inspection.appliedMigration ?? 'none'} → ${inspection.latestMigration}`}
        </td>
      </tr>
    </tbody>
  </table>
)

export const StoreDetailPage: FC<{
  root: RootUser
  store: StoreRecord
  inspection: StoreInspection
  webUrl: string | null
  /** Workers Custom Domain status of the store subdomain; null when not managed here. */
  webStatus?: string | null
  apiUrl: string | null
  domains: DomainStatus[]
  customDomainTarget: string | null
  canDropDatabase: boolean
  notice?: string | null
  error?: string | null
}> = ({
  root,
  store,
  inspection,
  webUrl,
  webStatus = null,
  apiUrl,
  domains,
  customDomainTarget,
  canDropDatabase,
  notice,
  error,
}) => (
  <Layout title={store.name} root={root} notice={notice} error={error}>
    <div class="row" style="justify-content: space-between">
      <h1>{store.name}</h1>
      <StatusBadge status={store.status} />
    </div>

    <section>
      <h2>Connect devices</h2>
      <p class="muted">Enter this key in the OpenPOS app to connect a device to this store.</p>
      <div class="key">{store.connectionKey}</div>
      <div class="row" style="margin-top: 12px; justify-content: space-between">
        <span class="muted">
          {webUrl ? (
            <>
              Web: <a href={webUrl}>{webUrl}</a>
              {webStatus ? <span class={webStatus === 'Published' ? 'ok' : 'warn'}> ({webStatus})</span> : null}
            </>
          ) : null}
          {apiUrl ? <> · API: {apiUrl}</> : null}
        </span>
        <div class="row">
          {webStatus && webStatus !== 'Published' ? (
            <form method="post" action={`/stores/${store.id}/publish`}>
              <button type="submit" class="secondary">
                Publish web address
              </button>
            </form>
          ) : null}
          <form method="post" action={`/stores/${store.id}/rotate-key`}>
            <button type="submit" class="secondary">
              Rotate key
            </button>
          </form>
        </div>
      </div>
    </section>

    <section>
      <h2>Database</h2>
      <p>
        <code>{store.databaseName}</code> <span class="muted">{store.databaseUrl}</span>
      </p>
      <InspectionPanel inspection={inspection} />
      <form method="post" action={`/stores/${store.id}/migrate`} style="margin-top: 12px">
        <button type="submit" class="secondary">
          Apply pending migrations
        </button>
      </form>
    </section>

    <section>
      <h2>Domains</h2>
      <table>
        <tbody>
          {domains.map((domain) => (
            <tr>
              <td>
                <code>{domain.hostname}</code>
              </td>
              <td class="muted">
                {domain.platform
                  ? `Platform domain${domain.status ? ` · ${domain.status}` : ''}`
                  : (domain.status ?? 'DNS only')}
              </td>
              <td style="text-align: right">
                <form method="post" action={`/stores/${store.id}/domains/remove`}>
                  <input type="hidden" name="hostname" value={domain.hostname} />
                  <button type="submit" class="link">
                    Remove
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form method="post" action={`/stores/${store.id}/domains`} class="row" style="margin-top: 12px">
        <input name="hostname" placeholder="pos.example.com" required style="flex: 1; margin: 0" />
        <button type="submit">Add domain</button>
      </form>
      {customDomainTarget ? (
        <p class="muted">
          Point custom domains to <code>{customDomainTarget}</code> with a CNAME record.
        </p>
      ) : null}
    </section>

    <section>
      <h2>Settings</h2>
      <form method="post" action={`/stores/${store.id}`}>
        <div class="grid">
          <label>
            Store name
            <input name="name" value={store.name} required />
          </label>
          <label>
            Address (subdomain)
            <input name="slug" value={store.slug} required />
          </label>
          <label>
            Status
            <select name="status">
              <option value="active" selected={store.status === 'active'}>
                Active
              </option>
              <option value="disabled" selected={store.status === 'disabled'}>
                Disabled
              </option>
            </select>
          </label>
        </div>
        <button type="submit">Save</button>
      </form>
    </section>

    <section>
      <h2>Delete store</h2>
      <form method="post" action={`/stores/${store.id}/delete`}>
        <label>
          Type <code>{store.slug}</code> to confirm
          <input name="confirm" required autocomplete="off" />
        </label>
        {canDropDatabase ? (
          <label>
            <input type="checkbox" name="dropDatabase" value="1" />
            Also delete the database {store.databaseName} (cannot be undone)
          </label>
        ) : null}
        <button type="submit" class="danger">
          Delete store
        </button>
      </form>
    </section>
  </Layout>
)

export const DatabasesPage: FC<{
  root: RootUser
  provisioner: string | null
  databases: Array<ProvisionedDatabase & { store: StoreRecord | null }>
  error?: string | null
  notice?: string | null
}> = ({ root, provisioner, databases, error, notice }) => (
  <Layout title="Databases" root={root} error={error} notice={notice}>
    <h1>Databases</h1>
    {provisioner ? (
      <>
        <p class="muted">{provisioner}</p>
        <section>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Host</th>
                <th>Store</th>
              </tr>
            </thead>
            <tbody>
              {databases.map((database) => (
                <tr>
                  <td>
                    <code>{database.name}</code>
                    <div class="muted">{[database.group, ...database.regions].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td class="muted">{database.hostname}</td>
                  <td>
                    {database.store ? (
                      <a href={`/stores/${database.store.id}`}>{database.store.name}</a>
                    ) : (
                      <a href={`/stores/attach?database=${encodeURIComponent(database.name)}`}>Assign to a store</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2>Create an empty database</h2>
          <form method="post" action="/databases" class="row">
            <input name="name" placeholder="openpos-store" required style="flex: 1; margin: 0" />
            <button type="submit">Create</button>
          </form>
        </section>
      </>
    ) : (
      <section>
        <p>
          Set <code>TURSO_API_TOKEN</code>, <code>TURSO_ORG</code>, and optionally <code>TURSO_GROUP</code> on the admin
          Worker to list and create Turso databases.
        </p>
      </section>
    )}
  </Layout>
)

export interface ServiceCheck {
  name: string
  target: string | null
  ok: boolean | null
  detail: string
}

export const PlatformPage: FC<{ root: RootUser; checks: ServiceCheck[]; settings: Array<[string, Child]> }> = ({
  root,
  checks,
  settings,
}) => (
  <Layout title="Platform" root={root}>
    <h1>Platform</h1>
    <section>
      <h2>Services</h2>
      <table>
        <tbody>
          {checks.map((check) => (
            <tr>
              <th>{check.name}</th>
              <td class="muted">{check.target ?? 'not configured'}</td>
              <td class={check.ok === null ? 'muted' : check.ok ? 'ok' : 'bad'}>{check.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
    <section>
      <h2>Configuration</h2>
      <table>
        <tbody>
          {settings.map(([label, value]) => (
            <tr>
              <th>{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </Layout>
)

export const AuditPage: FC<{ root: RootUser; entries: AuditEntry[] }> = ({ root, entries }) => (
  <Layout title="Audit log" root={root}>
    <h1>Audit log</h1>
    <section>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr>
              <td class="muted">{entry.createdAt.replace('T', ' ').slice(0, 19)}</td>
              <td>{entry.actor}</td>
              <td>
                <code>{entry.action}</code>
              </td>
              <td>{entry.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </Layout>
)
