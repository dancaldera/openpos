# Repository Guidelines

## Project Structure & Module Organization

OpenPOS is a Bun workspace monorepo. Main apps live in `apps/`: `desktop/` for the Electron + Preact client, `api/` for the Hono backend, and `landing/` for the Astro marketing site. Shared code lives in `packages/`: `data/` contains schema, migrations, and bootstrap assets, while `sync/` holds sync logic. Repository tooling and release helpers are in `scripts/`. Tests are usually colocated with source as `*.test.ts` or `*.test.js`.

## Build, Test, and Development Commands

Run all commands from the repository root:

- `bun install`: install workspace dependencies.
- `bun run dev`: start the desktop app via the workspace runner.
- `bun run dev:api` / `bun run dev:landing`: run a single app locally.
- `bun run check`: run TypeScript checks plus Biome validation where configured.
- `bun run test`: run the full test suite across scripts, packages, desktop, and API.
- `bun run build:desktop` / `bun run build:api` / `bun run build:landing`: build a specific target.

Use `bun run --cwd apps/desktop test` when iterating on one area.

## Coding Style & Naming Conventions

TypeScript is the default across active apps. Biome enforces 2-space indentation, single quotes, no semicolons, and import organization for `scripts/`, `apps/api/src/`, and `apps/desktop/src/`. Follow existing naming: components and pages use `PascalCase.tsx`, hooks use `useX.ts`, stores use `*Store.ts` and `*Actions.ts`, and services follow `entity-sqlite.ts` or `entity-turso.ts`.

## Testing Guidelines

The repo uses Bun’s test runner. Keep tests next to the code they cover and name them `*.test.ts` or `*.test.js`. Add focused tests for route handlers, desktop services, sync flows, and utility modules you touch. Before opening a PR, run `bun run test` and, for UI or API-only changes, at least the relevant workspace test command.

## Commit & Pull Request Guidelines

Recent history favors short imperative subjects such as `Add Debian package to Linux release`, with `chore:` prefixes for maintenance or version bumps. Keep commits scoped to one change. PRs should explain the user-visible impact, note config or migration changes, link related issues, and include screenshots for desktop or landing UI changes.

## Security & Configuration Tips

Do not commit secrets or production tokens. Desktop runtime config belongs in the platform-specific Electron `userData` path, not in tracked files. When changing schema or seed data, update the corresponding files under `packages/data/migrations/` and mention any required migration step in the PR.
