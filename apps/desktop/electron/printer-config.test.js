const { describe, expect, it } = require('bun:test')
const {
  formatPrinterCommandError,
  resolvePrinterConfig,
  resolvePrinterName,
} = require('./printer-config.cjs')

describe('resolvePrinterName', () => {
  it('prefers runtime thermal printer config', () => {
    const result = resolvePrinterName({
      runtimeConfig: {
        thermalPrinterName: 'Receipt_Printer',
        printerName: 'Backup_Printer',
      },
      processEnv: {
        OPENPOS_THERMAL_PRINTER: 'Env_Printer',
      },
    })

    expect(result).toBe('Receipt_Printer')
  })

  it('falls back to OpenPOS environment variables before CUPS PRINTER', () => {
    const result = resolvePrinterName({
      runtimeConfig: {},
      processEnv: {
        OPENPOS_PRINTER_NAME: 'OpenPOS_Printer',
        PRINTER: 'System_Printer',
      },
    })

    expect(result).toBe('OpenPOS_Printer')
  })
})

describe('resolvePrinterConfig', () => {
  it('prints to the default destination when no printer name is configured', () => {
    const result = resolvePrinterConfig({
      runtimeConfig: {},
      processEnv: {},
      envConfig: {},
    })

    expect(result).toEqual({
      command: 'lp',
      args: ['-o', 'raw'],
      printerName: '',
    })
  })

  it('passes an explicit CUPS destination when configured', () => {
    const result = resolvePrinterConfig({
      runtimeConfig: {
        thermalPrinterName: 'Thermal_80mm',
      },
      processEnv: {},
      envConfig: {},
    })

    expect(result).toEqual({
      command: 'lp',
      args: ['-d', 'Thermal_80mm', '-o', 'raw'],
      printerName: 'Thermal_80mm',
    })
  })
})

describe('formatPrinterCommandError', () => {
  it('adds setup guidance when CUPS has no default destination', () => {
    const result = formatPrinterCommandError({
      command: 'lp',
      code: 1,
      stderr: 'lp: Error - Sin destino por omisión.',
      printerName: '',
    })

    expect(result).toContain('No thermal printer is configured for OpenPOS.')
    expect(result).toContain('thermalPrinterName')
    expect(result).toContain('lpoptions -d <printer>')
  })

  it('keeps printer-specific command errors intact', () => {
    const result = formatPrinterCommandError({
      command: 'lp',
      code: 1,
      stderr: 'lp: Unknown destination "missing"',
      printerName: 'missing',
    })

    expect(result).toBe('lp: Unknown destination "missing"')
  })
})
