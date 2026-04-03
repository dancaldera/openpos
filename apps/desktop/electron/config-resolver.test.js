const { describe, expect, it } = require('bun:test')
const {
  createPublicConnectionConfig,
  getDesktopRuntimeConfigCandidates,
  resolveDesktopConnectionConfig,
  resolveDesktopRuntimeConfigPath,
} = require('./config-resolver.cjs')

describe('getDesktopRuntimeConfigCandidates', () => {
  it('returns legacy config first and userData second', () => {
    const result = getDesktopRuntimeConfigCandidates({
      homeDir: '/home/ana',
      userDataPath: '/home/ana/.config/OpenPOS',
    })

    expect(result).toEqual([
      {
        path: '/home/ana/.config/openpos-desktop/config.json',
        source: 'legacy',
      },
      {
        path: '/home/ana/.config/OpenPOS/config.json',
        source: 'userData',
      },
    ])
  })

  it('deduplicates identical candidate paths', () => {
    const result = getDesktopRuntimeConfigCandidates({
      homeDir: '/home/ana/.config',
      userDataPath: '/home/ana/.config/openpos-desktop',
    })

    expect(result).toEqual([
      {
        path: '/home/ana/.config/openpos-desktop/config.json',
        source: 'legacy',
      },
    ])
  })
})

describe('resolveDesktopRuntimeConfigPath', () => {
  it('prefers the documented legacy config path when both files exist', () => {
    const result = resolveDesktopRuntimeConfigPath({
      homeDir: '/home/ana',
      userDataPath: '/home/ana/.config/OpenPOS',
      fileExists: () => true,
    })

    expect(result).toEqual({
      path: '/home/ana/.config/openpos-desktop/config.json',
      source: 'legacy',
      exists: true,
    })
  })

  it('falls back to the Electron userData config path when legacy is missing', () => {
    const result = resolveDesktopRuntimeConfigPath({
      homeDir: '/home/ana',
      userDataPath: '/home/ana/.config/OpenPOS',
      fileExists: (candidatePath) => candidatePath === '/home/ana/.config/OpenPOS/config.json',
    })

    expect(result).toEqual({
      path: '/home/ana/.config/OpenPOS/config.json',
      source: 'userData',
      exists: true,
    })
  })

  it('returns the preferred legacy path when no runtime config file exists', () => {
    const result = resolveDesktopRuntimeConfigPath({
      homeDir: '/home/ana',
      userDataPath: '/home/ana/.config/OpenPOS',
      fileExists: () => false,
    })

    expect(result).toEqual({
      path: '/home/ana/.config/openpos-desktop/config.json',
      source: 'legacy',
      exists: false,
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
      },
      runtimeConfigSource: 'legacy',
      configPath: '/home/ana/.config/openpos-desktop/config.json',
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
        source: 'legacy',
        configPath: '/home/ana/.config/openpos-desktop/config.json',
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
      runtimeConfigSource: 'legacy',
      configPath: '/home/ana/.config/openpos-desktop/config.json',
      processEnv: {
        VITE_API_URL: 'https://process-api.example.com',
      },
      envConfig: {},
    })

    expect(result.api).toEqual({
      url: 'https://process-api.example.com',
      configured: true,
      source: 'env',
      configPath: '/home/ana/.config/openpos-desktop/config.json',
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
