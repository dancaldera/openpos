const { describe, expect, it } = require('bun:test')
const { createPublicConnectionConfig, resolveDesktopConnectionConfig } = require('./config-resolver.cjs')

describe('resolveDesktopConnectionConfig', () => {
  it('prefers runtime config over process env and dotenv values', () => {
    const result = resolveDesktopConnectionConfig({
      runtimeConfig: {
        tursoDatabaseUrl: 'libsql://runtime-db',
        tursoAuthToken: 'runtime-token',
        apiUrl: 'https://runtime-api.example.com',
      },
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
