# Thermal Receipt Printing on Linux (Ubuntu / Debian)

OpenPOS prints through the Linux/CUPS printing system with `lp -o raw`. It renders the receipt as ESC/POS bytes — receipt text plus feed and paper-cut commands — and sends them straight to the printer queue, bypassing driver page formatting.

## How OpenPOS Chooses a Printer

1. `thermalPrinterName` or `printerName` in OpenPOS `config.json`
2. `OPENPOS_THERMAL_PRINTER`, `OPENPOS_PRINTER_NAME`, or `PRINTER`
3. CUPS default printer from `lpstat -d`
4. first installed queue from `lpstat -e`

OpenPOS runs:

```bash
lp -o raw
# or, with a configured/discovered printer:
lp -d <printer> -o raw
```

The app appends ESC/POS feed and full-cut commands at the end of every receipt, so the paper advances past the tear bar and the auto-cutter fires. For ESC/POS printers, a raw CUPS queue is the recommended setup:

```bash
# find the device URI, then create a raw queue:
lpinfo -v
sudo lpadmin -p POS80 -E -v '<device-uri-from-lpinfo>' -m raw
```

## Minimal Setup

1. Install CUPS if needed:

```bash
sudo apt update
sudo apt install cups
sudo systemctl enable --now cups
```

2. Add the printer with your desktop printer settings or the CUPS web UI at <http://localhost:631>.

3. Confirm CUPS has a queue:

```bash
lpstat -e
```

4. Test raw printing:

```bash
printf "OpenPOS print test\n\n\n" | lp -o raw
```

5. Optional: set the default printer:

```bash
lpoptions -d <printer>
```

6. Optional: pin OpenPOS to one queue in `config.json`:

```json
{
  "thermalPrinterName": "POS80"
}
```

## Troubleshooting

- List printer queues: `lpstat -e`
- Show default printer: `lpstat -d`
- Show queue/device details: `lpstat -v`
- Show USB devices known to CUPS: `lpinfo -v`
- If `lp` cannot connect, check CUPS: `systemctl status cups`
- If the printer is listed but nothing prints, confirm the queue accepts raw jobs: `printf "test\n\n\n" | lp -d <printer> -o raw`.
- If the paper does not cut, the printer is not interpreting ESC/POS — verify the device is an ESC/POS thermal printer; a raw queue (`lpadmin ... -m raw`) is the most reliable setup.
