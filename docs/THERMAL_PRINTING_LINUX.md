# Thermal Receipt Printing on Linux (Ubuntu / Debian)

OpenPOS uses the Linux/CUPS printing system only. It sends plain receipt text to `lp`, so the already-installed printer driver handles the device.

## How OpenPOS Chooses a Printer

1. `thermalPrinterName` or `printerName` in OpenPOS `config.json`
2. `OPENPOS_THERMAL_PRINTER`, `OPENPOS_PRINTER_NAME`, or `PRINTER`
3. CUPS default printer from `lpstat -d`
4. first installed queue from `lpstat -e`

OpenPOS runs:

```bash
lp
# or, with a configured/discovered printer:
lp -d <printer>
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

4. Test the installed driver:

```bash
printf "OpenPOS print test\n\n\n" | lp
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
- If the printer is listed but output is wrong, fix/change the CUPS printer driver first; OpenPOS intentionally uses the installed driver.
