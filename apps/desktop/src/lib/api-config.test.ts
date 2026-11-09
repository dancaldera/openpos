import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getApiBaseUrl,
  getApiUrl,
  getDesktopApiConfig,
  resetApiUrlCacheForTests,
  resolveApiBaseUrl,
} from './api-config'

describe('api-config', () => {
  beforeEach(() => {
    resetApiUrlCacheForTests()
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('prefers the desktop runtime apiUrl when present', () => {
    expect(resolveApiBaseUrl({ apiUrl: ' https://runtime-api.example.com ' }, 'https://bundled-api.example.com')).toBe(
      'https://runtime-api.example.com',
    )
  })

  it('falls back to the bundled API URL when desktop runtime apiUrl is missing', () => {
    expect(resolveApiBaseUrl({}, 'https://bundled-api.example.com')).toBe('https://bundled-api.example.com')
  })

  it('uses the desktop runtime apiUrl in getApiUrl()', async () => {
    globalThis.window = {
      openposDesktop: {
        getConfig: async () => ({
          apiUrl: 'https://runtime-api.example.com',
          configPath: '/home/ana/.config/OpenPOS/config.json',
          configSource: 'userData',
          userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
        }),
      },
    } as Window & typeof globalThis

    await expect(getApiUrl('/api/auth/login')).resolves.toBe('https://runtime-api.example.com/api/auth/login')
  })

  it('uses the desktop runtime apiUrl in getApiBaseUrl()', async () => {
    globalThis.window = {
      openposDesktop: {
        getConfig: async () => ({
          apiUrl: 'https://runtime-api.example.com',
          configPath: '/home/ana/.config/OpenPOS/config.json',
          configSource: 'userData',
          userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
        }),
      },
    } as Window & typeof globalThis

    await expect(getApiBaseUrl()).resolves.toBe('https://runtime-api.example.com')
  })

  it('returns desktop config diagnostics from the runtime bridge', async () => {
    globalThis.window = {
      openposDesktop: {
        getConfig: async () => ({
          apiUrl: 'https://runtime-api.example.com',
          configPath: '/home/ana/.config/OpenPOS/config.json',
          configSource: 'userData',
          userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
        }),
      },
    } as Window & typeof globalThis

    await expect(getDesktopApiConfig()).resolves.toEqual({
      apiUrl: 'https://runtime-api.example.com',
      connectionKey: '',
      configPath: '/home/ana/.config/OpenPOS/config.json',
      configSource: 'userData',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })
  })

  it('falls back when the runtime config cannot be read', async () => {
    globalThis.window = {
      openposDesktop: {
        getConfig: async () => {
          throw new Error('no bridge')
        },
      },
    } as unknown as Window & typeof globalThis

    const config = await getDesktopApiConfig()
    expect(config).toMatchObject({
      connectionKey: '',
      configPath: '',
      configSource: 'bundled',
      userDataConfigPath: '',
    })
    expect(typeof config.apiUrl).toBe('string')
  })

  it('uses same-origin requests on the web even when VITE_API_URL is set', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com')
    try {
      await expect(getApiBaseUrl()).resolves.toBe('')
      await expect(getApiUrl('/api/health')).resolves.toBe('/api/health')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('defaults the config source when the runtime omits it', async () => {
    globalThis.window = {
      openposDesktop: {
        getConfig: async () => ({
          apiUrl: 'https://runtime-api.example.com',
        }),
      },
    } as Window & typeof globalThis

    const config = await getDesktopApiConfig()
    expect(config.configSource).toBe('bundled')
    expect(config.configPath).toBe('')
  })
})
