# OpenPOS

OpenPOS is a pnpm workspace monorepo for a desktop-first point of sale system.

[Live Demo](https://demo.openpos.xyz) · [Releases](https://releases.openpos.xyz)

- `apps/desktop`: Electron + Preact POS client
- `apps/api`: Hono API for sync and auth flows
- `apps/landing`: Astro marketing site

## Install on macOS

Official macOS releases are distributed as `.zip` for Apple Silicon. Download the latest
`openpos-arm64.zip` from the [releases page](https://releases.openpos.xyz) and drag
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

Packaged installs open fullscreen. Press `F11` (or `Control+Command+F` on macOS) to switch to windowed mode.
Launch with `--windowed` if you need a window on a one-off start.

On Ubuntu checkout PCs, start OpenPOS automatically at login:

```bash
bash scripts/setup-pos-station.sh
```

The station script writes `~/.config/autostart/openpos.desktop` and a launcher under `~/.config/OpenPOS/`. The launcher
waits 15 seconds before opening the app fullscreen, so Electron starts after the login session and compositor are ready,
and writes diagnostics to `~/.config/OpenPOS/startup.log`. Use `--delay <seconds>` to change the wait, or `--status` /
`--remove` to inspect or undo it.

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
  "apiUrl": "https://your-api.example.com",
  "thermalPrinterName": "POS80"
}
```

Stores are created or joined from the app with a connection key and seed. The OpenPOS HTTP API is required (`apiUrl`). Store data lives in Turso (or a local file until published). Database URL, auth token, and Turso platform credentials are configured in Settings and stored encrypted in the database. Do not put them in this file. Public GitHub releases must not embed `JWT_SECRET`, `INTERNAL_SECRET`, or other backend secrets. Set `INTERNAL_SECRET` on the API for password recovery and other administration.

Receipts are ESC/POS bytes sent with `lp -d POS80 -o raw`. The verified USB printer is `POS80 Printer USB` (`0416:5011`). On Ubuntu, install or repair the raw CUPS queue with:

```bash
bash scripts/install-pos80-printer.sh --test
```

OpenPOS uses `thermalPrinterName` when configured, otherwise the CUPS default, then the first queue from `lpstat -e`.

See [Thermal Receipt Printing on Linux](docs/THERMAL_PRINTING_LINUX.md) or [Thermal Receipt Printing on macOS](docs/THERMAL_PRINTING_MACOS.md).

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

- [Node.js](https://nodejs.org/) 22.13+
- [pnpm](https://pnpm.io/)

Common commands:

```bash
pnpm install
pnpm run dev
pnpm run dev:api
pnpm run dev:landing
pnpm run check
pnpm run test
```

The desktop renderer runs on `http://localhost:1420` during development.

## Release Notes

- Releases are built and published from a maintainer machine with `pnpm run release`, not GitHub Actions.
- Artifacts (Linux `.AppImage` + `.deb`, macOS `.zip`) and an update manifest are uploaded to the
  OpenPOS releases bucket; see [docs/RELEASE.md](./docs/RELEASE.md).
- Release flow: `pnpm run version:bump <x.y.z>` → commit → `git tag v<x.y.z>` → `pnpm run release`.
- The desktop app checks the bucket manifest and downloads updates with SHA-256 verification.
- Local maintainer install test: `bash scripts/install-latest-appimage.sh --version <x.y.z>`

## License

Proprietary software of Melody Software. All rights reserved. See [LICENSE](./LICENSE).
