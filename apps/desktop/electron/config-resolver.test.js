const { describe, expect, it } = require('bun:test')
const {
  createPublicConnectionConfig,
  getDesktopRuntimeConfigCandidates,
  resolveDesktopConnectionConfig,
  resolveDesktopRuntimeConfigPath,
} = require('./config-resolver.cjs')

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
  it('prefers runtime config over process env and dotenv values', () => {
    const result = resolveDesktopConnectionConfig({
      runtimeConfig: {
        tursoDatabaseUrl: 'libsql://runtime-db',
        tursoAuthToken: 'runtime-token',
        apiUrl: 'https://runtime-api.example.com',
        printStationId: 'front-counter-1',
        printStationName: 'Front Counter',
      },
      runtimeConfigSource: 'userData',
      configPath: '/home/ana/.config/OpenPOS/config.json',
      processEnv: {
        TURSO_DATABASE_URL: 'libsql://process-db',
        TURSO_AUTH_TOKEN: 'process-token',
        VITE_API_URL: 'https://process-api.example.com',
      },
      envConfig: {
        TURSO_DATABASE_URL: 'libsql://dotenv-db',
        TURSO_AUTH_TOKEN: 'dotenv-token',
        VITE_API_URL: 'https://dotenv-api.example.com',
      },
      defaultApiUrl: 'http://localhost:3001',
    })

    expect(result).toEqual({
      remote: {
        url: 'libsql://runtime-db',
        authToken: 'runtime-token',
        configured: true,
      },
      api: {
        url: 'https://runtime-api.example.com',
        configured: true,
        source: 'userData',
        configPath: '/home/ana/.config/OpenPOS/config.json',
      },
      printStation: {
        id: 'front-counter-1',
        name: 'Front Counter',
        configured: true,
      },
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
      printStationConfigured: false,
    })
    expect('url' in summary).toBe(false)
    expect('authToken' in summary).toBe(false)
    expect('tursoDatabaseUrl' in summary).toBe(false)
    expect('tursoAuthToken' in summary).toBe(false)
  })
})
