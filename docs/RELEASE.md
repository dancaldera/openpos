# Release Guide

OpenPOS desktop releases are built and published from a maintainer machine with
`pnpm run release`. There is no GitHub Actions release workflow anymore. The
script validates versions, runs checks and tests, builds the desktop artifacts,
computes SHA-256 checksums, writes an update manifest (`latest.json`), and
uploads everything to the private `openpos-releases` Railway Bucket via its
S3-compatible API.

Railway Buckets are **private**, so files are served to end users through the
`apps/releases` proxy service (deployed in the same Railway project), which
exposes the update manifest and streams artifacts over HTTPS.

The desktop app fetches `latest.json` from that service to detect updates,
picks the right asset for its platform/architecture, downloads it, and verifies
the SHA-256 checksum before installing.

## Architecture

```text
maintainer ──pnpm run release──▶ openpos-releases bucket (private, S3 API)
                                        ▲
desktop app ──fetch latest.json─────────┤ apps/releases proxy (public)
            ◀──stream artifacts─────────┘ https://releases.openpos.xyz
```

- Bucket layout: `releases/latest.json` + `releases/v<version>/<artifact>`
- `apps/releases` routes:
  - `GET /releases/latest.json` — update manifest (cached 60s)
  - `GET /v/:version/:name` — artifact streaming (immutable cache)
- The domain `releases.openpos.xyz` points at the `releases` service on Railway.

## Bucket Configuration

The upload step reads these environment variables (values come from the
Railway bucket's Credentials tab, or `railway bucket credentials --bucket openpos-releases`):

| Variable | Required | Description |
| --- | --- | --- |
| `RELEASE_S3_BUCKET` | yes | Bucket name (Railway variable `BUCKET`) |
| `RELEASE_CDN_BASE_URL` | yes | Public base URL of the releases service, e.g. `https://releases.openpos.xyz` |
| `RELEASE_S3_ENDPOINT` | no | S3 endpoint (Railway variable `ENDPOINT`) |
| `RELEASE_S3_REGION` | no | Region (default: `auto`; Railway uses `auto`) |
| `RELEASE_S3_PATH_STYLE` | no | Set to `1` for path-style URLs (Railway uses virtual-host style) |
| `RELEASE_PREFIX` | no | Key prefix inside the bucket (default: `releases`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | yes | S3 credentials (Railway variables `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`) |

Example shell setup for a release session:

```bash
export RELEASE_S3_BUCKET=openpos-releases-thdjy-7k   # actual S3 name from credentials
export RELEASE_S3_ENDPOINT=https://t3.storageapi.dev
export RELEASE_CDN_BASE_URL=https://releases.openpos.xyz
export AWS_ACCESS_KEY_ID=...        # ACCESS_KEY_ID from the bucket
export AWS_SECRET_ACCESS_KEY=...    # SECRET_ACCESS_KEY from the bucket
```

Bucket layout after a release:

```text
<bucket>/releases/latest.json                  <- update manifest consumed by the app
<bucket>/releases/v0.8.4/openpos-x86_64.AppImage
<bucket>/releases/v0.8.4/openpos_amd64.deb
<bucket>/releases/v0.8.4/openpos-arm64.zip
```

## Release Steps

1. Start from a clean `main` branch:

```bash
git switch main
git pull
git status --short
```

2. Bump the version without the `v` prefix:

```bash
pnpm run version:bump 0.8.4
```

This updates `package.json`, `apps/desktop/package.json`, `apps/api/package.json`, `apps/releases/package.json`, and `apps/landing/package.json`.

3. Validate and review:

```bash
pnpm run check
git diff
```

4. Commit and tag:

```bash
git add package.json apps/desktop/package.json apps/api/package.json apps/releases/package.json apps/landing/package.json
git commit -m "chore: bump version to v0.8.4"
git tag v0.8.4
git push origin main --tags
```

5. Build and publish **macOS zip + dmg and Linux AppImage + `.deb` in one run**.
   Do this from a macOS host with Podman or Docker. Never publish Windows.
   Never pass only `--mac`, `--linux`, or `--deb`: `latest.json` would list
   only that family and hide the other platforms from the updater.

```bash
pnpm run release --mac --linux --notes "Bug fixes and improvements"

# Preview without uploading anything
pnpm run release --dry-run
```

Linux packages compile native modules (`better-sqlite3`) for Linux inside
Podman or Docker (`scripts/build-linux-in-container.sh`), targeting
`linux/amd64` so the files are `openpos-x86_64.AppImage` and
`openpos_amd64.deb`. Do not run `electron-builder --linux` on macOS.
The first container run downloads Node, Electron, and qemu user-mode
emulation and can take a while.

The script fails fast if package versions do not match, checks/tests fail, or
an expected artifact is missing. Publishing is safe to repeat — re-running
overwrites the same keys and refreshes `latest.json`. Still bump the version
when `https://releases.openpos.xyz/releases/latest.json` already has it.

6. Verify the published release:

- `${RELEASE_CDN_BASE_URL}/releases/latest.json` is the new version and lists
  all four assets: `openpos-arm64.zip`, `openpos-arm64.dmg`,
  `openpos-x86_64.AppImage`, `openpos_amd64.deb`.
- Each asset URL (`/v/:version/:name`) returns HTTP 200 with a matching size.
- Install an older build and confirm the desktop app detects, verifies, and installs the update.

## Script Options

```text
--linux              Build Linux targets (AppImage + deb). Uses a container on macOS.
--deb                Build only the Debian package
--mac                Build macOS targets (zip + dmg)
--notes "<text>"     Attach release notes to latest.json
--skip-check         Skip pnpm run check
--skip-test          Skip pnpm run test
--dry-run            Validate, build, and write latest.json without uploading
```

A real publish always passes `--mac --linux` together so `latest.json` lists
zip, dmg, AppImage, and `.deb`. The single-family flags are for local smoke
checks, not for production uploads.

## Local Smoke Checks

For Linux artifact testing on a Linux host:

```bash
pnpm run build:desktop:linux
```

For Linux artifact testing on a Mac (Podman or Docker):

```bash
pnpm run build:desktop:linux:container
```

For macOS artifact testing:

```bash
pnpm run build:desktop:mac
```

Do not commit generated release artifacts from `apps/desktop/dist-electron/`.
