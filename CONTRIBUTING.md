# Contributing to OpenPOS

Thanks for your interest in contributing! This guide covers the essentials. For full repository guidelines, see [AGENTS.md](./AGENTS.md).

## Setup

Prerequisites: [Node.js](https://nodejs.org/) 20+ and [Bun](https://bun.sh/).

```bash
git clone https://github.com/dancaldera/openpos.git
cd openpos
bun install
```

## Development

OpenPOS is a Bun workspace monorepo: `apps/desktop` (Electron + Preact POS client), `apps/api` (Hono backend), `apps/landing` (Astro marketing site), and shared code in `packages/`.

Run commands from the repository root:

```bash
bun run dev          # desktop app (renderer on http://localhost:1420)
bun run dev:api      # API server
bun run dev:landing  # landing site
```

## Before opening a PR

```bash
bun run check  # TypeScript + Biome validation
bun run test   # full test suite
```

- **Style**: Biome enforces 2-space indentation, single quotes, and no semicolons. Follow existing naming: components `PascalCase.tsx`, hooks `useX.ts`, stores `*Store.ts` / `*Actions.ts`.
- **Tests**: use Bun's test runner, colocated with the code as `*.test.ts`. Add focused tests for the route handlers, services, sync flows, or utilities you touch.
- **Commits**: short imperative subjects (`Add Debian package to Linux release`), `chore:` prefix for maintenance. Keep each commit scoped to one change.
- **PRs**: explain the user-visible impact, note config or migration changes, link related issues, and include screenshots for desktop or landing UI changes.

## Security

Never commit secrets or production tokens. Desktop runtime config belongs in the platform-specific Electron `userData` path, not in tracked files. To report a security issue privately, email <dancaldera@proton.me>.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
