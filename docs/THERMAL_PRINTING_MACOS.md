# Thermal Receipt Printing on macOS

OpenPOS prints receipts as ESC/POS bytes and sends them with `lp -o raw` (or `lp -d <printer> -o raw`). That bypasses page drivers so the printer can feed and cut.

Verified hardware is the same USB POS80 class used on Linux: `POS80 Printer USB` (`0416:5011`), command set ESC/POS. Add it in **System Settings → Printers & Scanners**, then prefer a raw/generic queue rather than a raster driver.

## How OpenPOS Chooses a Printer

1. `thermalPrinterName` or `printerName` in OpenPOS `config.json`
2. macOS default from `lpstat -d`
3. first queue from `lpstat -e`, then `lpstat -p`

Every receipt ends with ESC/POS feed 6 lines (`ESC d 6`) and a full cut (`GS V 0`).

## Setup

```bash
lpstat -e
lpoptions -d POS80
printf '\x1b\x40OpenPOS print test\n\n\n\x1b\x64\x06\x1d\x56\x00' | lp -d POS80 -o raw
```

Optional pin in `~/Library/Application Support/OpenPOS/config.json`:

```json
{
  "thermalPrinterName": "POS80"
}
```

## Troubleshooting

- Queues / default / URI: `lpstat -e`, `lpstat -d`, `lpstat -v`
- No queues: add the printer again in System Settings
- Nothing prints: `printf 'test\n\n\n' | lp -d POS80 -o raw`
- Prints but does not cut: the queue is not sending raw ESC/POS to the POS80
