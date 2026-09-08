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

const {
  requestApiJson,
  execute,
  query,
  verifyPassword,
  hashPassword,
  getDesktopApiConfig,
  getRegisterPayload,
  trigger,
  warn,
} = vi.hoisted(() => ({
  requestApiJson: vi.fn(async (): Promise<Record<string, unknown>> => ({ token: 'jwt-token' })),
  execute: vi.fn(async (_sql: string, _params: unknown[] = []) => ({ lastInsertId: 0, rowsAffected: 1 })),
  query: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
  verifyPassword: vi.fn(async () => true),
  hashPassword: vi.fn(async () => 'hashed-password'),
  getDesktopApiConfig: vi.fn(async () => ({
    apiUrl: 'https://api.example.com',
    configPath: '/home/ana/.config/OpenPOS/config.json',
    configSource: 'userData' as const,
    userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
  })),
  getRegisterPayload: vi.fn(async () => ({
    key: 'OPK_ABCD-EFGH-JKMN-PQRS',
    storeName: 'Corner Shop',
  })),
  trigger: vi.fn(async () => {}),
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
    connection: {
      getRegisterPayload,
    },
    sync: {
      trigger,
    },
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
    trigger.mockClear()
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
    getRegisterPayload.mockResolvedValue({
      key: 'OPK_ABCD-EFGH-JKMN-PQRS',
      storeName: 'Corner Shop',
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

  it('registers the desktop store with the API when login returns connection_not_found', async () => {
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
    requestApiJson
      .mockRejectedValueOnce(new Error('connection_not_found'))
      .mockResolvedValueOnce({ key: 'OPK_ABCD-EFGH-JKMN-PQRS', storeName: 'Corner Shop' })
      .mockResolvedValueOnce({ token: 'fresh-token' })

    const result = await service.signIn('ana@example.com', 'secret')

    expect(result).toMatchObject({
      success: true,
      user: { email: 'ana@example.com' },
    })
    expect(result.warning).toBeUndefined()
    expect(requestApiJson).toHaveBeenNthCalledWith(1, '/api/auth/login', {
      method: 'POST',
      body: { email: 'ana@example.com', password: 'secret' },
    })
    expect(requestApiJson).toHaveBeenNthCalledWith(2, '/api/connections/register', {
      method: 'POST',
      body: {
        key: 'OPK_ABCD-EFGH-JKMN-PQRS',
        url: undefined,
        authToken: undefined,
        storeName: 'Corner Shop',
        adminName: 'Ana',
        adminEmail: 'ana@example.com',
        adminPassword: 'secret',
      },
    })
    expect(requestApiJson).toHaveBeenNthCalledWith(3, '/api/auth/login', {
      method: 'POST',
      body: { email: 'ana@example.com', password: 'secret' },
    })
    expect(storage.getItem('auth_token')).toBe('fresh-token')
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

  it('fails sign-in when no desktop API URL is configured', async () => {
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
      success: false,
      error: 'Remote API is not configured',
    })
    expect(requestApiJson).not.toHaveBeenCalled()
    expect(storage.getItem('auth_token')).toBeNull()
    expect(storage.getItem('desktop_remote_auth_status')).toBe(
      JSON.stringify({
        apiConfigured: false,
        lastError: 'Remote API is not configured',
        configPath: '/home/ana/.config/OpenPOS/config.json',
      }),
    )
  })

  it('fails sign-in when desktop config returns no apiUrl field', async () => {
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
      success: false,
      error: 'Remote API is not configured',
    })
    expect(requestApiJson).not.toHaveBeenCalled()
    expect(storage.getItem('auth_token')).toBeNull()
    expect(storage.getItem('desktop_remote_auth_status')).toBe(
      JSON.stringify({
        apiConfigured: false,
        lastError: 'Remote API is not configured',
        configPath: '/home/ana/.config/OpenPOS/config.json',
      }),
    )
  })

  it('stores a fresh auth token after successful local PIN sign-in', async () => {
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
        pin_enabled: 1,
        pin_hash: 'hashed-pin',
      },
    ])
    requestApiJson.mockResolvedValueOnce({ token: 'pin-token' })

    const result = await service.signInWithPin('1', '246810')

    expect(result).toMatchObject({
      success: true,
      user: { email: 'ana@example.com', pinEnabled: true },
    })
    expect(verifyPassword).toHaveBeenCalledWith('246810', 'hashed-pin')
    expect(requestApiJson).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: { userId: '1', pin: '246810' },
    })
    expect(storage.getItem('auth_token')).toBe('pin-token')
  })

  it('does not register the store when PIN login returns connection_not_found', async () => {
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
        pin_enabled: 1,
        pin_hash: 'hashed-pin',
      },
    ])
    requestApiJson.mockRejectedValueOnce(new Error('connection_not_found'))

    const result = await service.signInWithPin('1', '246810')

    expect(result.success).toBe(true)
    expect(result.warning).toBe('connection_not_found')
    expect(requestApiJson).toHaveBeenCalledTimes(1)
    expect(requestApiJson).not.toHaveBeenCalledWith('/api/connections/register', expect.anything())
  })

  it('rejects PIN sign-in when the member has no PIN enabled', async () => {
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
        pin_enabled: 0,
        pin_hash: null,
      },
    ])

    const result = await service.signInWithPin('1', '246810')

    expect(result).toEqual({ success: false, error: 'Invalid PIN' })
    expect(requestApiJson).not.toHaveBeenCalled()
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

describe('AuthService member mutations replicate to the remote store', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  const memberRow = {
    id: 2,
    email: 'member@example.com',
    name: 'Member',
    role: 'user',
    permissions: '[]',
    created_at: '2026-08-29T00:00:00.000Z',
    updated_at: '2026-08-29T00:00:00.000Z',
  }

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage

    service.signOut()
    storage.setItem(
      'pos_user',
      JSON.stringify({ id: '1', email: 'admin@example.com', name: 'Admin', role: 'admin', permissions: ['*'] }),
    )

    execute.mockReset()
    query.mockReset()
    trigger.mockClear()
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    query.mockResolvedValue([])
  })

  it('creates members with an explicit updated_at watermark and triggers sync', async () => {
    query.mockResolvedValueOnce([])

    const result = await service.createUser({
      email: 'new@example.com',
      name: 'New Member',
      role: 'user',
      password: 'ValidPass1!',
    })

    expect(result.success).toBe(true)
    const [sql] = execute.mock.calls[0]
    expect(sql).toContain('updated_at')
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('advances updated_at when editing a member and triggers sync', async () => {
    query.mockResolvedValueOnce([memberRow])
    query.mockResolvedValueOnce([{ ...memberRow, name: 'Renamed' }])

    const result = await service.updateUser('2', { name: 'Renamed' })

    expect(result.success).toBe(true)
    const [sql] = execute.mock.calls[0]
    expect(sql).toContain('name = ?')
    expect(sql).toContain('updated_at = ?')
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('advances updated_at when archiving a member so the deletion replicates', async () => {
    query.mockResolvedValueOnce([memberRow])

    const result = await service.deleteUser('2')

    expect(result.success).toBe(true)
    const [sql] = execute.mock.calls[0]
    expect(sql).toContain('deleted_at = ?')
    expect(sql).toContain('updated_at = ?')
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('enables a member PIN, hashes it, and triggers sync', async () => {
    query.mockResolvedValueOnce([memberRow])
    query.mockResolvedValueOnce([{ ...memberRow, pin_enabled: 1, pin_hash: 'hashed-password' }])

    const result = await service.updateUser('2', { pinEnabled: true, pin: '246810' })

    expect(result.success).toBe(true)
    const [sql, params] = execute.mock.calls[0]
    expect(sql).toContain('pin_enabled = ?')
    expect(sql).toContain('pin_hash = ?')
    expect(sql).toContain('updated_at = ?')
    expect(params).toContain(1)
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('advances updated_at when restoring a member so the restore replicates', async () => {
    query.mockResolvedValueOnce([{ ...memberRow, deleted_at: '2026-08-29T01:00:00.000Z' }])
    query.mockResolvedValueOnce([memberRow])

    const result = await service.restoreUser('2')

    expect(result.success).toBe(true)
    const [sql] = execute.mock.calls[0]
    expect(sql).toContain('deleted_at = NULL')
    expect(sql).toContain('updated_at = ?')
    expect(trigger).toHaveBeenCalledTimes(1)
  })
})
