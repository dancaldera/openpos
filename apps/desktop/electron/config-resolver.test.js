import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const {
  createPublicConnectionConfig,
  desktopFirstRunNeedsApiSetup,
  getDesktopRuntimeConfigCandidates,
  normalizeDesktopApiUrl,
  resetDesktopRuntimeConfig,
  resolveDesktopConnectionConfig,
  resolveDesktopRuntimeConfigPath,
  writeDesktopRuntimeConfig,
} = await import('./config-resolver.cjs')

describe('getDesktopRuntimeConfigCandidates', () => {
  it('returns the userData config path', () => {
    const result = getDesktopRuntimeConfigCandidates({
      userDataPath: '/home/ana/.config/OpenPOS',
      platform: 'linux',
    })

    expect(result).toEqual([
      {
        path: '/home/ana/.config/OpenPOS/config.json',
        source: 'userData',
      },
    ])
  })

  it('returns an empty list when userDataPath is missing', () => {
    const result = getDesktopRuntimeConfigCandidates({
      userDataPath: '',
      platform: 'linux',
    })

    expect(result).toEqual([])
  })

  it('adds the macOS ~/.config fallback after userData', () => {
    const result = getDesktopRuntimeConfigCandidates({
      homeDir: '/Users/ana',
      userDataPath: '/Users/ana/Library/Application Support/OpenPOS',
      platform: 'darwin',
    })

    expect(result).toEqual([
      {
        path: '/Users/ana/Library/Application Support/OpenPOS/config.json',
        source: 'userData',
      },
      {
        path: '/Users/ana/.config/OpenPOS/config.json',
        source: 'fallback',
      },
    ])
  })
})

describe('resolveDesktopRuntimeConfigPath', () => {
  it('returns the userData config path when the file exists', () => {
    const result = resolveDesktopRuntimeConfigPath({
      userDataPath: '/home/ana/.config/OpenPOS',
      platform: 'linux',
      fileExists: (candidatePath) => candidatePath === '/home/ana/.config/OpenPOS/config.json',
    })

    expect(result).toEqual({
      path: '/home/ana/.config/OpenPOS/config.json',
      source: 'userData',
      exists: true,
    })
  })

  it('returns the preferred userData path when no runtime config file exists', () => {
    const result = resolveDesktopRuntimeConfigPath({
      userDataPath: '/home/ana/.config/OpenPOS',
      platform: 'linux',
      fileExists: () => false,
    })

    expect(result).toEqual({
      path: '/home/ana/.config/OpenPOS/config.json',
      source: 'userData',
      exists: false,
    })
  })

  it('returns an empty selection when userDataPath is unavailable', () => {
    const result = resolveDesktopRuntimeConfigPath({
      userDataPath: '',
      platform: 'linux',
      fileExists: () => false,
    })

    expect(result).toEqual({
      path: '',
      source: 'userData',
      exists: false,
    })
  })

  it('falls back to ~/.config/OpenPOS/config.json on macOS when userData is missing', () => {
    const result = resolveDesktopRuntimeConfigPath({
      homeDir: '/Users/ana',
      userDataPath: '/Users/ana/Library/Application Support/OpenPOS',
      platform: 'darwin',
      fileExists: (candidatePath) => candidatePath === '/Users/ana/.config/OpenPOS/config.json',
    })

    expect(result).toEqual({
      path: '/Users/ana/.config/OpenPOS/config.json',
      source: 'fallback',
      exists: true,
    })
  })
})

describe('resolveDesktopConnectionConfig', () => {
  it('uses the active connection envelope for remote database config', () => {
    const result = resolveDesktopConnectionConfig({
      runtimeConfig: {
        apiUrl: 'https://runtime-api.example.com',
      },
      runtimeConfigSource: 'userData',
      configPath: '/home/ana/.config/OpenPOS/config.json',
      processEnv: {
        VITE_API_URL: 'https://process-api.example.com',
      },
      envConfig: {
        VITE_API_URL: 'https://dotenv-api.example.com',
      },
      defaultApiUrl: 'http://localhost:3001',
      connectionRemote: {
        url: 'libsql://store-db',
        authToken: 'store-token',
      },
    })

    expect(result).toEqual({
      remote: {
        url: 'libsql://store-db',
        authToken: 'store-token',
        configured: true,
      },
      api: {
        url: 'https://runtime-api.example.com',
        configured: true,
        source: 'userData',
        configPath: '/home/ana/.config/OpenPOS/config.json',
      },
    })
  })

  it('does not read Turso values from env or runtime config', () => {
    const result = resolveDesktopConnectionConfig({
      runtimeConfig: {
        tursoDatabaseUrl: 'libsql://runtime-db',
        tursoAuthToken: 'runtime-token',
      },
      processEnv: {
        TURSO_DATABASE_URL: 'libsql://process-db',
        TURSO_AUTH_TOKEN: 'process-token',
      },
      envConfig: {
        TURSO_DATABASE_URL: 'libsql://dotenv-db',
        TURSO_AUTH_TOKEN: 'dotenv-token',
      },
      connectionRemote: {},
    })

    expect(result.remote).toEqual({
      url: undefined,
      authToken: undefined,
      configured: false,
    })
  })

  it('treats a file envelope as configured without an auth token', () => {
    const result = resolveDesktopConnectionConfig({
      runtimeConfig: {},
      processEnv: {},
      envConfig: {},
      connectionRemote: {
        url: 'file:/tmp/store.sqlite',
        authToken: undefined,
      },
    })

    expect(result.remote).toEqual({
      url: 'file:/tmp/store.sqlite',
      authToken: undefined,
      configured: true,
    })
  })

  it('falls back to the desktop dev API URL only when no explicit value exists', () => {
    const result = resolveDesktopConnectionConfig({
      runtimeConfig: {},
      processEnv: {},
      envConfig: {},
      defaultApiUrl: 'http://localhost:3001',
    })

    expect(result.api).toEqual({
      url: 'http://localhost:3001',
      configured: true,
      source: 'bundled',
      configPath: '',
    })
  })
  it('can force API setup in development despite bundled defaults', () => {
    const result = resolveDesktopConnectionConfig({
      runtimeConfig: {},
      processEnv: {
        VITE_API_URL: 'https://process-api.example.com',
      },
      envConfig: {
        VITE_API_URL: 'https://dotenv-api.example.com',
      },
      defaultApiUrl: 'http://localhost:3001',
      requireApiSetup: true,
    })

    expect(result.api).toEqual({
      url: '',
      configured: false,
      source: 'userData',
      configPath: '',
    })
  })

  it('reports env as the API source when VITE_API_URL comes from process env', () => {
    const result = resolveDesktopConnectionConfig({
      runtimeConfig: {},
      runtimeConfigSource: 'userData',
      configPath: '/home/ana/.config/OpenPOS/config.json',
      processEnv: {
        VITE_API_URL: 'https://process-api.example.com',
      },
      envConfig: {},
    })

    expect(result.api).toEqual({
      url: 'https://process-api.example.com',
      configured: true,
      source: 'env',
      configPath: '/home/ana/.config/OpenPOS/config.json',
    })
  })
})

describe('createPublicConnectionConfig', () => {
  it('returns only safe booleans for renderer-facing state', () => {
    const summary = createPublicConnectionConfig({
      remote: {
        url: 'libsql://secret-db',
        authToken: 'super-secret-token',
        configured: true,
      },
      api: {
        url: 'https://api.example.com',
        configured: true,
      },
    })

    expect(summary).toEqual({
      remoteConfigured: true,
      apiConfigured: true,
    })
    expect('url' in summary).toBe(false)
    expect('authToken' in summary).toBe(false)
    expect('tursoDatabaseUrl' in summary).toBe(false)
    expect('tursoAuthToken' in summary).toBe(false)
  })
})

describe('normalizeDesktopApiUrl', () => {
  it('trims trailing slashes and accepts http(s) URLs', () => {
    expect(normalizeDesktopApiUrl(' https://api.example.com/ ')).toBe('https://api.example.com')
  })

  it('rejects missing or non-http URLs', () => {
    expect(() => normalizeDesktopApiUrl('')).toThrow('API URL is required')
    expect(() => normalizeDesktopApiUrl('libsql://store.turso.io')).toThrow('API URL must start with http:// or https://')
  })
})

describe('desktopFirstRunNeedsApiSetup', () => {
  it('requires the API after a store is connected and the emergency kit is confirmed', () => {
    expect(
      desktopFirstRunNeedsApiSetup({
        hasConnection: true,
        emergencyKitConfirmed: true,
        apiConfigured: false,
      }),
    ).toBe(true)
  })

  it('skips the API step before the store or kit is ready, or when the URL is already set', () => {
    expect(
      desktopFirstRunNeedsApiSetup({
        hasConnection: false,
        emergencyKitConfirmed: true,
        apiConfigured: false,
      }),
    ).toBe(false)
    expect(
      desktopFirstRunNeedsApiSetup({
        hasConnection: true,
        emergencyKitConfirmed: false,
        apiConfigured: false,
      }),
    ).toBe(false)
    expect(
      desktopFirstRunNeedsApiSetup({
        hasConnection: true,
        emergencyKitConfirmed: true,
        apiConfigured: true,
      }),
    ).toBe(false)
  })
})

describe('writeDesktopRuntimeConfig', () => {
  const tempDirs = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('creates config.json and preserves existing keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openpos-runtime-config-'))
    tempDirs.push(dir)
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, `${JSON.stringify({ thermalPrinterName: 'POS-80' }, null, 2)}\n`)

    const written = writeDesktopRuntimeConfig(configPath, { apiUrl: 'https://api.openpos.xyz' })

    expect(written).toEqual({
      thermalPrinterName: 'POS-80',
      apiUrl: 'https://api.openpos.xyz',
    })
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual(written)
  })

  it('resetDesktopRuntimeConfig restores config.json to empty defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openpos-runtime-config-'))
    tempDirs.push(dir)
    const configPath = join(dir, 'config.json')
    writeFileSync(
      configPath,
      `${JSON.stringify({ apiUrl: 'http://localhost:3001', thermalPrinterName: 'POS-80' }, null, 2)}\n`,
    )

    const written = resetDesktopRuntimeConfig(configPath)

    expect(written).toEqual({})
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual({})
  })
})
