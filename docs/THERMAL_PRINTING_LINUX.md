# Thermal Receipt Printing on Linux (Ubuntu / Debian)

OpenPOS prints thermal receipts by sending ESC/POS bytes to the CUPS printing
system with `lp`. The app does not talk to the USB printer directly. The system
must first have a working CUPS printer queue, then OpenPOS can target that
queue.

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

- Set the thermal printer as the system default printer.
- Configure `thermalPrinterName` in OpenPOS `config.json`.

## 1. Confirm the System Sees the Printer

Connect the printer by USB and run:

```bash
lpinfo -v
```

For an ESC/POS USB printer, the output may show something like:

```text
direct usb://PrinterCMD%3AESCPO/POS80%20Printer%20USB?serial=83600000000
```

This only means the USB device is visible. It does not mean CUPS has a printer
queue for it yet.

Now check configured printer queues:

```bash
lpstat -v
```

If the output is empty or says no destinations added, then CUPS has no printer
queue. OpenPOS cannot print until one is added.

## 2. Add a CUPS Queue

On Linux you can create a **raw queue**, which is the simplest setup for
ESC/POS printers.

### 2a. Raw queue (recommended for ESC/POS)

Use the exact URI from `lpinfo -v`:

```bash
sudo lpadmin -p POS80 -E \
  -v 'usb://PrinterCMD%3AESCPO/POS80%20Printer%20USB?serial=83600000000' \
  -m raw
```

### 2b. Generic driver queue

If you prefer a normal queue with a generic driver, first make sure generic
PPDs are available:

```bash
sudo apt update
sudo apt install -y foomatic-db-compressed-ppds
```

List available generic drivers:

```bash
lpinfo -m | grep -i generic
```

Then create the queue:

```bash
sudo lpadmin -p POS80 -E \
  -v 'usb://PrinterCMD%3AESCPO/POS80%20Printer%20USB?serial=83600000000' \
  -m drv:///sample.drv/generic.ppd
```

### Verify the queue

```bash
lpstat -v
```

Expected shape:

```text
device for POS80: usb://PrinterCMD%3AESCPO/POS80%20Printer%20USB?serial=83600000000
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
system default destination: POS80
```

Option B: configure OpenPOS explicitly.

Edit:

```text
~/.config/OpenPOS/config.json
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

### `lp: Error - No default destination.`

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

### `lpstat: No destinations added.`

CUPS sees no configured printer queues. Run `lpinfo -v` to find the USB URI,
then create a queue with `lpadmin` as shown above.

### `lpadmin: Unable to copy PPD file.`

The requested driver is missing. Install generic PPDs:

```bash
sudo apt update
sudo apt install -y foomatic-db-compressed-ppds
```

Then retry the `lpadmin` command with the generic driver, or use `-m raw`.

### The command returns a job ID but says `0 files`

Example:

```text
request id is POS80-4 (0 file(s))
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
`document-format=application/vnd.cups-raw` tests above. If none print, CUPS has
the queue registered but is not sending usable bytes to the device. Re-add the
printer through the CUPS web interface (`http://localhost:631`) or install the
vendor driver if one exists.

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
  -m raw
```
