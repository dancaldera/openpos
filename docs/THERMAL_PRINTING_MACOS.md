# Thermal Receipt Printing on macOS

OpenPOS prints through the macOS printing system with `lp -o raw`. It renders the receipt as ESC/POS bytes — receipt text plus feed and paper-cut commands — and sends them straight to the printer queue, bypassing driver page formatting.

## How OpenPOS Chooses a Printer

1. `thermalPrinterName` or `printerName` in OpenPOS `config.json`
2. `OPENPOS_THERMAL_PRINTER`, `OPENPOS_PRINTER_NAME`, or `PRINTER`
3. macOS default printer from `lpstat -d`
4. first installed queue from `lpstat -e`

OpenPOS runs:

```bash
lp -o raw
# or, with a configured/discovered printer:
lp -d <printer> -o raw
```

The app appends ESC/POS feed and full-cut commands at the end of every receipt, so the paper advances past the tear bar and the auto-cutter fires.

## Minimal Setup

1. Add the printer in **System Settings → Printers & Scanners**.
2. Confirm macOS has a queue:

```bash
lpstat -e
```

3. Test raw printing:

```bash
printf "OpenPOS print test\n\n\n" | lp -o raw
```

4. Optional: set the default printer:

```bash
lpoptions -d <printer>
```

5. Optional: pin OpenPOS to one queue in `config.json`:

```json
{
  "thermalPrinterName": "POS80"
}
```

## Troubleshooting

- List printer queues: `lpstat -e`
- Show default printer: `lpstat -d`
- Show queue/device details: `lpstat -v`
- If `lp` is missing or no queues appear, add the printer again in macOS settings.
- If the printer is listed but nothing prints, confirm the queue accepts raw jobs: `printf "test\n\n\n" | lp -d <printer> -o raw`.
- If the paper does not cut, the printer is not interpreting ESC/POS — verify the device is an ESC/POS thermal printer and the queue points at it directly.
