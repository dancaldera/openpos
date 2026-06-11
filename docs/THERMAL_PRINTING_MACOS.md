# Thermal Receipt Printing on macOS

OpenPOS uses the macOS printing system only. It sends plain receipt text to `lp`, so the already-installed CUPS printer driver handles the device.

## How OpenPOS Chooses a Printer

1. `thermalPrinterName` or `printerName` in OpenPOS `config.json`
2. `OPENPOS_THERMAL_PRINTER`, `OPENPOS_PRINTER_NAME`, or `PRINTER`
3. macOS default printer from `lpstat -d`
4. first installed queue from `lpstat -e`

OpenPOS runs:

```bash
lp
# or, with a configured/discovered printer:
lp -d <printer>
```

## Minimal Setup

1. Add the printer in **System Settings → Printers & Scanners**.
2. Confirm macOS has a queue:

```bash
lpstat -e
```

3. Test the installed driver:

```bash
printf "OpenPOS print test\n\n\n" | lp
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
- If the printer is listed but output is wrong, fix/change the macOS printer driver first; OpenPOS intentionally uses the installed driver.
