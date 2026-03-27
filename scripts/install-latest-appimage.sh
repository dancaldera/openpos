#!/usr/bin/env bash

set -euo pipefail

REPO_OWNER="dancaldera"
REPO_NAME="OpenPOS"
INSTALL_DIR="/usr/local/bin"
VERSION="latest"

usage() {
  cat <<'EOF'
Usage: install-latest-appimage.sh [--version <x.y.z>] [--install-dir <path>] [--help]

Downloads and installs the OpenPOS AppImage from GitHub Releases.

Examples:
  install-latest-appimage.sh
  install-latest-appimage.sh --version 0.3.5
  install-latest-appimage.sh --install-dir "$HOME/.local/bin"
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

normalize_version() {
  local value="$1"
  value="${value#v}"
  if [[ ! "$value" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Invalid version: $1" >&2
    exit 1
  fi
  printf '%s' "$value"
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)
      printf 'x64'
      ;;
    aarch64|arm64)
      printf 'arm64'
      ;;
    *)
      echo "Unsupported architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac
}

download_url() {
  local asset_name="$1"
  if [[ "$VERSION" == "latest" ]]; then
    printf 'https://github.com/%s/%s/releases/latest/download/%s' "$REPO_OWNER" "$REPO_NAME" "$asset_name"
    return
  fi

  printf 'https://github.com/%s/%s/releases/download/v%s/%s' "$REPO_OWNER" "$REPO_NAME" "$VERSION" "$asset_name"
}

install_file() {
  local source="$1"
  local destination="$2"

  if mkdir -p "$INSTALL_DIR" 2>/dev/null && [[ -w "$INSTALL_DIR" ]]; then
    install -m 755 "$source" "$destination"
    return
  fi

  require_command sudo
  sudo mkdir -p "$INSTALL_DIR"
  sudo install -m 755 "$source" "$destination"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      if [[ $# -lt 2 ]]; then
        echo "--version requires a value" >&2
        exit 1
      fi
      VERSION="$(normalize_version "$2")"
      shift 2
      ;;
    --install-dir)
      if [[ $# -lt 2 ]]; then
        echo "--install-dir requires a value" >&2
        exit 1
      fi
      INSTALL_DIR="$2"
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

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer only supports Linux AppImage releases." >&2
  exit 1
fi

require_command curl
require_command install
require_command mktemp

ARCH="$(detect_arch)"
ASSET_NAME="openpos-${ARCH}.AppImage"
DOWNLOAD_URL="$(download_url "$ASSET_NAME")"
TMP_DIR="$(mktemp -d)"
TMP_FILE="${TMP_DIR}/${ASSET_NAME}"
DESTINATION="${INSTALL_DIR}/openpos"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

echo "Downloading ${ASSET_NAME} from ${DOWNLOAD_URL}"
curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "$TMP_FILE" "$DOWNLOAD_URL"
chmod 755 "$TMP_FILE"

install_file "$TMP_FILE" "$DESTINATION"

echo "Installed OpenPOS to ${DESTINATION}"
echo "Run: ${DESTINATION}"
