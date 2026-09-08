# Thermal Receipt Printing on Linux (Ubuntu / Debian)

OpenPOS prints receipts as ESC/POS bytes and sends them with `lp -d POS80 -o raw`. That bypasses page drivers so the printer can feed and cut.

Verified hardware: USB `POS80 Printer USB` (`0416:5011`, Winbond), IEEE 1284 `MFG:PrinterCMD:ESCPO`, node `/dev/usb/lp0`. CUPS URI looks like:

```text
usb://PrinterCMD%3AESCPO/POS80%20Printer%20USB?serial=83600000000
```

Use a **raw** queue. A GNOME/CUPS driver queue will not interpret ESC/POS, so text may print as a blank page and the cutter will not fire.

## Install

```bash
bash scripts/install-pos80-printer.sh
bash scripts/install-pos80-printer.sh --test
```

The script installs CUPS if needed, adds or updates the `POS80` raw queue from `lpinfo -v`, and sets it as the system default. Re-run anytime; it is a no-op when the queue already matches the plugged-in printer.

Optional: pin the desktop app to that queue:

```bash
bash scripts/install-pos80-printer.sh --pin-config
```

```json
{
  "thermalPrinterName": "POS80"
}
```

## How OpenPOS Chooses a Printer

1. `thermalPrinterName` or `printerName` in OpenPOS `config.json`
2. CUPS default from `lpstat -d`
3. first queue from `lpstat -e`, then `lpstat -p`

The app then runs `lp -d <printer> -o raw` (or `lp -o raw` if no name was resolved). Every receipt ends with ESC/POS feed 6 lines (`ESC d 6`) and a full cut (`GS V 0`).

## Test

```bash
printf '\x1b\x40OpenPOS print test\n\n\n\x1b\x64\x06\x1d\x56\x00' | lp -d POS80 -o raw
```

## Troubleshooting

- Status: `bash scripts/install-pos80-printer.sh --status`
- Queues / default / URI: `lpstat -e`, `lpstat -d`, `lpstat -v`
- USB device: `lsusb -d 0416:5011` and `lpinfo -v`
- CUPS down: `systemctl status cups`
- Nothing prints: confirm a raw job: `printf 'test\n\n\n' | lp -d POS80 -o raw`
- Prints but does not cut: the queue is not raw ESC/POS; re-run the installer
- `lpadmin` denied: `sudo usermod -aG lpadmin "$USER"` and log out, or run the script with sudo
