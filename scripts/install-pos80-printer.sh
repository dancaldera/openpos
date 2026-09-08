#!/usr/bin/env bash

set -euo pipefail

PATH="/usr/sbin:/usr/bin:/bin:${PATH:-}"

QUEUE="POS80"
DO_TEST=0
DO_PIN_CONFIG=0
STATUS_ONLY=0

usage() {
  cat <<'EOF'
Usage: install-pos80-printer.sh [--test] [--pin-config] [--status] [--help]

Installs the USB POS80 ESC/POS receipt printer as a raw CUPS queue on Ubuntu/Debian.
Safe to re-run: it only changes CUPS when the queue is missing or the USB URI changed.

Examples:
  install-pos80-printer.sh
  install-pos80-printer.sh --test
  install-pos80-printer.sh --status
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

in_lpadmin_group() {
  id -nG 2>/dev/null | tr ' ' '\n' | grep -qx lpadmin
}

run_cups_admin() {
  if in_lpadmin_group; then
    "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi

  echo "CUPS admin needs the lpadmin group or sudo." >&2
  echo "Add this user with: sudo usermod -aG lpadmin ${USER:-}" >&2
  exit 1
}

queue_exists() {
  lpstat -e 2>/dev/null | grep -qx "$QUEUE"
}

queue_uri() {
  lpoptions -p "$QUEUE" 2>/dev/null | tr ' ' '\n' | sed -n 's/^device-uri=//p' | head -n 1
}

discover_usb_uri() {
  local lines preferred fallback

  lines="$(lpinfo -v 2>/dev/null || true)"
  preferred="$(printf '%s\n' "$lines" | awk '/^direct usb:\/\// && /POS80/ { sub(/^direct /, ""); print; exit }')"
  if [[ -n "$preferred" ]]; then
    printf '%s\n' "$preferred"
    return
  fi

  fallback="$(printf '%s\n' "$lines" | awk '/^direct usb:\/\// && /ESCPO|ESC\/POS|ESCPOS/ { sub(/^direct /, ""); print; exit }')"
  if [[ -n "$fallback" ]]; then
    printf '%s\n' "$fallback"
  fi
}

ensure_debian_family() {
  local id_like=""
  local distro_id=""

  if [[ ! -r /etc/os-release ]]; then
    echo "This installer supports Ubuntu/Debian. /etc/os-release is missing." >&2
    exit 1
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  distro_id="${ID:-}"
  id_like="${ID_LIKE:-}"

  case " ${distro_id} ${id_like} " in
    *\ ubuntu\ *|*\ debian\ *)
      return
      ;;
  esac

  echo "This installer supports Ubuntu/Debian (found ID=${distro_id:-unknown})." >&2
  exit 1
}

ensure_cups() {
  if ! command -v lp >/dev/null 2>&1 || ! command -v lpadmin >/dev/null 2>&1; then
    echo "Installing CUPS..."
    require_command sudo
    sudo apt-get update
    sudo apt-get install -y cups
  fi

  require_command lp
  require_command lpstat
  require_command lpinfo
  require_command lpadmin
  require_command lpoptions

  if command -v systemctl >/dev/null 2>&1; then
    if ! systemctl is-active --quiet cups 2>/dev/null; then
      echo "Starting CUPS..."
      sudo systemctl enable --now cups
    fi
  fi
}

print_status() {
  echo "Queue:          ${QUEUE}"
  echo "USB node:       $(ls /dev/usb/lp0 2>/dev/null || echo 'not present')"
  echo "USB device:     $(lsusb -d 0416:5011 2>/dev/null || echo '0416:5011 not present')"
  echo "CUPS USB URI:   $(discover_usb_uri || true)"
  if queue_exists; then
    echo "Installed URI:  $(queue_uri)"
  else
    echo "Installed URI:  (no ${QUEUE} queue)"
  fi
  echo "Default:        $(lpstat -d 2>/dev/null || true)"
  echo "OpenPOS uses:   lp -d ${QUEUE} -o raw"
}

pin_desktop_config() {
  local config_home="${XDG_CONFIG_HOME:-${HOME:-}/.config}"
  local config_path="${config_home}/OpenPOS/config.json"

  require_command python3
  QUEUE="$QUEUE" CONFIG_PATH="$config_path" python3 <<'PY'
import json
import os
from pathlib import Path

config_path = Path(os.environ["CONFIG_PATH"])
queue = os.environ["QUEUE"]
config = {}

if config_path.exists():
    try:
        loaded = json.loads(config_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SystemExit(f"OpenPOS config is not valid JSON: {config_path}: {error}") from error
    if isinstance(loaded, dict):
        config = loaded

config["thermalPrinterName"] = queue
config_path.parent.mkdir(parents=True, exist_ok=True)
config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
print(f"Pinned thermalPrinterName={queue} in {config_path}")
PY
}

send_test_page() {
  echo "Sending ESC/POS test to ${QUEUE} (feed + full cut)..."
  printf '\x1b\x40OpenPOS POS80 test\n%s\n\nIf this prints and cuts, OpenPOS is ready.\n\x1b\x64\x06\x1d\x56\x00' "$(date '+%Y-%m-%d %H:%M:%S')" |
    lp -d "$QUEUE" -o raw -t 'OpenPOS printer test'
}

install_queue() {
  local usb_uri existing

  usb_uri="$(discover_usb_uri || true)"
  existing=""
  if queue_exists; then
    existing="$(queue_uri)"
  fi

  if [[ -z "$usb_uri" ]]; then
    if [[ -n "$existing" ]]; then
      echo "POS80 queue already exists (${existing}). Plug the printer in to refresh the USB URI."
      return
    fi

    echo "No USB POS80 / ESC/POS printer found." >&2
    echo "Plug in the POS80 Printer USB (0416:5011), then run: lpinfo -v" >&2
    exit 1
  fi

  if [[ "$existing" == "$usb_uri" ]]; then
    echo "POS80 raw queue already installed (${usb_uri})."
  else
    if [[ -n "$existing" ]]; then
      echo "Updating ${QUEUE} URI:"
      echo "  ${existing}"
      echo "  -> ${usb_uri}"
    else
      echo "Creating raw CUPS queue ${QUEUE} at ${usb_uri}"
    fi

    # CUPS may warn that raw queues are deprecated. Keep raw anyway: ESC/POS
    # receipts must bypass page-description drivers.
    run_cups_admin lpadmin -p "$QUEUE" -E -v "$usb_uri" -m raw
  fi

  run_cups_admin lpoptions -d "$QUEUE" >/dev/null
  echo "Default printer is ${QUEUE}."
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --test)
      DO_TEST=1
      shift
      ;;
    --pin-config)
      DO_PIN_CONFIG=1
      shift
      ;;
    --status)
      STATUS_ONLY=1
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

ensure_debian_family
ensure_cups

if [[ "$STATUS_ONLY" -eq 1 ]]; then
  print_status
  exit 0
fi

install_queue

if [[ "$DO_PIN_CONFIG" -eq 1 ]]; then
  pin_desktop_config
fi

print_status

if [[ "$DO_TEST" -eq 1 ]]; then
  send_test_page
fi
