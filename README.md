# OpenPOS

OpenPOS is a Bun workspace monorepo for a desktop-first point of sale system.

- `apps/desktop`: Electron + Preact POS client
- `apps/api`: Hono API for sync and auth flows
- `apps/landing`: Astro marketing site

## Install on Linux

Official Linux releases are distributed as AppImage and `.deb`.

Install the latest release:

```bash
curl -fsSL https://raw.githubusercontent.com/dancaldera/OpenPOS/main/scripts/install-latest-appimage.sh | bash
```

Install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/dancaldera/OpenPOS/main/scripts/install-latest-appimage.sh | bash -s -- --version 0.3.6
```

The installer places the binary at `~/.local/bin/openpos` by default. Use `--install-dir` to override the target directory.
Make sure `~/.local/bin` is in your `PATH` if your shell does not already include it.

## Desktop Runtime Config

Packaged desktop installs read runtime config from Electron `userData` first.
OpenPOS uses the Electron app name `OpenPOS`, so the production config file path is:

- macOS: `~/Library/Application Support/OpenPOS/config.json`
- Linux: `$XDG_CONFIG_HOME/OpenPOS/config.json`
- Linux fallback when `XDG_CONFIG_HOME` is unset: `~/.config/OpenPOS/config.json`

OpenPOS no longer falls back to `~/.config/openpos-desktop/config.json`.
On macOS only, if the `userData` file is missing, the app also checks `~/.config/OpenPOS/config.json` as a compatibility fallback.

Example:

```json
{
  "tursoDatabaseUrl": "libsql://your-db.turso.io",
  "tursoAuthToken": "your-token-here",
  "apiUrl": "https://your-api.example.com",
  "printerCommand": "lp",
  "printerArgs": [],
  "githubToken": "github_pat_xxxxxxxxxxxx"
}
```

Include only the fields needed for that install. Public GitHub releases must not embed `TURSO_AUTH_TOKEN`, `JWT_SECRET`, or other backend secrets.

### `githubToken` — in-app update checks

If the GitHub repository is private, the app needs a token to query the GitHub Releases API for updates. Add `githubToken` to `config.json` with a Personal Access Token (PAT) that has the following scope:

| Token type | Required scope |
|---|---|
| Classic PAT | `repo` (read access to private repos) |
| Fine-grained PAT | **Contents** → Read-only, scoped to the `OpenPOS` repository |

Generate a token at <https://github.com/settings/tokens>. The token is only used for the read-only `/repos/{owner}/{repo}/releases/latest` endpoint — it is never sent anywhere else.

Create the file interactively:

```bash
bash scripts/create-desktop-config.sh
```

The script writes to the platform-appropriate production path by default and asks before overwriting an existing file.

You can also override the location explicitly:

```bash
bash scripts/create-desktop-config.sh --path "$HOME/.config/OpenPOS/config.json"
```

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
- The release workflow currently publishes Linux `.AppImage` and `.deb` artifacts.
- Local macOS maintainer release build: `bun run release:desktop:mac`
- Local maintainer install test: `bash scripts/install-latest-appimage.sh --version <x.y.z>`

## License

MIT License. See [LICENSE](./LICENSE).
