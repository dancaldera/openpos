# Cloudflare Deployment

OpenPOS runs on Cloudflare Workers under `pos.softmelody.dev` (zone
`softmelody.dev`, account `b220599d0d0231c40573c209405f1a00`). One shared,
multi-tenant API serves every store, one shared web Worker serves every store
subdomain, and the root admin app creates stores and their Turso databases.
There is one Worker per job, not one per store.

```text
demo.pos.softmelody.dev ──┐   ┌──────────────────────────────┐   service binding
aldo.pos.softmelody.dev ──┼──▶│ openpos-web                  │──────────────┐
 (Custom Domains added    │   │ static client + /api proxy   │              ▼
  by the admin app)       ┘   └──────────────────────────────┘   ┌──────────────────────┐
desktop app ─────────────── https://api.pos.softmelody.dev ─────▶│ openpos-api           │
                                                                 └──────────┬───────────┘
admin.pos.softmelody.dev ──▶ openpos-admin ──┐                              │
                                             ▼                              ▼
                              control plane (Turso)  ─────────▶  store databases (Turso)
                              stores, keys, domains, roots       one per store, group openpos

releases.pos.softmelody.dev ──▶ openpos-releases ──▶ R2 bucket openpos-releases
pos.softmelody.dev          ──▶ openpos-landing (static assets)
```

| Worker | Config | Hostnames |
| --- | --- | --- |
| `openpos-api` | `apps/api/wrangler.jsonc` | `api.pos.softmelody.dev` |
| `openpos-web` | `apps/web/wrangler.jsonc` | `<slug>.pos.softmelody.dev`, attached by the admin app |
| `openpos-admin` | `apps/admin/wrangler.jsonc` | `admin.pos.softmelody.dev` |
| `openpos-releases` | `apps/releases/wrangler.jsonc` | `releases.pos.softmelody.dev`, R2 `openpos-releases` |
| `openpos-landing` | `apps/landing/wrangler.jsonc` | `pos.softmelody.dev` |

Every hostname is a Workers Custom Domain, so Cloudflare creates its DNS record
and certificate. No wildcard DNS record or wildcard certificate is needed.

## How a request finds its store

- **Web:** `aldo.pos.softmelody.dev/api/...` reaches `openpos-web`, which
  forwards it to `openpos-api` over the service binding with
  `X-Forwarded-Host`. The API strips a base domain from `STORE_BASE_DOMAINS`
  to get the slug `aldo`, or looks up a custom domain in the control plane.
- **Desktop:** the device sends its connection key to
  `POST /api/connections/connect` and receives the store database credentials
  for its local replica. Signed-in requests carry the store id in the JWT.
- The API applies pending migrations to a store database the first time an
  isolate resolves that store.

## Store web addresses

When a root creates or attaches a store, renames its address, adds a domain
under `pos.softmelody.dev`, or deletes it, the admin app attaches or detaches
the matching Workers Custom Domain on `openpos-web` through the Cloudflare API
(`CLOUDFLARE_API_TOKEN` with *Workers Scripts: Edit*, plus the
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ZONE_NAME` vars). The store page shows
whether its address is published and offers **Publish web address** to retry.

Do not list store hostnames in `apps/web/wrangler.jsonc`. A deploy would
replace the admin-managed list.

## Secrets

Set secrets with `pnpm -C apps/<app> exec wrangler secret put <NAME>`. Never
commit them.

| Secret | API | Admin | Notes |
| --- | --- | --- | --- |
| `CONTROL_PLANE_URL` | yes | yes | `libsql://openpos-control-plane-dancaldera.aws-us-east-1.turso.io` |
| `CONTROL_PLANE_AUTH_TOKEN` | yes | yes | Token for the control plane database |
| `CONTROL_PLANE_SECRET` | yes | yes | Encrypts store database tokens. Same value on both. Changing it makes stored tokens unreadable. |
| `JWT_SECRET` | yes | | Signs user sessions |
| `INTERNAL_SECRET` | yes | | Operator password recovery |
| `ADMIN_SESSION_SECRET` | | yes | Signs root admin sessions |
| `ADMIN_SETUP_TOKEN` | | optional | Creates the first root user at `/setup`; setup closes once a root exists |
| `TURSO_API_TOKEN` | | yes | Turso Platform API (`turso auth api-tokens mint openpos-admin`) |
| `CLOUDFLARE_API_TOKEN` | | yes | Publishes store web addresses (*Workers Scripts: Edit* on the account) |

Non-secret settings live in `vars` in each `wrangler.jsonc`
(`STORE_BASE_DOMAINS`, `ALLOWED_ORIGIN`, `PUBLIC_API_URL`,
`STORE_WEB_URL_TEMPLATE`, `RELEASES_URL`, `TURSO_ORG`, `TURSO_GROUP`,
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_NAME`, `WEB_WORKER_NAME`).

## Deploy

Deploy the API before the web Worker, because the web Worker binds to it:

```bash
pnpm run deploy:api
pnpm run deploy:admin
pnpm run deploy:web
pnpm run deploy:releases
pnpm run deploy:landing
```

### First-time setup

1. Create the control plane database and tokens:

   ```bash
   turso db create openpos-control-plane --group openpos
   turso db show openpos-control-plane --url
   turso db tokens create openpos-control-plane
   turso auth api-tokens mint openpos-admin   # TURSO_API_TOKEN
   ```

2. Create the R2 bucket: `pnpm -C apps/releases exec wrangler r2 bucket create openpos-releases`.
3. Set the secrets above on `openpos-api` and `openpos-admin`. Generate random
   values with `openssl rand -base64 32`.
4. Deploy all five Workers.
5. Create the first root user: set `ADMIN_SETUP_TOKEN`, open
   `https://admin.pos.softmelody.dev/setup`, then delete the secret.
6. Attach existing store databases from **Attach database** (slug, database,
   owner if the database has no users). Attaching keeps the store's existing
   connection key and publishes its web address.
7. Put Cloudflare Access in front of `admin.pos.softmelody.dev` as a second gate.

## Adding a store

Create it in the admin app: name, slug, owner. The admin app creates a Turso
database in `TURSO_GROUP`, applies migrations, creates the owner, publishes
`https://<slug>.pos.softmelody.dev`, and shows the connection key.

### Domains outside pos.softmelody.dev (optional)

Store domains such as `pos.example.com` need Cloudflare for SaaS on the zone,
a fallback origin, and a `*/*` route on `openpos-web`. Set
`CLOUDFLARE_ZONE_ID` and `CUSTOM_DOMAIN_TARGET` on the admin app to have it
register those hostnames when a root adds them.

## Local Workers check

`pnpm run dev` runs the stack on Node and is the normal way to develop. To run
the real Workers runtime locally, start a libSQL server for the control plane
(`turso dev --port 8081`), copy `apps/api/.dev.vars.example` to
`apps/api/.dev.vars`, point it at that server, and run:

```bash
pnpm run dev:workers   # web + API Workers on http://demo.localhost:8787
```

`--local-upstream demo.localhost:8787` makes every local request resolve to
the `demo` store, because `wrangler dev` otherwise rewrites the host.
