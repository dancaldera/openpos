#!/usr/bin/env bash

set -euo pipefail

PATH="/usr/sbin:/usr/bin:/bin:${HOME:-}/.local/bin:${PATH:-}"

AUTOSTART_DIR="${XDG_CONFIG_HOME:-${HOME:-}/.config}/autostart"
AUTOSTART_FILE="${AUTOSTART_DIR}/openpos.desktop"
OPENPOS_CONFIG_DIR="${XDG_CONFIG_HOME:-${HOME:-}/.config}/OpenPOS"
AUTOSTART_LAUNCHER="${OPENPOS_CONFIG_DIR}/start-at-login.sh"
STARTUP_LOG="${OPENPOS_CONFIG_DIR}/startup.log"
STARTUP_TEMP_DIR="${OPENPOS_CONFIG_DIR}/tmp"
REMOVE=0
STATUS_ONLY=0
EXEC_PATH=""
STARTUP_DELAY_SECONDS=15

usage() {
  cat <<'EOF'
Usage: setup-pos-station.sh [--exec <openpos>] [--delay <seconds>] [--remove] [--status] [--help]

Sets up this Linux PC as an OpenPOS checkout station:
- Starts OpenPOS after the desktop session settles
- Opens fullscreen (press F11 for windowed mode)

Safe to re-run. Does not change the installed app, only the login autostart entry.

Examples:
  setup-pos-station.sh
  setup-pos-station.sh --exec "$HOME/.local/bin/openpos"
  setup-pos-station.sh --delay 20
  setup-pos-station.sh --status
  setup-pos-station.sh --remove
EOF
}

require_linux() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "This script is for Linux checkout PCs." >&2
    exit 1
  fi
}

desktop_exec_arg() {
  local value="$1"
  if [[ "$value" =~ [[:space:]\"\\] ]]; then
    printf '"%s"' "${value//\"/\\\"}"
    return
  fi
  printf '%s' "$value"
}

resolve_openpos() {
  if [[ -n "$EXEC_PATH" ]]; then
    if [[ ! -x "$EXEC_PATH" ]]; then
      echo "OpenPOS executable not found or not executable: $EXEC_PATH" >&2
      exit 1
    fi
    printf '%s' "$EXEC_PATH"
    return
  fi

  local candidate
  for candidate in \
    "$(command -v openpos 2>/dev/null || true)" \
    "${HOME:-}/.local/bin/openpos" \
    /usr/bin/openpos \
    /usr/local/bin/openpos
  do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      printf '%s' "$candidate"
      return
    fi
  done

  echo "OpenPOS is not installed. Install the .deb or AppImage first." >&2
  echo "Then re-run: bash scripts/setup-pos-station.sh" >&2
  exit 1
}

write_launcher() {
  local exec_path="$1"

  mkdir -p "$OPENPOS_CONFIG_DIR" "$STARTUP_TEMP_DIR"
  chmod 700 "$STARTUP_TEMP_DIR"
  {
    printf '#!/usr/bin/env bash\n\n'
    printf 'sleep %s\n' "$STARTUP_DELAY_SECONDS"
    printf 'unset ELECTRON_RUN_AS_NODE\n'
    printf 'export TMPDIR=%q\n' "$STARTUP_TEMP_DIR"
    printf 'exec %q --no-sandbox >> %q 2>&1\n' "$exec_path" "$STARTUP_LOG"
  } > "$AUTOSTART_LAUNCHER"
  chmod 700 "$AUTOSTART_LAUNCHER"
}

write_autostart() {
  local exec_path="$1"
  local exec_line
  exec_line="$(desktop_exec_arg "$AUTOSTART_LAUNCHER")"

  write_launcher "$exec_path"
  mkdir -p "$AUTOSTART_DIR"
  cat > "$AUTOSTART_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=OpenPOS
Comment=OpenPOS checkout station
Exec=${exec_line}
Terminal=false
X-GNOME-Autostart-enabled=true
StartupNotify=false
Categories=Office;Finance;
EOF
}

show_status() {
  if [[ ! -f "$AUTOSTART_FILE" ]]; then
    echo "Checkout autostart is not installed."
    echo "Expected file: ${AUTOSTART_FILE}"
    return
  fi

  echo "Checkout autostart is installed:"
  echo "  ${AUTOSTART_FILE}"
  echo
  sed -n 's/^Exec=/  Exec=/p' "$AUTOSTART_FILE"
  echo
  echo "OpenPOS starts fullscreen at login. Press F11 for windowed mode."
  echo "Startup log: ${STARTUP_LOG}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --exec)
      if [[ $# -lt 2 ]]; then
        echo "--exec requires a value" >&2
        exit 1
      fi
      EXEC_PATH="$2"
      shift 2
      ;;
    --delay)
      if [[ $# -lt 2 || ! "$2" =~ ^[0-9]+$ ]]; then
        echo "--delay requires a non-negative number of seconds" >&2
        exit 1
      fi
      STARTUP_DELAY_SECONDS="$2"
      shift 2
      ;;
    --remove)
      REMOVE=1
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

if [[ -z "${HOME:-}" ]]; then
  echo "HOME is not set" >&2
  exit 1
fi

require_linux

if [[ "$STATUS_ONLY" -eq 1 ]]; then
  show_status
  exit 0
fi

if [[ "$REMOVE" -eq 1 ]]; then
  rm -f "$AUTOSTART_FILE" "$AUTOSTART_LAUNCHER"
  echo "Removed checkout autostart: ${AUTOSTART_FILE}"
  exit 0
fi

OPENPOS_BIN="$(resolve_openpos)"
write_autostart "$OPENPOS_BIN"

echo "Configured this PC as an OpenPOS checkout station."
echo "  Autostart: ${AUTOSTART_FILE}"
echo "  Launcher:  ${AUTOSTART_LAUNCHER}"
echo "  Command:   ${OPENPOS_BIN} (after ${STARTUP_DELAY_SECONDS}s)"
echo "  Log:       ${STARTUP_LOG}"
echo
echo "OpenPOS will start fullscreen at the next login."
echo "Press F11 anytime to switch to windowed mode."
