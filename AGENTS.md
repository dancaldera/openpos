# Repository Guidelines

## Project Structure & Module Organization

OpenPOS is a pnpm workspace monorepo. Main apps live in `apps/`: `desktop/` for the Electron + Preact client (also built for the browser), `api/` for the shared multi-tenant Hono API, `web/` for the Worker that serves the web client on every store subdomain, `admin/` for the root admin (stores, Turso databases, connection keys, domains), `releases/` for the public update proxy, and `landing/` for the Astro marketing site. Shared code lives in `packages/`: `data/` contains schema, migrations, and bootstrap assets, `control-plane/` holds the store registry and Turso provisioning used by the API and admin, `sync/` holds sync logic, and `domain/` holds dependency-free shared validators and normalizers (password, barcode). Repository tooling and release helpers are in `scripts/`. Tests are usually colocated with source as `*.test.ts` or `*.test.js`.

## Build, Test, and Development Commands

Run all commands from the repository root:

- `pnpm install`: install workspace dependencies.
- `pnpm run dev`: start the local stack (API, admin, and web client at `http://localhost:5173`, seeded `demo` store). No accounts or secrets needed; data lives in `.dev-data/`.
- `pnpm run dev:desktop`: run the Electron app against the local API.
- `pnpm run dev:api` / `pnpm run dev:admin` / `pnpm run dev:landing`: run a single app locally.
- `pnpm run dev:workers`: run the web and API Workers in `wrangler dev` (needs `apps/api/.dev.vars`; see `docs/CLOUDFLARE.md`).
- `pnpm run check`: run TypeScript checks plus Biome validation where configured.
- `pnpm run test`: run the full test suite across scripts, packages, desktop, API, admin, web, and releases.
- `pnpm run version:bump X.Y.Z`: set the shared workspace version (see Version Bumps).
- `pnpm run release`: build and publish desktop artifacts (see Desktop Releases).
- `pnpm run build:desktop` / `pnpm run build:api` / `pnpm run build:admin` / `pnpm run build:web` / `pnpm run build:landing`: build a specific target.
- `pnpm run deploy:api` / `deploy:admin` / `deploy:web` / `deploy:releases` / `deploy:landing`: deploy a Worker (see Cloudflare Deployment).
Use `pnpm -C apps/desktop test` when iterating on one area.

## Coding Style & Naming Conventions

TypeScript is the default across active apps. Biome enforces 2-space indentation, single quotes, no semicolons, and import organization for `scripts/`, `apps/api/src/`, `apps/admin/src/`, `apps/web/src/`, `apps/releases/src/`, `packages/control-plane/src/`, and `apps/desktop/src/`. Follow existing naming: components and pages use `PascalCase.tsx`, hooks use `useX.ts`, stores use `*Store.ts` and `*Actions.ts`, and services follow `entity-sqlite.ts` or `entity-turso.ts`.

## Testing Guidelines

The repo uses Vitest as the test runner. Keep tests next to the code they cover and name them `*.test.ts` or `*.test.js`. Add focused tests for route handlers, desktop services, sync flows, and utility modules you touch. Before opening a PR, run `pnpm run test` and, for UI or API-only changes, at least the relevant workspace test command.

## Commit & Pull Request Guidelines

Recent history favors short imperative subjects such as `Add Debian package to Linux release`, with `chore:` prefixes for maintenance or version bumps. Keep commits scoped to one change. PRs should explain the user-visible impact, note config or migration changes, link related issues, and include screenshots for desktop or landing UI changes.

## Version Bumps

Keep every workspace package on the same `X.Y.Z` version. The desktop updater compares that version to `https://releases.pos.softmelody.dev/releases/latest.json`, so a mismatch blocks publish and can hide updates.

1. Start from a clean `main` (or the release branch) with no unrelated diffs.
2. Bump with `pnpm run version:bump X.Y.Z` (no `v` prefix). This updates `package.json`, `apps/desktop/package.json`, `apps/api/package.json`, `apps/admin/package.json`, `apps/web/package.json`, `apps/releases/package.json`, and `apps/landing/package.json`.
3. Do not edit those version fields by hand unless the bump script cannot run.
4. Run `pnpm run check`, review `git diff`, then commit only the version files with `chore: bump version to vX.Y.Z`.
5. Tag `vX.Y.Z` after the bump commit. Tags are for git history only; they do not publish artifacts.

Do not mix a version bump into an unrelated feature commit. Choose the next `X.Y.Z` to match the change (patch for fixes, minor for features, major for breaking desktop/API changes). If `https://releases.pos.softmelody.dev/releases/latest.json` already has the current workspace version, bump before publishing or existing installs will not see an update.

## Desktop Releases

Every desktop publish must ship **macOS zip + dmg**, **Linux AppImage**, and **Linux `.deb`** in one `latest.json`. Do **not** build Windows. Do **not** publish a single family (`--mac`, `--linux`, or `--deb` alone): that overwrites `latest.json` and hides the other platforms from the updater. Use `docs/RELEASE.md` for bucket layout and script flags.

There is no GitHub Actions release workflow. Always publish from a **macOS host with Podman or Docker** (linux/amd64). The Mac artifacts are built natively; Linux packages run in `scripts/build-linux-in-container.sh` so `better-sqlite3` compiles for Linux. Never run `electron-builder --linux` on macOS itself — Darwin native modules in a Linux package will not boot.

Required sequence when asked to release:

1. `git switch main && git pull`. Commit feature work first. Do not mix it with a version bump.
2. Compare the workspace version to `https://releases.pos.softmelody.dev/releases/latest.json`. If that version is already live, bump first (`pnpm run version:bump X.Y.Z`), commit only the version files as `chore: bump version to vX.Y.Z`, tag `vX.Y.Z`, and `git push origin main --tags`.
3. Credentials live in `apps/releases/.env` (gitignored). If missing, ask the maintainer for an R2 API token with Object Read & Write on `openpos-releases` and write `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`), `REGION=auto`, plus `RELEASE_CDN_BASE_URL=https://releases.pos.softmelody.dev` (template: `apps/releases/.env.example`). Never commit `.env` or print secret values.
4. Ensure Podman/Docker can run `linux/amd64` (`podman machine start` if the VM is stopped).
5. Publish both families in one command:

```bash
pnpm run release --mac --linux --notes "Short user-facing notes"
```

6. Confirm `https://releases.pos.softmelody.dev/releases/latest.json` is the new version and lists all four assets (`openpos-arm64.zip`, `openpos-arm64.dmg`, `openpos-x86_64.AppImage`, `openpos_amd64.deb`). HEAD each `/v/X.Y.Z/<file>` URL and require HTTP 200 with a matching `Content-Length`.

`--dry-run` and `--local-dir dist-releases` are for preview only. Do not commit `apps/desktop/dist-electron/` or `dist-releases/`. Re-running the same version overwrites the same bucket keys; still bump when `latest.json` already has that version so existing installs can see an update.

## Cloudflare Deployment

Everything runs on Cloudflare Workers under `pos.softmelody.dev` (zone `softmelody.dev`); `docs/CLOUDFLARE.md` is the runbook (secrets, first deploy, store web addresses, custom store domains). Each `apps/*/wrangler.jsonc` is the source of truth for its Worker:

- `openpos-api` (`api.pos.softmelody.dev`): one shared API for every store. It resolves the store per request from the control plane (connection key, JWT store id, or host) and applies pending migrations to a store database the first time an isolate resolves it.
- `openpos-web` (`<slug>.pos.softmelody.dev`): serves `apps/desktop/dist-web` and forwards `/api` to `openpos-api` over a service binding. Store hostnames are Workers Custom Domains that the admin app attaches through the Cloudflare API; never list them in `apps/web/wrangler.jsonc`, because a deploy would replace the admin-managed list.
- `openpos-admin` (`admin.pos.softmelody.dev`): root admin. Creates, attaches, migrates, and deletes stores and their Turso databases through the Turso Platform API, rotates connection keys, and manages domains.
- `openpos-releases` (`releases.pos.softmelody.dev`): update feed from the `openpos-releases` R2 bucket.
- `openpos-landing` (`pos.softmelody.dev`): static assets.

Deploy with `pnpm run deploy:<app>`; deploy the API before the web Worker. Set secrets with `pnpm -C apps/<app> exec wrangler secret put <NAME>`; never commit them or print their values. `CONTROL_PLANE_SECRET` must be identical on the API and admin, and changing it makes stored store-database tokens unreadable.

Store database credentials live only in the control plane (encrypted). The browser never receives them; the desktop app receives them from `POST /api/connections/connect` in exchange for its connection key. Create stores in the admin app rather than by hand.
## Security & Configuration Tips

Do not commit secrets or production tokens. Desktop runtime config belongs in the platform-specific Electron `userData` path, not in tracked files. When changing schema or seed data, update `packages/data/src/schema/`, generate a Drizzle migration under `packages/data/drizzle/`, regenerate the bundled migrations for Workers with `pnpm -C packages/data run generate:migrations`, rebuild the bootstrap database, and mention any required migration step in the PR. Store databases pick up new migrations on the API's first request per isolate, or from **Migrate** in the admin app.
