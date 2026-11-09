#!/usr/bin/env bash
# Runs inside the Linux builder image. Copies the mounted repo (without host
# node_modules), installs dependencies, and builds Electron Linux packages.

set -euo pipefail

TARGET="${OPENPOS_LINUX_TARGET:-linux}"
case "$TARGET" in
  linux) SCRIPT="build:desktop:linux" ;;
  deb) SCRIPT="build:desktop:linux:deb" ;;
  appimage) SCRIPT="build:desktop:linux:appimage" ;;
  *)
    echo "Unknown OPENPOS_LINUX_TARGET=$TARGET (use linux, deb, or appimage)" >&2
    exit 1
    ;;
esac

if [[ ! -d /host ]]; then
  echo "Mount the OpenPOS repo at /host" >&2
  exit 1
fi

mkdir -p /cache/desktop /cache/pnpm-store /cache/pnpm /cache/corepack /project /out

rsync -a --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude dist \
  --exclude dist-electron \
  --exclude dist-web \
  --exclude .cache \
  --exclude apps/api/data \
  /host/ /project/

# pnpm 11 aborts on exit after downloading packages when Node runs under x86-64
# emulation on Apple Silicon (libuv `uv__io_poll: Assertion errno == EEXIST`),
# which kills the install and the build. pnpm 10 reads the same v9 lockfile
# and does not hit it, so the disposable /project copy is pinned to it.
PNPM_VERSION="${OPENPOS_LINUX_PNPM_VERSION:-10.30.0}"
sed -i -E "s/\"packageManager\": \"pnpm@[^\"]+\"/\"packageManager\": \"pnpm@${PNPM_VERSION}\"/" \
  /project/package.json /project/apps/*/package.json /project/packages/*/package.json

rm -rf /project/apps/desktop/.cache
mkdir -p /project/apps/desktop
ln -sfn /cache/desktop /project/apps/desktop/.cache

export COREPACK_HOME=/cache/corepack
export PNPM_HOME=/cache/pnpm
export PNPM_STORE_DIR=/cache/pnpm-store
export PATH="$PNPM_HOME:$PATH"
# electron-builder on overlayfs cannot hard-link Electron's unpacked files.
export USE_HARD_LINKS=false
export APPIMAGE_EXTRACT_AND_RUN=1
# Go tools in the build (esbuild, electron-builder's app-builder) crash in their
# garbage collector under x86-64 emulation on Apple Silicon. Their runs are
# short, so skip GC and keep them on one thread.
export GOGC="${GOGC:-off}"
export GOMAXPROCS="${GOMAXPROCS:-1}"

cd /project
corepack enable
corepack prepare "pnpm@${PNPM_VERSION}" --activate

echo "Building $SCRIPT on $(uname -m) ($(uname -s))"
pnpm install --frozen-lockfile --ignore-scripts --store-dir /cache/pnpm-store --filter openpos-desktop... --filter @openpos/data
pnpm -C apps/desktop run "$SCRIPT"

shopt -s nullglob
artifacts=(/project/apps/desktop/dist-electron/*.{AppImage,deb})
if [[ ${#artifacts[@]} -eq 0 ]]; then
  echo "No AppImage or .deb produced in apps/desktop/dist-electron" >&2
  ls -la /project/apps/desktop/dist-electron >&2 || true
  exit 1
fi

cp -a /project/apps/desktop/dist-electron/. /out/
echo "Copied ${#artifacts[@]} Linux artifact(s) to /out"
ls -lh "${artifacts[@]}"
