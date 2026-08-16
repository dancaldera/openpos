# OpenPOS

OpenPOS is a Bun workspace monorepo for a desktop-first point of sale system.

[Live Demo](https://demo.openpos.xyz) · [Releases](https://github.com/dancaldera/openpos/releases) · [Contributing](./CONTRIBUTING.md)

- `apps/desktop`: Electron + Preact POS client
- `apps/api`: Hono API for sync and auth flows
- `apps/landing`: Astro marketing site

## Install on macOS

Official macOS releases are distributed as `.dmg` and `.zip` for Apple Silicon. Download the latest
`openpos-arm64.dmg` from the [releases page](https://github.com/dancaldera/openpos/releases/latest) and drag
OpenPOS into `/Applications`.

The app is not code-signed with an Apple Developer ID, so the first launch requires right-click → Open
(or `xattr -dr com.apple.quarantine /Applications/OpenPOS.app`). After that, the app updates itself in place
from inside the update badge — no Gatekeeper prompt is involved for in-app updates.

## Install on Linux

Official Linux releases are distributed as AppImage and `.deb`.

Install the latest release:

```bash
curl -fsSL https://raw.githubusercontent.com/dancaldera/openpos/main/scripts/install-latest-appimage.sh | bash
```

Install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/dancaldera/openpos/main/scripts/install-latest-appimage.sh | bash -s -- --version 0.3.6
```

The installer places the binary at `~/.local/bin/openpos` by default. Use `--install-dir` to override the target directory.
Make sure `~/.local/bin` is in your `PATH` if your shell does not already include it.

Debian-family `.deb` installs can update from inside the desktop app when a newer GitHub release is available.
The system may show an authentication prompt while installing the package. If authentication fails, open the release
from the update badge and download the `.deb` manually.

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
  "thermalPrinterName": "Thermal_80mm"
}
```

Include only the fields needed for that install. Public GitHub releases must not embed `TURSO_AUTH_TOKEN`, `JWT_SECRET`, or other backend secrets.

On macOS and Linux, receipt printing uses the native `lp -o raw` command and sends formatted ESC/POS receipt bytes (including feed and paper-cut commands) to the printer queue. macOS includes `lp` by default. On Linux, install CUPS if `lp` is missing:

```bash
sudo apt install cups
```

Verify the system printing path:

```bash
lpstat -e
printf "OpenPOS print test\n\n\n" | lp -o raw
```

OpenPOS uses `thermalPrinterName` when configured, otherwise it uses the system default printer, then the first queue from `lpstat -e`. Set a default with `lpoptions -d <printer>` if needed.

For setup details, see [Thermal Receipt Printing on macOS](docs/THERMAL_PRINTING_MACOS.md) or [Thermal Receipt Printing on Linux](docs/THERMAL_PRINTING_LINUX.md).

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
- Pushing a `v*.*.*` tag triggers the release workflow, which builds and publishes Linux `.AppImage` + `.deb`
  and macOS (Apple Silicon) `.dmg` + `.zip` artifacts in a single GitHub release.
- Release flow: `bun run version:bump <x.y.z>` → commit → `git tag v<x.y.z>` → `git push --tags`.
- Local maintainer install test: `bash scripts/install-latest-appimage.sh --version <x.y.z>`

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, style, and PR guidelines.

## License

MIT License. See [LICENSE](./LICENSE).
