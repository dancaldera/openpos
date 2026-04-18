#!/usr/bin/env bash

set -euo pipefail

PROMPT_FD=0

default_config_path() {
  case "$(uname -s)" in
    Darwin)
      printf '%s/Library/Application Support/OpenPOS/config.json' "${HOME:-}"
      ;;
    *)
      local config_home="${XDG_CONFIG_HOME:-${HOME:-}/.config}"
      printf '%s/OpenPOS/config.json' "$config_home"
      ;;
  esac
}

CONFIG_PATH="$(default_config_path)"
CONFIG_DIR="$(dirname "$CONFIG_PATH")"

usage() {
  cat <<'EOF'
Usage: create-desktop-config.sh [--path <config.json>] [--help]

Creates the OpenPOS desktop runtime config file.
The packaged desktop app reads this as its primary runtime config path.

Examples:
  create-desktop-config.sh
  create-desktop-config.sh --path "$HOME/.config/OpenPOS/config.json"
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

setup_prompt_input() {
  if [[ -t 0 ]]; then
    PROMPT_FD=0
    return
  fi

  if { exec 3</dev/tty; } 2>/dev/null; then
    PROMPT_FD=3
    return
  fi

  echo "Interactive input requires a terminal." >&2
  exit 1
}

confirm_overwrite() {
  local answer
  printf 'Config already exists at %s. Overwrite? [y/N]: ' "$CONFIG_PATH"
  read -r -u "$PROMPT_FD" answer
  case "$answer" in
    y|Y|yes|YES)
      return 0
      ;;
    *)
      echo "Aborted."
      exit 0
      ;;
  esac
}

prompt_value() {
  local var_name="$1"
  local label="$2"
  local secret="${3:-false}"
  local value=""

  if [[ "$secret" == "true" ]]; then
    printf '%s: ' "$label"
    read -r -s -u "$PROMPT_FD" value
    printf '\n'
  else
    printf '%s: ' "$label"
    read -r -u "$PROMPT_FD" value
  fi

  printf -v "$var_name" '%s' "$value"
}

write_config() {
  TURSO_DATABASE_URL="$turso_database_url" \
  TURSO_AUTH_TOKEN="$turso_auth_token" \
  API_URL="$api_url" \
  PRINTER_COMMAND="$printer_command" \
  CONFIG_PATH="$CONFIG_PATH" \
  python3 <<'PY'
import json
import os
from pathlib import Path

config = {}

if os.environ["TURSO_DATABASE_URL"].strip():
    config["tursoDatabaseUrl"] = os.environ["TURSO_DATABASE_URL"].strip()

if os.environ["TURSO_AUTH_TOKEN"].strip():
    config["tursoAuthToken"] = os.environ["TURSO_AUTH_TOKEN"].strip()

if os.environ["API_URL"].strip():
    config["apiUrl"] = os.environ["API_URL"].strip()

if os.environ["PRINTER_COMMAND"].strip():
    config["printerCommand"] = os.environ["PRINTER_COMMAND"].strip()

config["printerArgs"] = []

config_path = Path(os.environ["CONFIG_PATH"])
config_path.parent.mkdir(parents=True, exist_ok=True)
config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
PY
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --path)
      if [[ $# -lt 2 ]]; then
        echo "--path requires a value" >&2
        exit 1
      fi
      CONFIG_PATH="$2"
      CONFIG_DIR="$(dirname "$CONFIG_PATH")"
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

if [[ -z "${HOME:-}" ]]; then
  echo "HOME is not set" >&2
  exit 1
fi

require_command python3
setup_prompt_input

echo "OpenPOS desktop config will be written to:"
echo "  ${CONFIG_PATH}"
echo "This is the primary runtime config path used by packaged desktop installs."
echo
echo "Leave any value blank to skip it."
echo

if [[ -f "$CONFIG_PATH" ]]; then
  confirm_overwrite
fi

prompt_value turso_database_url "Turso database URL"
prompt_value turso_auth_token "Turso auth token" true
prompt_value api_url "API URL"
prompt_value printer_command "Printer command"

write_config

echo
echo "Wrote OpenPOS config to ${CONFIG_PATH}"
