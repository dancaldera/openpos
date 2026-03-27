# OpenPOS

OpenPOS is a Bun workspace monorepo for a desktop-first point of sale system.

- `apps/desktop`: Electron + Preact POS client
- `apps/api`: Hono API for sync and auth flows
- `apps/landing`: Astro marketing site

## Install on Linux

Official Linux releases are distributed as AppImage only.

Install the latest release:

```bash
curl -fsSL https://raw.githubusercontent.com/dancaldera/OpenPOS/main/scripts/install-latest-appimage.sh | bash
```

Install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/dancaldera/OpenPOS/main/scripts/install-latest-appimage.sh | bash -s -- --version 0.3.5
```

The installer places the binary at `/usr/local/bin/openpos` by default. Use `--install-dir` for a user-local path such as `~/.local/bin`.

## Desktop Runtime Config

Linux packaged installs read runtime config from `~/.config/openpos-desktop/config.json`.

Example:

```json
{
  "tursoDatabaseUrl": "libsql://your-db.turso.io",
  "tursoAuthToken": "your-token-here",
  "apiUrl": "https://your-api.example.com",
  "printerCommand": "lp",
  "printerArgs": []
}
```

Include only the fields needed for that install. Public GitHub releases must not embed `TURSO_AUTH_TOKEN`, `JWT_SECRET`, or other backend secrets.

## Development

Prerequisites:

- [Node.js](https://nodejs.org/) 20+
- [bun](https://bun.sh/)

Common commands:

```bash
bun install
bun run dev
bun run dev:api
bun run dev:landing
bun run check
bun run test
```

The desktop renderer runs on `http://localhost:1420` during development.

## Release Notes

- GitHub release tags remain `v*.*.*`.
- The release workflow publishes Linux AppImage artifacts only.
- Local maintainer install test: `bash scripts/install-latest-appimage.sh --version <x.y.z>`

## License

MIT License. See [LICENSE](./LICENSE).
