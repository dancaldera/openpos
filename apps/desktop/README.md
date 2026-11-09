# OpenPOS Desktop

This app has two build targets:

- Electron desktop packaging for downloadable binaries
- A browser build of the same renderer (`pnpm run build:web`, output `dist-web/`)

## Web

Every store uses the same web build. The `openpos-web` Worker (`apps/web`)
serves `dist-web/` on `<slug>.pos.softmelody.dev` and forwards `/api` to the shared
API, which picks the store from the host. The browser asks only for the
store's connection key; database credentials never reach it. See
[docs/CLOUDFLARE.md](../../docs/CLOUDFLARE.md).

The web build always calls `/api` on its own origin, so it needs no build-time
API URL.

## Local Development

From the repository root, `pnpm run dev` starts the API, the admin app, and
this renderer at `http://localhost:5173` (seeded `demo` store; other stores at
`http://<slug>.localhost:5173`). `pnpm run dev:desktop` runs the Electron app
against the same local API.

```bash
pnpm run build:web
```
