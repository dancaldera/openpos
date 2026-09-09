import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi } from '../lib/desktop'

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

describe('AuthService.signIn desktop password flows', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  const dbUser = {
    id: 1,
    email: 'ana@example.com',
    password: 'hashed-password',
    name: 'Ana',
    role: 'admin',
    permissions: JSON.stringify(['*']),
    created_at: '2026-03-27T00:00:00.000Z',
    password_hashed: 1,
  }

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

    requestApiJson.mockResolvedValue({ token: 'remote-jwt' })
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    verifyPassword.mockResolvedValue(true)
    hashPassword.mockResolvedValue('hashed-password')
    getDesktopApiConfig.mockResolvedValue({
      apiUrl: 'https://api.example.com',
      configPath: '/home/ana/.config/OpenPOS/config.json',
      configSource: 'userData',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('rejects unknown emails', async () => {
    query.mockResolvedValueOnce([])

    await expect(service.signIn('nobody@example.com', 'secret')).resolves.toEqual({
      success: false,
      error: 'Invalid email or password',
    })
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('rejects wrong passwords for hashed accounts', async () => {
    query.mockResolvedValueOnce([dbUser])
    verifyPassword.mockResolvedValueOnce(false)

    await expect(service.signIn('ana@example.com', 'wrong')).resolves.toEqual({
      success: false,
      error: 'Invalid email or password',
    })
    expect(verifyPassword).toHaveBeenCalledWith('wrong', 'hashed-password')
  })

  it('migrates plaintext passwords to hashes', async () => {
    query.mockResolvedValueOnce([{ ...dbUser, password: 'plain-secret', password_hashed: 0 }])

    const result = await service.signIn('ana@example.com', 'plain-secret')

    expect(result.success).toBe(true)
    expect(hashPassword).toHaveBeenCalledWith('plain-secret')
    expect(execute.mock.calls[0][0]).toContain('password_hashed = 1')
    expect(storage.getItem('auth_token')).toBe('remote-jwt')
  })

  it('rejects wrong passwords for plaintext accounts without migrating', async () => {
    query.mockResolvedValueOnce([{ ...dbUser, password: 'plain-secret', password_hashed: 0 }])

    await expect(service.signIn('ana@example.com', 'wrong')).resolves.toEqual({
      success: false,
      error: 'Invalid email or password',
    })
    expect(hashPassword).not.toHaveBeenCalled()
  })

  it('succeeds with a warning when the API returns no token', async () => {
    query.mockResolvedValueOnce([dbUser])
    requestApiJson.mockReset()
    requestApiJson.mockResolvedValue({})

    const result = await service.signIn('ana@example.com', 'secret')

    expect(result.success).toBe(true)
    expect(result.warning).toBe('Remote API sign-in did not return a token.')
    expect(storage.getItem('auth_token')).toBeNull()
  })

  it('succeeds with a warning when the API token is blank', async () => {
    query.mockResolvedValueOnce([dbUser])
    requestApiJson.mockReset()
    requestApiJson.mockResolvedValue({ token: '   ' })

    const result = await service.signIn('ana@example.com', 'secret')

    expect(result.success).toBe(true)
    expect(result.warning).toBe('Remote API sign-in did not return a token.')
  })

  it('surfaces registration failures as warnings', async () => {
    query.mockResolvedValueOnce([dbUser])
    requestApiJson.mockReset()
    requestApiJson
      .mockRejectedValueOnce(new Error('connection_not_found'))
      .mockRejectedValueOnce(new Error('register down'))
    warn.mockClear()

    const result = await service.signIn('ana@example.com', 'secret')

    expect(result.success).toBe(true)
    expect(result.warning).toBe('register down')
  })

  it('wraps non-error API failures', async () => {
    query.mockResolvedValueOnce([dbUser])
    requestApiJson.mockReset()
    requestApiJson.mockRejectedValueOnce('timeout')

    const result = await service.signIn('ana@example.com', 'secret')

    expect(result).toMatchObject({ success: true, warning: 'Remote API sign-in failed.' })
  })

  it('returns errors when sign-in crashes', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(service.signIn('ana@example.com', 'secret')).resolves.toMatchObject({
      success: false,
      error: 'db down',
    })

    query.mockReset()
    query.mockRejectedValueOnce('boom')

    await expect(service.signIn('ana@example.com', 'secret')).resolves.toMatchObject({
      success: false,
      error: 'Sign in failed',
    })
  })
})

describe('AuthService.signInWithPin desktop flows', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  const pinUser = {
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
  }

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    console.warn = warn as typeof console.warn

    service.signOut()
    requestApiJson.mockReset()
    execute.mockReset()
    query.mockReset()
    verifyPassword.mockReset()
    verifyPassword.mockResolvedValue(true)
    getDesktopApiConfig.mockReset()
    trigger.mockClear()
    warn.mockReset()

    requestApiJson.mockResolvedValue({ token: 'pin-jwt' })
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    getDesktopApiConfig.mockResolvedValue({
      apiUrl: 'https://api.example.com',
      configPath: '/home/ana/.config/OpenPOS/config.json',
      configSource: 'userData',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('rejects unknown members', async () => {
    query.mockResolvedValueOnce([])

    await expect(service.signInWithPin('99', '246810')).resolves.toEqual({ success: false, error: 'Invalid PIN' })
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('rejects members without a stored PIN hash', async () => {
    query.mockResolvedValueOnce([{ ...pinUser, pin_enabled: 1, pin_hash: null }])

    await expect(service.signInWithPin('1', '246810')).resolves.toEqual({ success: false, error: 'Invalid PIN' })
  })

  it('rejects wrong PINs', async () => {
    query.mockResolvedValueOnce([pinUser])
    verifyPassword.mockResolvedValueOnce(false)

    await expect(service.signInWithPin('1', '000000')).resolves.toEqual({ success: false, error: 'Invalid PIN' })
  })

  it('fails when no desktop API URL is configured', async () => {
    query.mockResolvedValueOnce([pinUser])
    getDesktopApiConfig.mockResolvedValueOnce({
      apiUrl: '',
      configPath: '/home/ana/.config/OpenPOS/config.json',
      configSource: 'userData',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })

    const result = await service.signInWithPin('1', '246810')

    expect(result).toMatchObject({ success: false, error: 'Remote API is not configured' })
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('keeps PIN sign-in successful with a warning when the token refresh fails', async () => {
    query.mockResolvedValueOnce([pinUser])
    requestApiJson.mockReset()
    requestApiJson.mockRejectedValueOnce(new Error('offline'))

    const result = await service.signInWithPin('1', '246810')

    expect(result).toMatchObject({ success: true, warning: 'offline' })
    expect(storage.getItem('auth_token')).toBeNull()
  })

  it('returns errors when PIN sign-in crashes', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(service.signInWithPin('1', '246810')).resolves.toMatchObject({
      success: false,
      error: 'db down',
    })

    query.mockReset()
    query.mockRejectedValueOnce('boom')

    await expect(service.signInWithPin('1', '246810')).resolves.toMatchObject({
      success: false,
      error: 'Sign in failed',
    })
  })
})

describe('AuthService.getAllUsersForLogin desktop', () => {
  const service = AuthService.getInstance()
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage

    service.signOut()
    requestApiJson.mockReset()
    query.mockReset()
    query.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('lists active members from the database', async () => {
    query.mockResolvedValueOnce([
      {
        id: 1,
        email: 'ana@example.com',
        password: 'hashed',
        name: 'Ana',
        role: 'admin',
        permissions: JSON.stringify(['*']),
        created_at: '2026-03-27T00:00:00.000Z',
        pin_enabled: 1,
        pin_hash: 'hashed-pin',
      },
    ])

    const users = await service.getAllUsersForLogin()

    expect(users).toEqual([
      {
        id: '1',
        email: 'ana@example.com',
        name: 'Ana',
        role: 'admin',
        permissions: ['*'],
        createdAt: '2026-03-27T00:00:00.000Z',
        lastLogin: undefined,
        deletedAt: undefined,
        pinEnabled: true,
      },
    ])
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('returns an empty list when the database fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(service.getAllUsersForLogin()).resolves.toEqual([])
  })
})

describe('AuthService desktop token edge cases', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  const dbUser = {
    id: 1,
    email: 'ana@example.com',
    password: 'hashed-password',
    name: 'Ana',
    role: 'admin',
    permissions: JSON.stringify(['*']),
    created_at: '2026-03-27T00:00:00.000Z',
    password_hashed: 1,
  }

  const pinUser = {
    ...dbUser,
    pin_enabled: 1,
    pin_hash: 'hashed-pin',
  }

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    console.warn = warn as typeof console.warn

    service.signOut()
    requestApiJson.mockReset()
    execute.mockReset()
    query.mockReset()
    verifyPassword.mockReset()
    getDesktopApiConfig.mockReset()
    warn.mockReset()

    requestApiJson.mockResolvedValue({ token: 'remote-jwt' })
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    verifyPassword.mockResolvedValue(true)
    getDesktopApiConfig.mockResolvedValue({
      apiUrl: 'https://api.example.com',
      configPath: '/home/ana/.config/OpenPOS/config.json',
      configSource: 'userData',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('falls back to the userData config path for tokens', async () => {
    query.mockResolvedValueOnce([dbUser])
    getDesktopApiConfig.mockResolvedValue({
      apiUrl: 'https://api.example.com',
      configPath: '',
      configSource: 'userData',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })

    const result = await service.signIn('ana@example.com', 'secret')

    expect(result.success).toBe(true)
    expect(storage.getItem('desktop_remote_auth_status')).toContain('/home/ana/.config/OpenPOS/config.json')
  })

  it('leaves the config path empty when unconfigured', async () => {
    query.mockResolvedValueOnce([dbUser])
    getDesktopApiConfig.mockResolvedValue({
      apiUrl: 'https://api.example.com',
      configPath: '',
      configSource: 'userData',
      userDataConfigPath: '',
    })

    const result = await service.signIn('ana@example.com', 'secret')

    expect(result.success).toBe(true)
    expect(JSON.parse(storage.getItem('desktop_remote_auth_status') as string)).toMatchObject({ configPath: '' })
  })

  it('omits warnings for empty API error messages', async () => {
    query.mockResolvedValueOnce([dbUser])
    requestApiJson.mockReset()
    requestApiJson.mockRejectedValueOnce(new Error(''))

    const result = await service.signIn('ana@example.com', 'secret')

    expect(result.success).toBe(true)
    expect(result.warning).toBeUndefined()
  })

  it('omits PIN warnings for empty API error messages', async () => {
    query.mockResolvedValueOnce([pinUser])
    requestApiJson.mockReset()
    requestApiJson.mockRejectedValueOnce(new Error(''))

    const result = await service.signInWithPin('1', '246810')

    expect(result.success).toBe(true)
    expect(result.warning).toBeUndefined()
  })
})

describe('AuthService session restore desktop', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  const pinUser = {
    id: 1,
    email: 'ana@example.com',
    password: 'hashed-password',
    name: 'Ana',
    role: 'admin',
    permissions: JSON.stringify(['*']),
    created_at: '2026-03-27T00:00:00.000Z',
    password_hashed: 1,
  }

  function storedUser(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      id: '1',
      email: 'ana@example.com',
      name: 'Ana',
      role: 'admin',
      permissions: ['*'],
      createdAt: '2026-03-27T00:00:00.000Z',
      ...overrides,
    })
  }

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    console.warn = warn as typeof console.warn

    service.signOut()
    requestApiJson.mockReset()
    execute.mockReset()
    query.mockReset()
    verifyPassword.mockReset()
    verifyPassword.mockResolvedValue(true)
    getDesktopApiConfig.mockReset()
    warn.mockReset()

    requestApiJson.mockResolvedValue({ token: 'remote-jwt' })
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    getDesktopApiConfig.mockResolvedValue({
      apiUrl: 'https://api.example.com',
      configPath: '/home/ana/.config/OpenPOS/config.json',
      configSource: 'userData',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns the in-memory user without touching the database', async () => {
    query.mockResolvedValueOnce([pinUser])
    await service.signIn('ana@example.com', 'secret')
    query.mockClear()

    const restored = await service.restoreCurrentUser()

    expect(restored?.email).toBe('ana@example.com')
    expect(query).not.toHaveBeenCalled()
  })

  it('returns null when nothing is stored', async () => {
    await expect(service.restoreCurrentUser()).resolves.toBeNull()
  })

  it('clears corrupted persisted users', async () => {
    storage.setItem('pos_user', 'not-json')

    await expect(service.restoreCurrentUser()).resolves.toBeNull()
    expect(storage.getItem('pos_user')).toBeNull()
  })

  it('restores the user from the database', async () => {
    storage.setItem('pos_user', storedUser())
    query.mockResolvedValueOnce([pinUser])

    const restored = await service.restoreCurrentUser()

    expect(restored).toMatchObject({ id: '1', email: 'ana@example.com' })
    expect(storage.getItem('pos_user')).toContain('ana@example.com')
  })

  it('clears auth when the member no longer exists', async () => {
    storage.setItem('pos_user', storedUser())
    storage.setItem('auth_token', 'stale')
    query.mockResolvedValueOnce([])

    await expect(service.restoreCurrentUser()).resolves.toBeNull()
    expect(storage.getItem('pos_user')).toBeNull()
    expect(storage.getItem('auth_token')).toBeNull()
  })

  it('clears expired sessions without logging an error', async () => {
    const { AuthExpiredError } = await import('../lib/auth-session')
    vi.mocked(console.error).mockClear()
    storage.setItem('pos_user', storedUser())
    query.mockRejectedValueOnce(new AuthExpiredError())

    await expect(service.restoreCurrentUser()).resolves.toBeNull()
    expect(storage.getItem('pos_user')).toBeNull()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('clears auth and logs unexpected restore failures', async () => {
    storage.setItem('pos_user', storedUser())
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(service.restoreCurrentUser()).resolves.toBeNull()
    expect(storage.getItem('pos_user')).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('AuthService remote session state', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage

    getDesktopApiConfig.mockReset()
    getDesktopApiConfig.mockResolvedValue({
      apiUrl: 'https://api.example.com',
      configPath: '/home/ana/.config/OpenPOS/config.json',
      configSource: 'userData',
      userDataConfigPath: '/home/ana/.config/OpenPOS/config.json',
    })
  })

  it('reads persisted state without localStorage', async () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    try {
      await expect(getDesktopRemoteSessionState()).resolves.toEqual({
        apiConfigured: true,
        hasAuthToken: false,
        isReady: false,
        lastError: null,
        configPath: '/home/ana/.config/OpenPOS/config.json',
      })
    } finally {
      globalThis.localStorage = storage as unknown as Storage
    }
  })

  it('drops corrupted persisted status', async () => {
    storage.setItem('desktop_remote_auth_status', 'not-json')

    const state = await getDesktopRemoteSessionState()

    expect(state.lastError).toBeNull()
    expect(storage.getItem('desktop_remote_auth_status')).toBeNull()
  })

  it('normalizes malformed persisted status fields', async () => {
    storage.setItem('desktop_remote_auth_status', JSON.stringify({ apiConfigured: 1, lastError: 42, configPath: 7 }))

    const state = await getDesktopRemoteSessionState()

    expect(state.lastError).toBeNull()
    expect(state.configPath).toBe('/home/ana/.config/OpenPOS/config.json')
  })

  it('prefers an empty userData path over the default', async () => {
    getDesktopApiConfig.mockReset()
    getDesktopApiConfig.mockResolvedValue({
      apiUrl: '',
      configPath: '',
      configSource: 'userData',
      userDataConfigPath: '',
    })

    const state = await getDesktopRemoteSessionState()

    expect(state).toMatchObject({ apiConfigured: false, configPath: '' })
  })
})

describe('AuthService.changePassword desktop', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  function signInAsAdmin() {
    storage.setItem(
      'pos_user',
      JSON.stringify({ id: '1', email: 'ana@example.com', name: 'Ana', role: 'admin', permissions: ['*'] }),
    )
  }

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage

    service.signOut()
    requestApiJson.mockReset()
    execute.mockReset()
    query.mockReset()
    verifyPassword.mockReset()
    hashPassword.mockReset()
    trigger.mockClear()

    verifyPassword.mockResolvedValue(true)
    hashPassword.mockResolvedValue('new-hash')
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('requires authentication and a strong password', async () => {
    await expect(service.changePassword('a', 'NewPass1!')).resolves.toMatchObject({
      success: false,
      error: 'Not authenticated',
    })

    signInAsAdmin()

    await expect(service.changePassword('a', 'weak')).resolves.toMatchObject({
      success: false,
      error: 'Password must be at least 8 characters',
    })
  })

  it('returns not found for missing members', async () => {
    signInAsAdmin()
    query.mockResolvedValueOnce([])

    await expect(service.changePassword('old', 'NewPass1!')).resolves.toMatchObject({
      success: false,
      error: 'User not found',
    })
  })

  it('verifies the current password for hashed accounts', async () => {
    signInAsAdmin()
    query.mockResolvedValueOnce([{ password: 'old-hash', password_hashed: 1 }])
    verifyPassword.mockResolvedValueOnce(false)

    await expect(service.changePassword('wrong', 'NewPass1!')).resolves.toMatchObject({
      success: false,
      error: 'Current password is incorrect',
    })
  })

  it('changes hashed passwords and syncs', async () => {
    signInAsAdmin()
    query.mockResolvedValueOnce([{ password: 'old-hash', password_hashed: 1 }])

    const result = await service.changePassword('old-pass', 'NewPass1!')

    expect(result).toEqual({ success: true })
    expect(hashPassword).toHaveBeenCalledWith('NewPass1!')
    expect(execute.mock.calls[0][0]).toContain('password_hashed = 1')
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('changes plaintext passwords after matching', async () => {
    signInAsAdmin()
    query.mockResolvedValueOnce([{ password: 'old-plain', password_hashed: 0 }])

    await expect(service.changePassword('old-plain', 'NewPass1!')).resolves.toEqual({ success: true })

    query.mockReset()
    query.mockResolvedValueOnce([{ password: 'old-plain', password_hashed: 0 }])

    await expect(service.changePassword('wrong', 'NewPass1!')).resolves.toMatchObject({
      success: false,
      error: 'Current password is incorrect',
    })
  })

  it('succeeds even when the sync trigger fails', async () => {
    signInAsAdmin()
    query.mockResolvedValueOnce([{ password: 'old-hash', password_hashed: 1 }])
    trigger.mockRejectedValueOnce(new Error('offline'))

    await expect(service.changePassword('old-pass', 'NewPass1!')).resolves.toEqual({ success: true })
  })

  it('returns an error when the change fails', async () => {
    signInAsAdmin()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(service.changePassword('old-pass', 'NewPass1!')).resolves.toMatchObject({
      success: false,
      error: 'Failed to change password',
    })
  })
})

describe('AuthService password recovery desktop', () => {
  const service = AuthService.getInstance()
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage

    service.signOut()
    requestApiJson.mockReset()
    trigger.mockClear()

    requestApiJson.mockResolvedValue({ success: true })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('validates input before calling the API', async () => {
    await expect(service.resetPasswordWithInternalSecret('a@b.co', 's3cret', 'weak')).resolves.toMatchObject({
      success: false,
      error: 'Password must be at least 8 characters',
    })
    await expect(service.resetPasswordWithInternalSecret('   ', 's3cret', 'NewPass1!')).resolves.toMatchObject({
      success: false,
      error: 'A valid email and internal secret are required',
    })
    await expect(service.resetPasswordWithInternalSecret('a@b.co', '', 'NewPass1!')).resolves.toMatchObject({
      success: false,
      error: 'A valid email and internal secret are required',
    })
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('resets through the API and syncs', async () => {
    const result = await service.resetPasswordWithInternalSecret('ANA@Example.com', 's3cret', 'NewPass1!')

    expect(result).toEqual({ success: true })
    expect(requestApiJson).toHaveBeenCalledWith(
      '/api/auth/admin-reset-password',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('succeeds even when the sync trigger fails', async () => {
    trigger.mockRejectedValueOnce(new Error('offline'))

    await expect(service.resetPasswordWithInternalSecret('a@b.co', 's3cret', 'NewPass1!')).resolves.toEqual({
      success: true,
    })
  })

  it('surfaces API failures', async () => {
    requestApiJson.mockReset()
    requestApiJson.mockRejectedValueOnce(new Error('bad secret'))

    await expect(service.resetPasswordWithInternalSecret('a@b.co', 's3cret', 'NewPass1!')).resolves.toMatchObject({
      success: false,
      error: 'bad secret',
    })

    requestApiJson.mockReset()
    requestApiJson.mockRejectedValueOnce('boom')

    await expect(service.resetPasswordWithInternalSecret('a@b.co', 's3cret', 'NewPass1!')).resolves.toMatchObject({
      success: false,
      error: 'Failed to reset password',
    })
  })

  it('verifies internal secrets', async () => {
    requestApiJson.mockResolvedValueOnce({ valid: true })

    await service.verifyInternalSecret('s3cret')

    expect(requestApiJson).toHaveBeenCalledWith(
      '/api/auth/verify-internal-secret',
      expect.objectContaining({ method: 'POST' }),
    )

    requestApiJson.mockReset()
    requestApiJson.mockRejectedValueOnce(new Error('nope'))

    await expect(service.verifyInternalSecret('bad')).rejects.toThrow('nope')
  })
})

describe('AuthService.createUser desktop', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  function signInAs(role: 'admin' | 'manager', id = '1') {
    const permissions = role === 'admin' ? ['*'] : ['sales.view', 'users.create', 'users.edit', 'users.delete']
    storage.setItem('pos_user', JSON.stringify({ id, email: `${role}@example.com`, name: role, role, permissions }))
  }

  function newMember(overrides: Record<string, unknown> = {}) {
    return {
      email: 'new@example.com',
      name: 'New Member',
      role: 'user' as const,
      password: 'ValidPass1!',
      ...overrides,
    }
  }

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage

    service.signOut()
    signInAs('admin')
    execute.mockReset()
    query.mockReset()
    hashPassword.mockReset()
    trigger.mockClear()

    hashPassword.mockResolvedValue('hashed-password')
    execute.mockResolvedValue({ lastInsertId: 9, rowsAffected: 1 })
    query.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('requires permission to create members', async () => {
    service.signOut()

    await expect(service.createUser(newMember())).resolves.toMatchObject({
      success: false,
      error: 'Insufficient permissions',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('validates password strength step by step', async () => {
    await expect(service.createUser(newMember({ password: 'Short1!' }))).resolves.toMatchObject({
      success: false,
      error: 'Password must be at least 8 characters',
    })
    await expect(service.createUser(newMember({ password: 'alllowercase1!' }))).resolves.toMatchObject({
      success: false,
      error: 'Password must contain an uppercase letter',
    })
    await expect(service.createUser(newMember({ password: 'ALLUPPERCASE1!' }))).resolves.toMatchObject({
      success: false,
      error: 'Password must contain a lowercase letter',
    })
    await expect(service.createUser(newMember({ password: 'NoNumbersHere!' }))).resolves.toMatchObject({
      success: false,
      error: 'Password must contain a number',
    })
    await expect(service.createUser(newMember({ password: 'NoSpecial123' }))).resolves.toMatchObject({
      success: false,
      error: 'Password must contain a special character',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects duplicate emails', async () => {
    query.mockResolvedValueOnce([{ id: 3 }])

    await expect(service.createUser(newMember())).resolves.toMatchObject({
      success: false,
      error: 'User with this email already exists',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('lets managers create members but not admin PINs', async () => {
    signInAs('manager', '2')
    query.mockResolvedValueOnce([])

    await expect(
      service.createUser({ ...newMember(), role: 'admin', pinEnabled: true, pin: '123456' }),
    ).resolves.toMatchObject({ success: false, error: 'Insufficient permissions' })

    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(service.createUser({ ...newMember(), pinEnabled: true, pin: 'bad' })).resolves.toMatchObject({
      success: false,
      error: 'PIN must be exactly 6 digits',
    })
  })

  it('creates members with hashed PINs', async () => {
    query.mockResolvedValueOnce([])

    const result = await service.createUser({ ...newMember(), pinEnabled: true, pin: '246810' })

    expect(result).toMatchObject({ success: true, user: { id: '9', pinEnabled: true } })
    expect(hashPassword).toHaveBeenCalledWith('246810')
    expect(trigger).toHaveBeenCalledTimes(1)
  })

  it('requires a PIN when enabling PIN login', async () => {
    query.mockResolvedValueOnce([])

    await expect(service.createUser({ ...newMember(), pinEnabled: true })).resolves.toMatchObject({
      success: false,
      error: 'PIN must be exactly 6 digits',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('creates members without a PIN', async () => {
    query.mockResolvedValueOnce([])

    const result = await service.createUser(newMember())

    expect(result).toMatchObject({
      success: true,
      user: { id: '9', email: 'new@example.com', pinEnabled: false },
    })
    expect(hashPassword).toHaveBeenCalledWith('ValidPass1!')
  })

  it('succeeds even when background sync is unavailable', async () => {
    query.mockResolvedValueOnce([])
    const { requireDesktopApi } = await import('../lib/desktop')
    const desktopApi = {
      verifyPassword,
      hashPassword,
      connection: { getRegisterPayload },
      sync: { trigger },
    } as unknown as DesktopApi
    vi.mocked(requireDesktopApi)
      .mockImplementationOnce(() => desktopApi)
      .mockImplementationOnce(() => {
        throw new Error('no ipc')
      })

    const result = await service.createUser(newMember())

    expect(result.success).toBe(true)

    query.mockReset()
    query.mockResolvedValueOnce([])
    trigger.mockRejectedValueOnce(new Error('offline'))

    await expect(service.createUser(newMember({ email: 'other@example.com' }))).resolves.toMatchObject({
      success: true,
    })
  })

  it('returns an error when creation fails', async () => {
    query.mockResolvedValueOnce([])
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(service.createUser(newMember())).resolves.toMatchObject({
      success: false,
      error: 'Failed to create user',
    })
  })
})

describe('AuthService.updateUser desktop', () => {
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

  function signInAs(role: 'admin' | 'manager', id = '1') {
    const permissions = role === 'admin' ? ['*'] : ['sales.view', 'users.create', 'users.edit', 'users.delete']
    storage.setItem('pos_user', JSON.stringify({ id, email: `${role}@example.com`, name: role, role, permissions }))
  }

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage

    service.signOut()
    signInAs('admin')
    execute.mockReset()
    query.mockReset()
    hashPassword.mockReset()
    trigger.mockClear()

    hashPassword.mockResolvedValue('hashed-password')
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('requires permission to update members', async () => {
    service.signOut()

    await expect(service.updateUser('2', { name: 'X' })).resolves.toMatchObject({
      success: false,
      error: 'Insufficient permissions',
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('returns not found for missing members', async () => {
    query.mockResolvedValueOnce([])

    await expect(service.updateUser('99', { name: 'X' })).resolves.toMatchObject({
      success: false,
      error: 'User not found or has been deleted',
    })
  })

  it('prevents changing your own role', async () => {
    query.mockResolvedValueOnce([{ ...memberRow, id: 1 }])

    await expect(service.updateUser('1', { role: 'manager' })).resolves.toMatchObject({
      success: false,
      error: 'Cannot change your own role',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects duplicate emails', async () => {
    query.mockResolvedValueOnce([memberRow]).mockResolvedValueOnce([{ id: 3 }])

    await expect(service.updateUser('2', { email: 'taken@example.com' })).resolves.toMatchObject({
      success: false,
      error: 'User with this email already exists',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('validates admin password resets step by step', async () => {
    for (const [password, error] of [
      ['short', 'Password must be at least 8 characters'],
      ['alllowercase1!', 'Password must contain an uppercase letter'],
      ['ALLUPPERCASE1!', 'Password must contain a lowercase letter'],
      ['NoNumbersHere!', 'Password must contain a number'],
      ['NoSpecial123', 'Password must contain a special character'],
    ] as Array<[string, string]>) {
      query.mockReset()
      query.mockResolvedValueOnce([memberRow])

      await expect(service.updateUser('2', { password })).resolves.toMatchObject({ success: false, error })
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it('resets passwords as admin', async () => {
    query.mockResolvedValueOnce([memberRow]).mockResolvedValueOnce([{ ...memberRow, name: 'Member' }])

    const result = await service.updateUser('2', { password: 'NewPass1!' })

    expect(result.success).toBe(true)
    expect(hashPassword).toHaveBeenCalledWith('NewPass1!')
    expect(execute.mock.calls[0][0]).toContain('password_hashed = ?')
  })

  it('ignores password resets from non-admins', async () => {
    signInAs('manager', '3')
    query.mockResolvedValueOnce([{ ...memberRow, role: 'user' }]).mockResolvedValueOnce([memberRow])

    const result = await service.updateUser('2', { password: 'NewPass1!' })

    expect(result.success).toBe(true)
    expect(hashPassword).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('updates identity fields and roles', async () => {
    query
      .mockResolvedValueOnce([memberRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...memberRow, name: 'Renamed' }])

    const result = await service.updateUser('2', {
      email: 'renamed@example.com',
      name: 'Renamed',
      role: 'manager',
    })

    expect(result.success).toBe(true)
    const [sql] = execute.mock.calls[0]
    expect(sql).toContain('email = ?')
    expect(sql).toContain('permissions = ?')
  })

  it('prevents managers from touching admin PINs', async () => {
    signInAs('manager', '3')
    query.mockResolvedValueOnce([{ ...memberRow, id: 4, role: 'admin' }])

    await expect(service.updateUser('4', { pin: '123456' })).resolves.toMatchObject({
      success: false,
      error: 'Insufficient permissions',
    })
  })

  it('disables member PINs', async () => {
    query.mockResolvedValueOnce([memberRow]).mockResolvedValueOnce([{ ...memberRow, pin_enabled: 0 }])

    const result = await service.updateUser('2', { pinEnabled: false })

    expect(result.success).toBe(true)
    expect(execute.mock.calls[0][0]).toContain('pin_hash = ?')
  })

  it('requires an existing PIN hash to enable without a new PIN', async () => {
    query.mockResolvedValueOnce([{ ...memberRow, pin_hash: null }])

    await expect(service.updateUser('2', { pinEnabled: true })).resolves.toMatchObject({
      success: false,
      error: 'PIN must be exactly 6 digits',
    })
  })

  it('enables PINs when a hash already exists', async () => {
    query
      .mockResolvedValueOnce([{ ...memberRow, pin_hash: 'hashed-pin' }])
      .mockResolvedValueOnce([{ ...memberRow, pin_enabled: 1 }])

    const result = await service.updateUser('2', { pinEnabled: true })

    expect(result.success).toBe(true)
  })

  it('rejects invalid PINs', async () => {
    query.mockResolvedValueOnce([memberRow])

    await expect(service.updateUser('2', { pin: 'abc' })).resolves.toMatchObject({
      success: false,
      error: 'PIN must be exactly 6 digits',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('skips the update statement when nothing changed', async () => {
    query.mockResolvedValueOnce([memberRow]).mockResolvedValueOnce([memberRow])

    const result = await service.updateUser('2', {})

    expect(result.success).toBe(true)
    expect(execute).not.toHaveBeenCalled()
    expect(trigger).not.toHaveBeenCalled()
  })

  it('returns an error when the update fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(service.updateUser('2', { name: 'X' })).resolves.toMatchObject({
      success: false,
      error: 'Failed to update user',
    })
  })
})

describe('AuthService deletion and recovery desktop', () => {
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

  function signInAs(role: 'admin' | 'manager', id = '1') {
    const permissions = role === 'admin' ? ['*'] : ['sales.view', 'users.create', 'users.edit', 'users.delete']
    storage.setItem('pos_user', JSON.stringify({ id, email: `${role}@example.com`, name: role, role, permissions }))
  }

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage

    service.signOut()
    signInAs('admin')
    execute.mockReset()
    query.mockReset()
    trigger.mockClear()

    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    query.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('deletes members with permission checks', async () => {
    service.signOut()

    await expect(service.deleteUser('2')).resolves.toMatchObject({
      success: false,
      error: 'Insufficient permissions',
    })

    signInAs('admin')

    await expect(service.deleteUser('1')).resolves.toMatchObject({
      success: false,
      error: 'Cannot delete your own account',
    })

    execute.mockReset()
    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })

    await expect(service.deleteUser('99')).resolves.toMatchObject({
      success: false,
      error: 'User not found or already deleted',
    })

    execute.mockReset()
    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 1 })

    await expect(service.deleteUser('2')).resolves.toEqual({ success: true })

    execute.mockReset()
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(service.deleteUser('2')).resolves.toMatchObject({
      success: false,
      error: 'Failed to delete user',
    })
  })

  it('lists deleted members with permission checks', async () => {
    service.signOut()

    await expect(service.getDeletedUsers()).rejects.toThrow('Insufficient permissions')

    signInAs('admin')
    query.mockResolvedValueOnce([{ ...memberRow, deleted_at: '2026-08-29T01:00:00.000Z' }])

    const deleted = await service.getDeletedUsers()

    expect(deleted).toHaveLength(1)

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(service.getDeletedUsers()).rejects.toThrow('Failed to fetch deleted users')
  })

  it('restores members with permission checks', async () => {
    service.signOut()

    await expect(service.restoreUser('2')).resolves.toMatchObject({
      success: false,
      error: 'Insufficient permissions',
    })

    signInAs('admin')
    execute.mockReset()
    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 0 })

    await expect(service.restoreUser('99')).resolves.toMatchObject({
      success: false,
      error: 'Deleted user not found',
    })

    execute.mockReset()
    execute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 1 })
    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(service.restoreUser('2')).resolves.toMatchObject({
      success: false,
      error: 'Failed to retrieve restored user',
    })

    execute.mockReset()
    execute.mockRejectedValueOnce(new Error('db down'))

    await expect(service.restoreUser('2')).resolves.toMatchObject({
      success: false,
      error: 'Failed to restore user',
    })
  })

  it('permanently deletes members with permission checks', async () => {
    service.signOut()

    await expect(service.hardDeleteUser('2')).resolves.toMatchObject({
      success: false,
      error: 'Insufficient permissions',
    })

    signInAs('admin')

    await expect(service.hardDeleteUser('1')).resolves.toMatchObject({
      success: false,
      error: 'Cannot delete your own account',
    })

    query.mockReset()
    query.mockResolvedValueOnce([])

    await expect(service.hardDeleteUser('99')).resolves.toMatchObject({
      success: false,
      error: 'User not found or not deleted',
    })

    query.mockReset()
    query.mockResolvedValueOnce([{ ...memberRow, deleted_at: '2026-08-29T01:00:00.000Z' }])

    await expect(service.hardDeleteUser('2')).resolves.toEqual({ success: true })
    expect(execute.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining('PRAGMA foreign_keys = OFF'),
      expect.stringContaining('UPDATE orders SET user_id = NULL'),
      expect.stringContaining('DELETE FROM users'),
      expect.stringContaining('PRAGMA foreign_keys = ON'),
    ])
  })

  it('reports missing members during permanent deletion', async () => {
    query.mockResolvedValueOnce([{ ...memberRow, deleted_at: '2026-08-29T01:00:00.000Z' }])
    execute.mockImplementation(async (sql: string) => {
      if (sql.includes('DELETE FROM users')) return { lastInsertId: 0, rowsAffected: 0 }
      return { lastInsertId: 0, rowsAffected: 1 }
    })

    await expect(service.hardDeleteUser('2')).resolves.toMatchObject({
      success: false,
      error: 'User not found',
    })
  })

  it('restores foreign keys when permanent deletion fails midway', async () => {
    query.mockResolvedValueOnce([{ ...memberRow, deleted_at: '2026-08-29T01:00:00.000Z' }])
    execute
      .mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 1 })
      .mockRejectedValueOnce(new Error('locked'))
      .mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 1 })

    await expect(service.hardDeleteUser('2')).resolves.toMatchObject({
      success: false,
      error: 'Failed to permanently delete user',
    })
    expect(execute.mock.calls[2][0]).toContain('PRAGMA foreign_keys = ON')
  })

  it('returns an error when permanent deletion crashes early', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(service.hardDeleteUser('2')).resolves.toMatchObject({
      success: false,
      error: 'Failed to permanently delete user',
    })
  })
})
