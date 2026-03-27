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

release_api_url() {
  if [[ "$VERSION" == "latest" ]]; then
    printf 'https://api.github.com/repos/%s/%s/releases/latest' "$REPO_OWNER" "$REPO_NAME"
    return
  fi

  printf 'https://api.github.com/repos/%s/%s/releases/tags/v%s' "$REPO_OWNER" "$REPO_NAME" "$VERSION"
}

arch_match_tokens() {
  case "$1" in
    x64)
      printf '%s\n' 'x64' 'x86_64' 'amd64'
      ;;
    arm64)
      printf '%s\n' 'arm64' 'aarch64'
      ;;
    *)
      printf '%s\n' "$1"
      ;;
  esac
}

extract_download_url_from_release_json() {
  local release_json="$1"
  local arch="$2"

  RELEASE_JSON="$release_json" python3 - "$arch" <<'PY'
import json
import os
import sys

arch = sys.argv[1].lower()

if arch == "x64":
    arch_tokens = ("x64", "x86_64", "amd64")
elif arch == "arm64":
    arch_tokens = ("arm64", "aarch64")
else:
    arch_tokens = (arch,)

payload = json.loads(os.environ["RELEASE_JSON"])
assets = payload.get("assets") or []
appimages = [
    asset
    for asset in assets
    if isinstance(asset, dict)
    and isinstance(asset.get("name"), str)
    and asset["name"].lower().endswith(".appimage")
    and isinstance(asset.get("browser_download_url"), str)
]

selected = None
for asset in appimages:
    name = asset["name"].lower()
    if any(token in name for token in arch_tokens):
        selected = asset
        break

if selected is None and len(appimages) == 1:
    selected = appimages[0]

if selected is None:
    sys.exit(1)

sys.stdout.write(selected["browser_download_url"])
PY
}

probe_download_url() {
  local arch="$1"
  local -a candidates=()
  local -a arch_names=()

  mapfile -t arch_names < <(arch_match_tokens "$arch")

  if [[ "$VERSION" == "latest" ]]; then
    local token
    for token in "${arch_names[@]}"; do
      candidates+=("openpos-${token}.AppImage")
    done
    candidates+=("openpos.AppImage")
  else
    local token
    for token in "${arch_names[@]}"; do
      candidates+=(
        "openpos-${VERSION}-${token}.AppImage"
        "openpos-${token}.AppImage"
      )
    done
    candidates+=("openpos-${VERSION}.AppImage" "openpos.AppImage")
  fi

  local asset_name url
  for asset_name in "${candidates[@]}"; do
    if [[ "$VERSION" == "latest" ]]; then
      url="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/${asset_name}"
    else
      url="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/v${VERSION}/${asset_name}"
    fi

    if curl --fail --silent --show-error --location --head --proto '=https' --tlsv1.2 "$url" >/dev/null 2>&1; then
      printf '%s' "$url"
      return 0
    fi
  done

  return 1
}

resolve_download_url() {
  local arch="$1"
  local release_json=""

  release_json="$(curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    -H 'Accept: application/vnd.github+json' \
    "$(release_api_url)" 2>/dev/null || true)"

  if [[ -n "$release_json" ]] && command -v python3 >/dev/null 2>&1; then
    if extract_download_url_from_release_json "$release_json" "$arch"; then
      return 0
    fi
  fi

  probe_download_url "$arch"
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
DOWNLOAD_URL="$(resolve_download_url "$ARCH")" || {
  echo "Unable to find a matching AppImage asset for version ${VERSION} on ${ARCH}" >&2
  exit 1
}
ASSET_NAME="$(basename "${DOWNLOAD_URL%%\?*}")"
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
