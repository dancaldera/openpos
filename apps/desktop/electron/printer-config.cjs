const { execFileSync } = require('node:child_process')

function normalizeString(value) {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function parseDefaultDestination(output) {
  const line = normalizeString(String(output || '').split(/\r?\n/).find((item) => normalizeString(item)) || '')
  if (!line || /no .*default|sin .*destino|no destinations?/i.test(line)) {
    return undefined
  }

  return normalizeString(line.includes(':') ? line.slice(line.indexOf(':') + 1) : line)
}

function parsePrinterList(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => normalizeString(line))
    .filter(Boolean)
    .map((line) => {
      const printerMatch = line.match(/^printer\s+(\S+)/i)
      return printerMatch ? printerMatch[1] : line
    })
    .filter((line) => !/no destinations?|scheduler is not running/i.test(line))
}

function readLpstat(args, execFileSyncFn = execFileSync) {
  try {
    return execFileSyncFn('lpstat', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    })
  } catch {
    return ''
  }
}

function discoverSystemPrinterName({ platform = process.platform, execFileSync: execFileSyncFn = execFileSync } = {}) {
  if (!['darwin', 'linux'].includes(platform)) {
    return undefined
  }

  return (
    parseDefaultDestination(readLpstat(['-d'], execFileSyncFn)) ||
    parsePrinterList(readLpstat(['-e'], execFileSyncFn))[0] ||
    parsePrinterList(readLpstat(['-p'], execFileSyncFn))[0]
  )
}

function resolvePrinterName(options = {}) {
  const { runtimeConfig = {}, processEnv = process.env, envConfig = {} } = options

  return (
    normalizeString(runtimeConfig.thermalPrinterName) ||
    normalizeString(runtimeConfig.printerName) ||
    normalizeString(processEnv.OPENPOS_THERMAL_PRINTER) ||
    normalizeString(processEnv.OPENPOS_PRINTER_NAME) ||
    normalizeString(envConfig.OPENPOS_THERMAL_PRINTER) ||
    normalizeString(envConfig.OPENPOS_PRINTER_NAME) ||
    normalizeString(processEnv.PRINTER) ||
    (options.discover ? discoverSystemPrinterName(options) : undefined)
  )
}

function resolvePrinterConfig(options = {}) {
  const printerName = resolvePrinterName(options)

  return {
    command: 'lp',
    args: printerName ? ['-d', printerName] : [],
    printerName: printerName || '',
  }
}

function isMissingDefaultDestinationError(message) {
  const normalized = normalizeString(message)?.toLowerCase() || ''

  return (
    normalized.includes('no default destination') ||
    normalized.includes('sin destino por omisión') ||
    normalized.includes('sin destino por omision') ||
    normalized.includes('no default printer') ||
    normalized.includes('no destinations added')
  )
}

function formatPrinterCommandError({ command, code, stderr, printerName } = {}) {
  const details = normalizeString(stderr)

  if (!printerName && isMissingDefaultDestinationError(details)) {
    return [
      'No printer is configured for OpenPOS.',
      'Set a system default printer with `lpoptions -d <printer>` or add `thermalPrinterName` to the OpenPOS config.json file.',
      'List installed printer queues with `lpstat -e`.',
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
  discoverSystemPrinterName,
  formatPrinterCommandError,
  resolvePrinterConfig,
  resolvePrinterName,
}
