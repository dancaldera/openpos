# Repository Guidelines

## Project Structure & Module Organization

OpenPOS is a pnpm workspace monorepo. Main apps live in `apps/`: `desktop/` for the Electron + Preact client, `api/` for the Hono backend, `releases/` for the public update proxy, and `landing/` for the Astro marketing site. Shared code lives in `packages/`: `data/` contains schema, migrations, and bootstrap assets, while `sync/` holds sync logic. Repository tooling and release helpers are in `scripts/`. Tests are usually colocated with source as `*.test.ts` or `*.test.js`.

## Build, Test, and Development Commands

Run all commands from the repository root:

- `pnpm install`: install workspace dependencies.
- `pnpm run dev`: start the desktop app via the workspace runner.
- `pnpm run dev:api` / `pnpm run dev:landing`: run a single app locally.
- `pnpm run check`: run TypeScript checks plus Biome validation where configured.
- `pnpm run test`: run the full test suite across scripts, packages, desktop, and API.
- `pnpm run version:bump X.Y.Z`: set the shared workspace version (see Version Bumps).
- `pnpm run release`: build and publish desktop artifacts (see Desktop Releases).
- `pnpm run build:desktop` / `pnpm run build:api` / `pnpm run build:landing`: build a specific target.

Use `pnpm -C apps/desktop test` when iterating on one area.

## Coding Style & Naming Conventions

TypeScript is the default across active apps. Biome enforces 2-space indentation, single quotes, no semicolons, and import organization for `scripts/`, `apps/api/src/`, and `apps/desktop/src/`. Follow existing naming: components and pages use `PascalCase.tsx`, hooks use `useX.ts`, stores use `*Store.ts` and `*Actions.ts`, and services follow `entity-sqlite.ts` or `entity-turso.ts`.

## Testing Guidelines

The repo uses Vitest as the test runner. Keep tests next to the code they cover and name them `*.test.ts` or `*.test.js`. Add focused tests for route handlers, desktop services, sync flows, and utility modules you touch. Before opening a PR, run `pnpm run test` and, for UI or API-only changes, at least the relevant workspace test command.

## Commit & Pull Request Guidelines

Recent history favors short imperative subjects such as `Add Debian package to Linux release`, with `chore:` prefixes for maintenance or version bumps. Keep commits scoped to one change. PRs should explain the user-visible impact, note config or migration changes, link related issues, and include screenshots for desktop or landing UI changes.

## Version Bumps

Keep every workspace package on the same `X.Y.Z` version. The desktop updater compares that version to `https://releases.openpos.xyz/releases/latest.json`, so a mismatch blocks publish and can hide updates.

1. Start from a clean `main` (or the release branch) with no unrelated diffs.
2. Bump with `pnpm run version:bump X.Y.Z` (no `v` prefix). This updates `package.json`, `apps/desktop/package.json`, `apps/api/package.json`, `apps/releases/package.json`, and `apps/landing/package.json`.
3. Do not edit those version fields by hand unless the bump script cannot run.
4. Run `pnpm run check`, review `git diff`, then commit only the version files with `chore: bump version to vX.Y.Z`.
5. Tag `vX.Y.Z` after the bump commit. Tags are for git history only; they do not publish artifacts.

Do not mix a version bump into an unrelated feature commit. Choose the next `X.Y.Z` to match the change (patch for fixes, minor for features, major for breaking desktop/API changes). If `https://releases.openpos.xyz/releases/latest.json` already has the current workspace version, bump before publishing or existing installs will not see an update.

## Desktop Releases

Every desktop publish must ship **macOS zip + dmg**, **Linux AppImage**, and **Linux `.deb`** in one `latest.json`. Do **not** build Windows. Do **not** publish a single family (`--mac`, `--linux`, or `--deb` alone): that overwrites `latest.json` and hides the other platforms from the updater. Use `docs/RELEASE.md` for bucket layout and script flags.

There is no GitHub Actions release workflow. Always publish from a **macOS host with Podman or Docker** (linux/amd64). The Mac artifacts are built natively; Linux packages run in `scripts/build-linux-in-container.sh` so `better-sqlite3` compiles for Linux. Never run `electron-builder --linux` on macOS itself — Darwin native modules in a Linux package will not boot.

Required sequence when asked to release:

1. `git switch main && git pull`. Commit feature work first. Do not mix it with a version bump.
2. Compare the workspace version to `https://releases.openpos.xyz/releases/latest.json`. If that version is already live, bump first (`pnpm run version:bump X.Y.Z`), commit only the version files as `chore: bump version to vX.Y.Z`, tag `vX.Y.Z`, and `git push origin main --tags`.
3. Credentials live in `apps/releases/.env` (gitignored). If missing, write it from `railway bucket credentials --bucket openpos-releases --json` using `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `ENDPOINT`, `REGION`, plus `RELEASE_CDN_BASE_URL=https://releases.openpos.xyz`. Never commit `.env` or print secret values.
4. Ensure Podman/Docker can run `linux/amd64` (`podman machine start` if the VM is stopped).
5. Publish both families in one command:

```bash
pnpm run release --mac --linux --notes "Short user-facing notes"
```

6. Confirm `https://releases.openpos.xyz/releases/latest.json` is the new version and lists all four assets (`openpos-arm64.zip`, `openpos-arm64.dmg`, `openpos-x86_64.AppImage`, `openpos_amd64.deb`). HEAD each `/v/X.Y.Z/<file>` URL and require HTTP 200 with a matching `Content-Length`.

`--dry-run` and `--local-dir dist-releases` are for preview only. Do not commit `apps/desktop/dist-electron/` or `dist-releases/`. Re-running the same version overwrites the same bucket keys; still bump when `latest.json` already has that version so existing installs can see an update.

## Railway Deployment

Five services run in the `openpos` project (production environment), all connected to `dancaldera/openpos@main` with auto-deploy on push: `demo api`, `demo web`, `aldo api`, `aldo web`, and `releases`. There is no Vercel in this project. Demo URLs: `https://demo-web-production-fca8.up.railway.app`, `https://demo-api-production-b29b.up.railway.app`.

Pushing to `main` is the deploy path — watch patterns in `.railway/railway.ts` limit rebuilds to affected services (`releases` rebuilds on every push). That file is the single source of truth for build settings (Dockerfile per service), healthchecks, restart policy, and watch patterns. Change it with `railway config plan`, review the diff, then `railway config apply` (explicit approval required). Never hand-edit service settings in the dashboard.

Do not reintroduce `railway.json` at the repo root: default config-file discovery overrides service settings and once made `demo api` build the releases Dockerfile. `railway.api.json` / `railway.web.json` remain only because `aldo api` / `aldo web` still carry grandfathered config-file mappings (the API refuses new assignments); clear those mappings in the dashboard before Railway's config-as-code end-of-life (2026-12-01), then delete the files.

The Railway CLI is for recovery only, e.g. redeploying one service after a config change:

```bash
railway deployment redeploy --service "demo api"
```

Deploy API before web when both change, because on boot the API applies pending Drizzle migrations to the store database.

Keep `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` on the `demo api` service. On startup, the API reads the OpenPOS connection key from that database and recreates its ephemeral connection registry; Turso credentials are never sent to the web app. For an existing deployment that does not have those variables yet, get the Demo store URL and token from the local registry (`apps/api/data/connections/registry.json`, gitignored) and set them on `demo api` before deploying.

The registration endpoint remains available as a recovery path if the service variables cannot be configured:

```bash
curl -X POST https://demo-api-production-b29b.up.railway.app/api/connections/register \
  -H "Content-Type: application/json" \
  -d '{"key": "<demo-key>", "url": "<turso-url>", "authToken": "<turso-token>"}'
```

Registering probes the database, applies remote migrations, and makes that connection the API's assigned store for the current container only.

## Security & Configuration Tips

Do not commit secrets or production tokens. Desktop runtime config belongs in the platform-specific Electron `userData` path, not in tracked files. When changing schema or seed data, update `packages/data/src/schema/`, generate a Drizzle migration under `packages/data/drizzle/`, rebuild the bootstrap database, and mention any required migration step in the PR.
