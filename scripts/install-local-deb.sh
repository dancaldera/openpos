#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="${ROOT}/apps/desktop/dist-electron"

usage() {
  cat <<'EOF'
Usage: install-local-deb.sh [--deb <path>] [--help]

Installs the OpenPOS Debian package built on this machine.

Examples:
  pnpm run install:deb
  pnpm run install:deb -- --deb apps/desktop/dist-electron/openpos_amd64.deb
EOF
}

DEB=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deb)
      if [[ $# -lt 2 ]]; then
        echo "--deb requires a value" >&2
        exit 1
      fi
      DEB="$2"
      shift 2
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

if [[ -z "$DEB" ]]; then
  shopt -s nullglob
  local_debs=("$DIST"/*.deb)
  shopt -u nullglob

  if [[ ${#local_debs[@]} -eq 0 ]]; then
    echo "No .deb found in ${DIST}." >&2
    echo "Build one first with: pnpm run build:desktop:linux:deb" >&2
    exit 1
  fi

  DEB="$(ls -1t "${local_debs[@]}" | head -n 1)"
fi

if [[ ! -f "$DEB" ]]; then
  echo "Debian package not found: $DEB" >&2
  exit 1
fi

echo "Installing ${DEB}"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  -o Dpkg::Options::=--force-confdef \
  -o Dpkg::Options::=--force-confold \
  --allow-downgrades \
  "$DEB"

echo "Installed OpenPOS. Run: openpos"
