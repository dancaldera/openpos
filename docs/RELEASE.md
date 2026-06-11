# Release Guide

OpenPOS desktop releases are published by `.github/workflows/release.yml`.

The workflow runs when a `vX.Y.Z` tag is pushed, or when it is started manually with a tag. It checks out that tag, installs dependencies, validates that the desktop, API, and landing package versions match the tag, runs the desktop check, builds Linux and macOS desktop artifacts, and publishes a GitHub release with the AppImage, `.deb`, `.dmg`, and `.zip`.

## Release Steps

1. Start from a clean `main` branch:

```bash
git switch main
git pull
git status --short
```

2. Bump the version without the `v` prefix:

```bash
bun run version:bump 0.7.4
```

This updates:

- `package.json`
- `apps/desktop/package.json`
- `apps/api/package.json`
- `apps/landing/package.json`

3. Validate and review:

```bash
bun run check
git diff
```

4. Commit, tag, and push:

```bash
git add package.json apps/desktop/package.json apps/api/package.json apps/landing/package.json
git commit -m "chore: bump version to v0.7.4"
git tag v0.7.4
git push origin main --tags
```

5. Confirm the GitHub Actions release run completes and the GitHub release contains:

- `*.AppImage`
- `*.deb`
- `*.dmg`
- `*.zip`

## Manual Workflow Run

If the tag already exists but the release workflow needs to be rerun, start `Release Desktop` manually and pass the existing tag, for example:

```text
v0.7.4
```

The tag must still match the app package versions or the workflow will fail.

## Local Smoke Checks

For Linux artifact testing:

```bash
bun run build:desktop:linux
```

For macOS artifact testing:

```bash
bun run build:desktop:mac
```

Do not commit generated release artifacts from `apps/desktop/dist-electron/`.
