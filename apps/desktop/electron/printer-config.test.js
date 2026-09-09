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

  it('queries the host spooler by default', () => {
    const result = discoverSystemPrinterName()
    expect(result === undefined || typeof result === 'string').toBe(true)
  })

  it('skips non-CUPS platforms', () => {
    expect(discoverSystemPrinterName({ platform: 'win32' })).toBeUndefined()
  })

  it('falls back to lpstat -p and parses printer lines', () => {
    const result = discoverSystemPrinterName({
      platform: 'linux',
      execFileSync: (_command, args) => {
        if (args.includes('-d')) return '  \n'
        if (args.includes('-e')) return undefined
        if (args.includes('-p')) return 'printer POS80 is idle. enabled since Mon\n'
        return ''
      },
    })

    expect(result).toBe('POS80')
  })

  it('accepts default destinations without a colon', () => {
    const result = discoverSystemPrinterName({
      platform: 'linux',
      execFileSync: () => 'POS80\n',
    })

    expect(result).toBe('POS80')
  })

  it('returns undefined when lpstat is unavailable', () => {
    const result = discoverSystemPrinterName({
      platform: 'linux',
      execFileSync: () => {
        throw new Error('not found')
      },
    })

    expect(result).toBeUndefined()
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

  it('recognizes every missing-destination phrasing', () => {
    for (const stderr of [
      'lp: Error - no default destination available',
      'lp: Error - Sin destino por omision.',
      'lp: Error - no default printer configured',
      'lp: Error - no destinations added',
    ]) {
      expect(formatPrinterCommandError({ command: 'lp', code: 1, stderr, printerName: '' })).toContain(
        'No printer is configured for OpenPOS.',
      )
    }

    expect(formatPrinterCommandError({ command: 'lp', code: 1, stderr: 123, printerName: '' })).toBe(
      'Printer command "lp" failed with exit code 1',
    )
  })

  it('falls back to a generic failure message', () => {
    expect(formatPrinterCommandError({ command: 'lp', code: 2, printerName: 'p' })).toBe(
      'Printer command "lp" failed with exit code 2',
    )
    expect(formatPrinterCommandError({ command: 'lp', printerName: 'p' })).toBe(
      'Printer command "lp" failed with exit code unknown',
    )
  })

  it('defaults helpers without input', () => {
    const name = resolvePrinterName()
    expect(name === undefined || typeof name === 'string').toBe(true)
    const config = resolvePrinterConfig()
    expect(config.command).toBe('lp')
    expect(config.args).toEqual(['-o', 'raw'])
    expect(typeof config.printerName).toBe('string')
    expect(formatPrinterCommandError()).toBe('Printer command "undefined" failed with exit code unknown')
  })
})
