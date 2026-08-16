# OpenPOS Landing Page

Landing page for [openpos.xyz](https://openpos.xyz) - redirects to [demo.openpos.xyz](https://demo.openpos.xyz).

Marketing pages are statically prerendered. The `/admin` area is server-rendered on Vercel for Turso fleet and client management.

## Commands

| Command       | Action                                      |
| :------------ | :------------------------------------------ |
| `bun install` | Install dependencies                        |
| `bun run dev` | Start dev server at `localhost:4321`        |
| `bun run build` | Build production site to `./dist/`        |
| `bun run preview` | Preview build locally                    |

## Admin dashboard setup

The admin area lives at `/admin` and is protected by a single env-based admin account plus a signed session cookie.

### 1. Create the registry database

Create a small Turso database to store client records:

```bash
turso db create openpos-admin
turso db show openpos-admin --url
turso db tokens create openpos-admin
```

Use the URL and token for `ADMIN_TURSO_DATABASE_URL` and `ADMIN_TURSO_AUTH_TOKEN`.

### 2. Mint a Turso Platform API token

Create an org-scoped Platform API token with database management permissions:

```bash
turso auth api-tokens mint openpos-admin-dashboard --org <your-org-slug>
```

Set `TURSO_API_TOKEN` and `TURSO_ORG`.

### 3. Configure local env

Copy `.env.example` to `.env` and fill in:

- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — dashboard login
- `SESSION_SECRET` — long random string for cookie signing
- `TURSO_API_TOKEN` / `TURSO_ORG` — Turso Platform API access
- `ADMIN_TURSO_DATABASE_URL` / `ADMIN_TURSO_AUTH_TOKEN` — registry DB

### 4. Vercel deployment

Add the same environment variables in the Vercel project settings. The app uses `@astrojs/vercel` with static output for marketing pages and SSR/serverless functions for `/admin` and `/api/admin/*`.

### Security notes

- Database tokens are stored in plaintext in the registry DB so you can view and rotate them from the dashboard. This is acceptable for a single-admin internal tool, but rotate immediately if the registry DB is exposed.
- Provisioning runs OpenPOS schema migrations from `packages/data/drizzle/*.sql`, matching `bun run db:migrate:remote`.
- Deleting a client record does not delete the underlying Turso database.

## Deployment

Built for Vercel hybrid deployment (static marketing site + serverless admin routes). Connect the repo, configure env vars, and deploy.
