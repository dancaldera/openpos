import { beforeEach, describe, expect, it, vi } from 'vitest'

class MemoryStorage {
  private values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  clear(): void {
    this.values.clear()
  }
}

const { requestApiJson, execute, query, verifyPassword, hashPassword, getDesktopApiConfig, warn } = vi.hoisted(() => ({
  requestApiJson: vi.fn(async () => ({ token: 'jwt-token' })),
  execute: vi.fn(async () => ({ lastInsertId: 0, rowsAffected: 1 })),
  query: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
  verifyPassword: vi.fn(async () => true),
  hashPassword: vi.fn(async () => 'hashed-password'),
  getDesktopApiConfig: vi.fn(async () => ({
    apiUrl: 'https://api.example.com',
    configPath: '/home/ana/.config/OpenPOS/config.json',
    configSource: 'userData' as const,
    userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
  })),
  warn: vi.fn(() => {}),
}))

vi.mock('../lib/api-client', () => ({
  requestApiJson,
}))

vi.mock('../lib/db-adapter', () => ({
  execute,
  query,
}))

vi.mock('../lib/api-config', () => ({
  getDesktopApiConfig,
}))

vi.mock('../lib/desktop', () => ({
  requireDesktopApi: vi.fn(() => ({
    verifyPassword,
    hashPassword,
  })),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: true,
}))

const { AuthService, getDesktopRemoteSessionState } = await import('./auth-turso')

describe('AuthService.signIn desktop API token sync', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    console.warn = warn as typeof console.warn

    service.signOut()
    requestApiJson.mockReset()
    execute.mockReset()
    query.mockReset()
    verifyPassword.mockReset()
    hashPassword.mockReset()
    getDesktopApiConfig.mockReset()
    warn.mockReset()

    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    verifyPassword.mockResolvedValue(true)
    hashPassword.mockResolvedValue('hashed-password')
    getDesktopApiConfig.mockResolvedValue({
      apiUrl: 'https://api.example.com',
      configPath: '/home/ana/.config/OpenPOS/config.json',
      configSource: 'userData',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })
  })

  it('stores a fresh auth token after successful local desktop sign-in', async () => {
    storage.setItem('auth_token', 'stale-token')
    query.mockResolvedValueOnce([
      {
        id: 1,
        email: 'ana@example.com',
        password: 'hashed-password',
        name: 'Ana',
        role: 'admin',
        permissions: JSON.stringify(['*']),
        created_at: '2026-03-27T00:00:00.000Z',
        password_hashed: 1,
      },
    ])
    requestApiJson.mockResolvedValueOnce({ token: 'fresh-token' })

    const result = await service.signIn('ANA@example.com', 'secret')

    expect(result).toMatchObject({
      success: true,
      user: {
        email: 'ana@example.com',
        name: 'Ana',
      },
    })
    expect(requestApiJson).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: { email: 'ana@example.com', password: 'secret' },
    })
    expect(storage.getItem('auth_token')).toBe('fresh-token')
    expect(storage.getItem('desktop_remote_auth_status')).toBe(
      JSON.stringify({
        apiConfigured: true,
        lastError: null,
        configPath: '/home/ana/.config/OpenPOS/config.json',
      }),
    )
  })

  it('keeps desktop sign-in successful when API token refresh fails', async () => {
    query.mockResolvedValueOnce([
      {
        id: 1,
        email: 'ana@example.com',
        password: 'hashed-password',
        name: 'Ana',
        role: 'admin',
        permissions: JSON.stringify(['*']),
        created_at: '2026-03-27T00:00:00.000Z',
        password_hashed: 1,
      },
    ])
    requestApiJson.mockRejectedValueOnce(new Error('offline'))

    const result = await service.signIn('ana@example.com', 'secret')

    expect(result).toMatchObject({
      success: true,
      user: {
        email: 'ana@example.com',
      },
      warning: 'offline',
    })
    expect(storage.getItem('auth_token')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(storage.getItem('desktop_remote_auth_status')).toBe(
      JSON.stringify({
        apiConfigured: true,
        lastError: 'offline',
        configPath: '/home/ana/.config/OpenPOS/config.json',
      }),
    )
  })

  it('clears stale auth tokens and skips API sign-in when no desktop API URL is configured', async () => {
    storage.setItem('auth_token', 'stale-token')
    query.mockResolvedValueOnce([
      {
        id: 1,
        email: 'ana@example.com',
        password: 'hashed-password',
        name: 'Ana',
        role: 'admin',
        permissions: JSON.stringify(['*']),
        created_at: '2026-03-27T00:00:00.000Z',
        password_hashed: 1,
      },
    ])
    getDesktopApiConfig.mockResolvedValueOnce({
      apiUrl: '',
      configPath: '/home/ana/.config/OpenPOS/config.json',
      configSource: 'userData',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })

    const result = await service.signIn('ana@example.com', 'secret')

    expect(result).toMatchObject({
      success: true,
      user: {
        email: 'ana@example.com',
      },
    })
    expect(requestApiJson).not.toHaveBeenCalled()
    expect(storage.getItem('auth_token')).toBeNull()
    expect(storage.getItem('desktop_remote_auth_status')).toBe(
      JSON.stringify({
        apiConfigured: false,
        lastError: null,
        configPath: '/home/ana/.config/OpenPOS/config.json',
      }),
    )
  })

  it('skips API sign-in when desktop config returns no apiUrl field', async () => {
    storage.setItem('auth_token', 'stale-token')
    query.mockResolvedValueOnce([
      {
        id: 1,
        email: 'ana@example.com',
        password: 'hashed-password',
        name: 'Ana',
        role: 'admin',
        permissions: JSON.stringify(['*']),
        created_at: '2026-03-27T00:00:00.000Z',
        password_hashed: 1,
      },
    ])
    getDesktopApiConfig.mockResolvedValueOnce({
      // @ts-expect-error testing malformed desktop config payload
      apiUrl: undefined,
      configPath: '/home/ana/.config/OpenPOS/config.json',
      configSource: 'userData',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })

    const result = await service.signIn('ana@example.com', 'secret')

    expect(result).toMatchObject({
      success: true,
      user: {
        email: 'ana@example.com',
      },
    })
    expect(requestApiJson).not.toHaveBeenCalled()
    expect(storage.getItem('auth_token')).toBeNull()
    expect(storage.getItem('desktop_remote_auth_status')).toBe(
      JSON.stringify({
        apiConfigured: false,
        lastError: null,
        configPath: '/home/ana/.config/OpenPOS/config.json',
      }),
    )
  })

  it('reports desktop remote session readiness from API config and auth token state', async () => {
    storage.setItem('auth_token', 'jwt-token')
    storage.setItem(
      'desktop_remote_auth_status',
      JSON.stringify({
        apiConfigured: true,
        lastError: 'offline',
        configPath: '/home/ana/.config/OpenPOS/config.json',
      }),
    )

    await expect(getDesktopRemoteSessionState()).resolves.toEqual({
      apiConfigured: true,
      hasAuthToken: true,
      isReady: true,
      lastError: null,
      configPath: '/home/ana/.config/OpenPOS/config.json',
    })
  })

  it('reports desktop remote session as unavailable when API config is missing', async () => {
    getDesktopApiConfig.mockResolvedValueOnce({
      apiUrl: '',
      configPath: '/home/ana/.config/OpenPOS/config.json',
      configSource: 'userData',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })

    await expect(getDesktopRemoteSessionState()).resolves.toEqual({
      apiConfigured: false,
      hasAuthToken: false,
      isReady: false,
      lastError: null,
      configPath: '/home/ana/.config/OpenPOS/config.json',
    })
  })

  it('reports the persisted remote auth error when desktop API login failed', async () => {
    storage.setItem(
      'desktop_remote_auth_status',
      JSON.stringify({
        apiConfigured: true,
        lastError: 'JWT_SECRET environment variable is not set',
        configPath: '/home/ana/.config/OpenPOS/config.json',
      }),
    )

    await expect(getDesktopRemoteSessionState()).resolves.toEqual({
      apiConfigured: true,
      hasAuthToken: false,
      isReady: false,
      lastError: 'JWT_SECRET environment variable is not set',
      configPath: '/home/ana/.config/OpenPOS/config.json',
    })
  })
})
