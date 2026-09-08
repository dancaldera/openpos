import { describe, expect, it } from 'vitest'
const {
  discoverSystemPrinterName,
  formatPrinterCommandError,
  resolvePrinterConfig,
  resolvePrinterName,
} = await import('./printer-config.cjs')

describe('resolvePrinterName', () => {
  it('prefers runtime thermal printer config', () => {
    const result = resolvePrinterName({
      runtimeConfig: {
        thermalPrinterName: 'Receipt_Printer',
        printerName: 'Backup_Printer',
      },
    })

    expect(result).toBe('Receipt_Printer')
  })


  it('discovers a system printer when requested', () => {
    const calls = []
    const result = resolvePrinterName({
      runtimeConfig: {},
      platform: 'linux',
      discover: true,
      execFileSync: (_command, args) => {
        calls.push(args.join(' '))
        return args.includes('-d') ? 'system default destination: POS80\n' : ''
      },
    })

    expect(result).toBe('POS80')
    expect(calls).toEqual(['-d'])
  })
})

describe('discoverSystemPrinterName', () => {
  it('uses the first installed printer when no default is set', () => {
    const result = discoverSystemPrinterName({
      platform: 'darwin',
      execFileSync: (_command, args) => {
        if (args.includes('-d')) return 'no system default destination\n'
        if (args.includes('-e')) return 'Kitchen_Printer\nOffice_Printer\n'
        return ''
      },
    })

    expect(result).toBe('Kitchen_Printer')
  })
})

describe('resolvePrinterConfig', () => {
  it('prints to the default destination when no printer name is configured', () => {
    const result = resolvePrinterConfig({
      runtimeConfig: {},
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

    expect(result).toContain('No printer is configured for OpenPOS.')
    expect(result).toContain('thermalPrinterName')
    expect(result).toContain('lpoptions -d <printer>')
    expect(result).toContain('lpstat -e')
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
