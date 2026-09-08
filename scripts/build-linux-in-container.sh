#!/usr/bin/env bash
# Build OpenPOS Linux packages (AppImage and/or .deb) in a Linux container.
# On macOS this uses Podman or Docker so native modules compile for Linux.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="${ROOT}/apps/desktop/dist-electron"
IMAGE="${OPENPOS_LINUX_IMAGE:-openpos-linux-builder:24}"
PLATFORM="${OPENPOS_LINUX_PLATFORM:-linux/amd64}"
TARGET="linux"
ENGINE=""

usage() {
  cat <<'EOF'
Usage: build-linux-in-container.sh [--target linux|deb|appimage] [--platform linux/amd64|linux/arm64]

Builds Electron Linux artifacts in Podman or Docker and writes them to
apps/desktop/dist-electron/. Defaults to linux/amd64 so the files match the
published x86_64 AppImage and amd64 .deb names.

Examples:
  bash scripts/build-linux-in-container.sh
  bash scripts/build-linux-in-container.sh --target deb
  OPENPOS_LINUX_PLATFORM=linux/arm64 bash scripts/build-linux-in-container.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      if [[ $# -lt 2 ]]; then
        echo "--target requires a value" >&2
        exit 1
      fi
      TARGET="$2"
      shift 2
      ;;
    --target=*)
      TARGET="${1#--target=}"
      shift
      ;;
    --platform)
      if [[ $# -lt 2 ]]; then
        echo "--platform requires a value" >&2
        exit 1
      fi
      PLATFORM="$2"
      shift 2
      ;;
    --platform=*)
      PLATFORM="${1#--platform=}"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$TARGET" in
  linux|deb|appimage) ;;
  *)
    echo "Unknown target: $TARGET (use linux, deb, or appimage)" >&2
    exit 1
    ;;
esac

ensure_engine() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    ENGINE=docker
    return
  fi

  if command -v podman >/dev/null 2>&1; then
    if ! podman info >/dev/null 2>&1; then
      echo "Starting Podman machine..."
      podman machine start
    fi
    if podman info >/dev/null 2>&1; then
      ENGINE=podman
      return
    fi
  fi

  cat <<'EOF' >&2
Docker or a running Podman machine is required to build Linux packages from macOS.

  brew install podman
  podman machine init --cpus 4 --memory 8192 --disk-size 60
  podman machine start

Then re-run this command.
EOF
  exit 1
}

ensure_engine

echo "Linux container build — engine=$ENGINE platform=$PLATFORM target=$TARGET"

mkdir -p "$DIST"

if ! "$ENGINE" image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building image $IMAGE"
  "$ENGINE" build \
    --platform "$PLATFORM" \
    -t "$IMAGE" \
    -f "$ROOT/Dockerfile.linux" \
    "$ROOT/scripts"
else
  echo "Using existing image $IMAGE"
fi

"$ENGINE" run --rm \
  --platform "$PLATFORM" \
  -e "OPENPOS_LINUX_TARGET=$TARGET" \
  -v "$ROOT:/host:ro" \
  -v "$DIST:/out" \
  -v openpos-linux-builder-cache:/cache \
  "$IMAGE"
