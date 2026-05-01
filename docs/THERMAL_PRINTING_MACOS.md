# Thermal Receipt Printing on macOS

OpenPOS prints thermal receipts by sending ESC/POS bytes to the macOS printing
system with `lp`. The app does not talk to the USB printer directly. macOS must
first have a working CUPS printer queue, then OpenPOS can target that queue.

## How OpenPOS Prints

The Electron app renders the receipt as plain ESC/POS text, adds feed and cut
commands, and writes the bytes to:

```bash
lp -o raw
```

If `thermalPrinterName` is configured, OpenPOS uses:

```bash
lp -d <thermalPrinterName> -o raw
```

This means there are two valid setups:

- Set the thermal printer as the macOS default printer.
- Configure `thermalPrinterName` in OpenPOS `config.json`.

## 1. Confirm macOS Sees the Printer

Connect the printer by USB and run:

```bash
lpinfo -v
```

For an ESC/POS USB printer, macOS may show something like:

```text
direct usb://PrinterCMD%3AESCPO/POS80%20Printer%20USB?serial=83600000000
```

This only means the USB device is visible. It does not mean macOS has a printer
queue for it yet.

Now check configured printer queues:

```bash
lpstat -v
```

If the output is:

```text
lpstat: No se han añadido destinos.
```

or:

```text
lpstat: No destinations added.
```

then CUPS has no printer queue. OpenPOS cannot print until one is added.

## 2. Add a CUPS Queue

macOS no longer supports creating raw queues with:

```bash
sudo lpadmin -p POS80 -E -v '<usb-uri>' -m raw
```

That command fails with:

```text
lpadmin: ya no se admiten colas sin procesar en macOS.
```

or:

```text
lpadmin: Raw queues are deprecated and no longer supported on macOS.
```

Use a normal CUPS queue instead. First list available generic drivers:

```bash
lpinfo -m | grep -i generic
```

On many macOS installs this includes:

```text
drv:///sample.drv/generic.ppd Generic PostScript Printer
drv:///sample.drv/generpcl.ppd Generic PCL Laser Printer
```

Create a queue for the USB device. Replace the URI with the exact value from
`lpinfo -v`:

```bash
sudo lpadmin -p POS80 -E \
  -v 'usb://PrinterCMD%3AESCPO/POS80%20Printer%20USB?serial=83600000000' \
  -m drv:///sample.drv/generic.ppd
```

Verify that the queue exists:

```bash
lpstat -v
```

Expected shape:

```text
dispositivo para POS80: usb://PrinterCMD%3AESCPO/POS80%20Printer%20USB?serial=83600000000
```

The queue name in this example is `POS80`.

## 3. Configure the Printer for OpenPOS

Option A: make it the system default printer:

```bash
lpoptions -d POS80
lpstat -d
```

Expected shape:

```text
destino del sistema por omisión: POS80
```

Option B: configure OpenPOS explicitly.

Edit:

```text
~/Library/Application Support/OpenPOS/config.json
```

Add the queue name:

```json
{
  "thermalPrinterName": "POS80"
}
```

If the file already has other settings, keep them and add only the
`thermalPrinterName` field:

```json
{
  "tursoDatabaseUrl": "libsql://your-db.turso.io",
  "tursoAuthToken": "your-token-here",
  "apiUrl": "https://your-api.example.com",
  "thermalPrinterName": "POS80"
}
```

Restart OpenPOS after changing `config.json`.

## 4. Test ESC/POS Output

Test the queue directly:

```bash
printf '\x1b@OpenPOS print test\n\n\n\x1dV\x00' | lp -d POS80 -o raw -
```

The final `-` tells `lp` to read the receipt bytes from stdin.

If that does not print, try `lpr` in literal mode:

```bash
printf '\x1b@OpenPOS print test\n\n\n\x1dV\x00' | lpr -P POS80 -l
```

Also try declaring the raw CUPS MIME type explicitly:

```bash
printf '\x1b@OpenPOS print test\n\n\n\x1dV\x00' | lp -d POS80 -o document-format=application/vnd.cups-raw -
```

If at least one of these commands prints, the CUPS queue can send ESC/POS bytes
to the printer.

## 5. Print From OpenPOS

After the queue is working:

1. Restart OpenPOS.
2. Print a receipt from an order.
3. If OpenPOS is using the default printer, confirm `lpstat -d` shows the
   thermal queue.
4. If OpenPOS is using `thermalPrinterName`, confirm the value exactly matches
   the queue name from `lpstat -v`.

Queue names are case-sensitive. `POS80` and `pos80` are different names.

## Troubleshooting

### `lp: Error - Sin destino por omisión.`

No default printer is configured.

Fix it by setting a default:

```bash
lpoptions -d POS80
```

or by adding this to OpenPOS `config.json`:

```json
{
  "thermalPrinterName": "POS80"
}
```

### `lpstat: No se han añadido destinos.`

macOS sees no configured printer queues. Run `lpinfo -v` to find the USB URI,
then create a queue with `lpadmin` as shown above.

### `lpadmin: ya no se admiten colas sin procesar en macOS.`

Do not use `-m raw` on macOS. Create a normal queue with a generic driver and
send jobs with `lp -o raw` instead.

### The command returns a job ID but says `0 archivos`

Example:

```text
el id de la petición es POS80-4 (0 archivos)
```

Check whether the final `-` was included:

```bash
printf '\x1b@OpenPOS print test\n\n\n\x1dV\x00' | lp -d POS80 -o raw -
```

Then inspect the queue:

```bash
lpstat -p POS80
lpq -P POS80
```

If the queue is ready and empty but nothing prints, try the `lpr -l` and
`document-format=application/vnd.cups-raw` tests above. If none print, macOS has
the queue registered but is not sending usable bytes to the device. Re-add the
printer through System Settings or install the vendor driver if one exists.

### The printer cuts before the receipt finishes

OpenPOS feeds paper before issuing the ESC/POS cut command. The current Electron
receipt buffer feeds 6 lines before cutting. If the physical cutter still clips
the last line, increase the feed count in `createEscposReceiptBuffer` in:

```text
apps/desktop/electron/main.cjs
```

The relevant command is:

```js
Buffer.from([0x1b, 0x64, 0x06])
```

`0x06` means 6 feed lines. For example, `0x08` feeds 8 lines.

## Useful Commands

List visible printer devices:

```bash
lpinfo -v
```

List configured queues:

```bash
lpstat -v
```

Show the default printer:

```bash
lpstat -d
```

Set the default printer:

```bash
lpoptions -d POS80
```

Check queue status:

```bash
lpstat -p POS80
lpq -P POS80
```

Remove and recreate a queue:

```bash
sudo lpadmin -x POS80
sudo lpadmin -p POS80 -E \
  -v 'usb://PrinterCMD%3AESCPO/POS80%20Printer%20USB?serial=83600000000' \
  -m drv:///sample.drv/generic.ppd
```
