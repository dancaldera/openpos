import { beforeEach, describe, expect, it } from 'bun:test'
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
      configPath: '/home/ana/.config/OpenPOS/config.json',
      configSource: 'userData',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })
  })
})
