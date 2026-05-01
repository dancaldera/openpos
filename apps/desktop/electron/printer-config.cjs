function normalizeString(value) {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function resolvePrinterName({ runtimeConfig = {}, processEnv = process.env, envConfig = {} } = {}) {
  return (
    normalizeString(runtimeConfig.thermalPrinterName) ||
    normalizeString(runtimeConfig.printerName) ||
    normalizeString(processEnv.OPENPOS_THERMAL_PRINTER) ||
    normalizeString(processEnv.OPENPOS_PRINTER_NAME) ||
    normalizeString(envConfig.OPENPOS_THERMAL_PRINTER) ||
    normalizeString(envConfig.OPENPOS_PRINTER_NAME) ||
    normalizeString(processEnv.PRINTER)
  )
}

function resolvePrinterConfig(options = {}) {
  const printerName = resolvePrinterName(options)
  const args = printerName ? ['-d', printerName, '-o', 'raw'] : ['-o', 'raw']

  return {
    command: 'lp',
    args,
    printerName: printerName || '',
  }
}

function isMissingDefaultDestinationError(message) {
  const normalized = normalizeString(message)?.toLowerCase() || ''

  return (
    normalized.includes('no default destination') ||
    normalized.includes('sin destino por omisión') ||
    normalized.includes('sin destino por omision') ||
    normalized.includes('no default printer')
  )
}

function formatPrinterCommandError({ command, code, stderr, printerName } = {}) {
  const details = normalizeString(stderr)

  if (!printerName && isMissingDefaultDestinationError(details)) {
    return [
      'No thermal printer is configured for OpenPOS.',
      'Set a system default printer with `lpoptions -d <printer>` or add `thermalPrinterName` to the OpenPOS config.json file.',
      details ? `CUPS error: ${details}` : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  if (details) {
    return details
  }

  return `Printer command "${command}" failed with exit code ${code ?? 'unknown'}`
}

module.exports = {
  formatPrinterCommandError,
  resolvePrinterConfig,
  resolvePrinterName,
}
