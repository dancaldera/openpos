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

const { requestApiJson, execute, query } = vi.hoisted(() => ({
  requestApiJson: vi.fn(
    async (): Promise<Record<string, unknown>> => ({
      user: {
        id: '1',
        email: 'ana@example.com',
        name: 'Ana',
        role: 'admin' as const,
        permissions: ['*'],
        createdAt: '2026-03-27T00:00:00.000Z',
      },
    }),
  ),
  execute: vi.fn(async () => ({ lastInsertId: 0, rowsAffected: 0 })),
  query: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
}))

vi.mock('../lib/api-client', () => ({
  requestApiJson,
}))

vi.mock('../lib/db-adapter', () => ({
  execute,
  query,
}))

vi.mock('../lib/desktop', () => ({
  requireDesktopApi: vi.fn(() => {
    throw new Error('Desktop API should not be used in web mode tests')
  }),
}))

vi.mock('../lib/platform', () => ({
  isDesktop: false,
}))

const { AuthService } = await import('./auth-turso')
const { AuthExpiredError } = await import('../lib/auth-session')

describe('AuthService.restoreCurrentUser', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    service.signOut()
    requestApiJson.mockReset()
  })

  it('validates the stored token and refreshes the persisted user from /api/auth/me', async () => {
    storage.setItem(
      'pos_user',
      JSON.stringify({
        id: 'stale',
        email: 'stale@example.com',
        name: 'Stale User',
        role: 'user',
        permissions: [],
        createdAt: '',
      }),
    )
    storage.setItem('auth_token', 'valid-token')
    requestApiJson.mockImplementation(async () => ({
      user: {
        id: '1',
        email: 'ana@example.com',
        name: 'Ana',
        role: 'admin',
        permissions: ['*'],
        createdAt: '2026-03-27T00:00:00.000Z',
      },
    }))

    const restoredUser = await service.restoreCurrentUser()

    expect(requestApiJson).toHaveBeenCalledWith('/api/auth/me', { requireAuth: true })
    expect(restoredUser?.email).toBe('ana@example.com')
    expect(storage.getItem('pos_user')).toBe(
      JSON.stringify({
        id: '1',
        email: 'ana@example.com',
        name: 'Ana',
        role: 'admin',
        permissions: ['*'],
        createdAt: '2026-03-27T00:00:00.000Z',
      }),
    )
  })

  it('clears persisted auth when the stored token is expired', async () => {
    storage.setItem(
      'pos_user',
      JSON.stringify({
        id: '1',
        email: 'ana@example.com',
        name: 'Ana',
        role: 'admin',
        permissions: ['*'],
        createdAt: '2026-03-27T00:00:00.000Z',
      }),
    )
    storage.setItem('auth_token', 'expired-token')
    requestApiJson.mockImplementation(async () => {
      throw new AuthExpiredError()
    })

    const restoredUser = await service.restoreCurrentUser()

    expect(restoredUser).toBeNull()
    expect(storage.getItem('auth_token')).toBeNull()
    expect(storage.getItem('pos_user')).toBeNull()
  })
})

describe('AuthService.signInWithPin web', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    service.signOut()
    requestApiJson.mockReset()
  })

  it('stores the token from PIN login', async () => {
    requestApiJson.mockResolvedValueOnce({
      token: 'pin-jwt',
      user: {
        id: '1',
        email: 'ana@example.com',
        name: 'Ana',
        role: 'admin',
        permissions: ['*'],
        createdAt: '2026-03-27T00:00:00.000Z',
        pinEnabled: true,
      },
    })

    const result = await service.signInWithPin('1', '246810')

    expect(requestApiJson).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: { userId: '1', pin: '246810' },
    })
    expect(result.success).toBe(true)
    expect(storage.getItem('auth_token')).toBe('pin-jwt')
  })

  it('rejects a PIN that is not six digits without calling the API', async () => {
    const result = await service.signInWithPin('1', '123')

    expect(result).toEqual({ success: false, error: 'Invalid PIN' })
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('surfaces API failures from PIN login', async () => {
    requestApiJson.mockRejectedValueOnce(new Error('offline'))

    await expect(service.signInWithPin('1', '246810')).resolves.toMatchObject({
      success: false,
      error: 'offline',
    })
  })
})

describe('AuthService.signIn web', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  const apiUser = {
    id: '1',
    email: 'ana@example.com',
    name: 'Ana',
    role: 'admin',
    permissions: ['*'],
    createdAt: '2026-03-27T00:00:00.000Z',
  }

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    service.signOut()
    requestApiJson.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('stores the token and user from email login', async () => {
    requestApiJson.mockResolvedValueOnce({ user: apiUser, token: 'jwt-token' })

    const result = await service.signIn('ANA@example.com', 'secret')

    expect(requestApiJson).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: { email: 'ana@example.com', password: 'secret' },
    })
    expect(result).toMatchObject({ success: true, user: { email: 'ana@example.com' } })
    expect(storage.getItem('auth_token')).toBe('jwt-token')
    expect(storage.getItem('pos_user')).toContain('ana@example.com')
  })

  it('returns API failures', async () => {
    requestApiJson.mockRejectedValueOnce(new Error('Invalid email or password'))

    await expect(service.signIn('ana@example.com', 'wrong')).resolves.toMatchObject({
      success: false,
      error: 'Invalid email or password',
    })

    requestApiJson.mockReset()
    requestApiJson.mockRejectedValueOnce('boom')

    await expect(service.signIn('ana@example.com', 'wrong')).resolves.toMatchObject({
      success: false,
      error: 'Sign in failed',
    })
  })
})

describe('AuthService session helpers web', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  function signInAs(user: Record<string, unknown>) {
    storage.setItem('pos_user', JSON.stringify(user))
  }

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    service.signOut()
    requestApiJson.mockReset()
    query.mockReset()
    query.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('reads the current user from memory, storage, or nowhere', async () => {
    expect(service.getCurrentUser()).toBeNull()

    signInAs({ id: '1', email: 'ana@example.com', name: 'Ana', role: 'admin', permissions: ['*'] })

    expect(service.getCurrentUser()).toMatchObject({ email: 'ana@example.com' })
    expect(service.getCurrentUser()).toMatchObject({ email: 'ana@example.com' })

    service.signOut()
    storage.setItem('pos_user', 'corrupted')

    expect(service.getCurrentUser()).toBeNull()
  })

  it('reports authentication state', () => {
    expect(service.isAuthenticated()).toBe(false)

    signInAs({ id: '1', role: 'user', permissions: [] })

    expect(service.isAuthenticated()).toBe(true)
  })

  it('checks permissions and roles', () => {
    expect(service.hasPermission('sales.view')).toBe(false)
    expect(service.hasRole('admin')).toBe(false)

    signInAs({ id: '1', role: 'admin', permissions: ['*'] })

    expect(service.hasPermission('anything.at.all')).toBe(true)
    expect(service.hasRole('admin')).toBe(true)
    expect(service.hasRole('manager')).toBe(false)

    service.signOut()
    signInAs({ id: '2', role: 'user', permissions: ['sales.view'] })

    expect(service.hasPermission('sales.view')).toBe(true)
    expect(service.hasPermission('products.edit')).toBe(false)
  })

  it('restores the in-memory user without an API call', async () => {
    signInAs({ id: '1', email: 'ana@example.com', name: 'Ana', role: 'admin', permissions: ['*'] })
    service.getCurrentUser()
    requestApiJson.mockClear()

    const restored = await service.restoreCurrentUser()

    expect(restored?.email).toBe('ana@example.com')
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('returns null when nothing is stored', async () => {
    await expect(service.restoreCurrentUser()).resolves.toBeNull()
    expect(requestApiJson).not.toHaveBeenCalled()
  })

  it('clears corrupted persisted users', async () => {
    storage.setItem('pos_user', 'corrupted')

    await expect(service.restoreCurrentUser()).resolves.toBeNull()
    expect(storage.getItem('pos_user')).toBeNull()
  })

  it('clears auth when validation fails unexpectedly', async () => {
    signInAs({ id: '1', email: 'ana@example.com', name: 'Ana', role: 'user', permissions: [] })
    storage.setItem('auth_token', 'token')
    requestApiJson.mockRejectedValueOnce(new Error('db down'))

    await expect(service.restoreCurrentUser()).resolves.toBeNull()
    expect(storage.getItem('pos_user')).toBeNull()
    expect(storage.getItem('auth_token')).toBeNull()
  })
})

describe('AuthService user listings web', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  const dbUser = {
    id: 1,
    email: 'ana@example.com',
    password: 'hashed',
    name: 'Ana',
    role: 'admin',
    permissions: JSON.stringify(['*']),
    created_at: '2026-03-27T00:00:00.000Z',
  }

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
    signInAsAdmin()
    requestApiJson.mockReset()
    query.mockReset()
    query.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('lists members', async () => {
    query.mockResolvedValueOnce([dbUser, { ...dbUser, id: 2, email: 'b@example.com' }])

    const users = await service.getUsers()

    expect(users).toHaveLength(2)
    expect(users[0]).toMatchObject({ id: '1', pinEnabled: false })
  })

  it('requires permission to list members', async () => {
    service.signOut()
    storage.setItem('pos_user', JSON.stringify({ id: '2', role: 'user', permissions: ['sales.view'] }))

    await expect(service.getUsers()).rejects.toThrow('Insufficient permissions')
    await expect(service.getUsersPaginated()).rejects.toThrow('Insufficient permissions')
    await expect(service.getDeletedUsers()).rejects.toThrow('Insufficient permissions')
  })

  it('throws when listing fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(service.getUsers()).rejects.toThrow('Failed to fetch users')
  })

  it('paginates members', async () => {
    query.mockResolvedValueOnce([{ count: 15 }]).mockResolvedValueOnce([dbUser])

    const page = await service.getUsersPaginated(2, 10)

    expect(page).toMatchObject({
      totalCount: 15,
      totalPages: 2,
      currentPage: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    })
  })

  it('handles an empty count when paginating', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const page = await service.getUsersPaginated()

    expect(page).toMatchObject({ totalCount: 0, totalPages: 0 })
  })

  it('throws when pagination fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(service.getUsersPaginated()).rejects.toThrow('Failed to fetch paginated users')
  })

  it('lists members for the login screen through the API', async () => {
    requestApiJson.mockResolvedValueOnce({
      users: [
        { id: '1', email: 'ana@example.com', name: 'Ana', role: 'admin', pinEnabled: true },
        { id: '2', email: 'b@example.com', name: 'Bea', role: 'user' },
      ],
    })

    const users = await service.getAllUsersForLogin()

    expect(users).toEqual([
      {
        id: '1',
        email: 'ana@example.com',
        name: 'Ana',
        role: 'admin',
        permissions: ['*'],
        createdAt: '',
        pinEnabled: true,
      },
      {
        id: '2',
        email: 'b@example.com',
        name: 'Bea',
        role: 'user',
        permissions: ['sales.view', 'sales.create', 'products.view'],
        createdAt: '',
        pinEnabled: false,
      },
    ])
  })

  it('returns an empty login list when the API fails', async () => {
    requestApiJson.mockRejectedValueOnce(new Error('offline'))

    await expect(service.getAllUsersForLogin()).resolves.toEqual([])
  })

  it('lists deleted members', async () => {
    query.mockResolvedValueOnce([{ ...dbUser, deleted_at: '2026-03-28T00:00:00.000Z' }])

    const deleted = await service.getDeletedUsers()

    expect(deleted).toHaveLength(1)

    query.mockReset()
    query.mockRejectedValueOnce(new Error('db down'))

    await expect(service.getDeletedUsers()).rejects.toThrow('Failed to fetch deleted users')
  })
})

describe('AuthService.changePassword web', () => {
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
    signInAsAdmin()
    requestApiJson.mockReset()
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 1 })
    requestApiJson.mockImplementation(async (...args: unknown[]) => {
      const path = args[0] as string
      if (path === '/api/auth/verify') return { valid: true }
      if (path === '/api/auth/hash') return { hash: 'api-hash' }
      return {}
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('changes hashed passwords through the API', async () => {
    query.mockResolvedValueOnce([{ password: 'old-hash', password_hashed: 1 }])

    const result = await service.changePassword('old-pass', 'NewPass1!')

    expect(result).toEqual({ success: true })
    expect(requestApiJson).toHaveBeenCalledWith('/api/auth/verify', {
      method: 'POST',
      body: { password: 'old-pass', hash: 'old-hash' },
    })
    expect(requestApiJson).toHaveBeenCalledWith('/api/auth/hash', {
      method: 'POST',
      body: { password: 'NewPass1!' },
    })
    expect(execute).toHaveBeenCalled()
  })

  it('rejects wrong current passwords', async () => {
    query.mockResolvedValueOnce([{ password: 'old-hash', password_hashed: 1 }])
    requestApiJson.mockReset()
    requestApiJson.mockImplementation(async (...args: unknown[]) => {
      if ((args[0] as string) === '/api/auth/verify') return { valid: false }
      return {}
    })

    await expect(service.changePassword('wrong', 'NewPass1!')).resolves.toMatchObject({
      success: false,
      error: 'Current password is incorrect',
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('migrates plaintext passwords through the API', async () => {
    query.mockResolvedValueOnce([{ password: 'old-plain', password_hashed: 0 }])

    await expect(service.changePassword('old-plain', 'NewPass1!')).resolves.toEqual({ success: true })

    query.mockReset()
    query.mockResolvedValueOnce([{ password: 'old-plain', password_hashed: 0 }])

    await expect(service.changePassword('wrong', 'NewPass1!')).resolves.toMatchObject({
      success: false,
      error: 'Current password is incorrect',
    })
  })
})

describe('AuthService.createUser web', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    service.signOut()
    storage.setItem(
      'pos_user',
      JSON.stringify({ id: '1', email: 'ana@example.com', name: 'Ana', role: 'admin', permissions: ['*'] }),
    )
    requestApiJson.mockReset()
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 9, rowsAffected: 1 })
    query.mockResolvedValue([])
    requestApiJson.mockResolvedValue({ hash: 'api-hash' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('creates members through the API hash endpoint without syncing', async () => {
    const result = await service.createUser({
      email: 'new@example.com',
      name: 'New Member',
      role: 'user',
      password: 'ValidPass1!',
    })

    expect(result).toMatchObject({ success: true, user: { id: '9', email: 'new@example.com' } })
    expect(requestApiJson).toHaveBeenCalledWith('/api/auth/hash', {
      method: 'POST',
      body: { password: 'ValidPass1!' },
    })
  })
})

describe('AuthService password recovery web', () => {
  let storage: MemoryStorage
  const service = AuthService.getInstance()

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
    service.signOut()
    requestApiJson.mockReset()
    requestApiJson.mockResolvedValue({ success: true })
  })

  it('resets through the API without syncing', async () => {
    const result = await service.resetPasswordWithInternalSecret('a@b.co', 's3cret', 'NewPass1!')

    expect(result).toEqual({ success: true })
    expect(requestApiJson).toHaveBeenCalledWith(
      '/api/auth/admin-reset-password',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('AuthService remote session state web', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    globalThis.localStorage = storage as unknown as Storage
  })

  it('reports unconfigured API without a token', async () => {
    const { getDesktopRemoteSessionState } = await import('./auth-turso')

    await expect(getDesktopRemoteSessionState()).resolves.toMatchObject({
      apiConfigured: false,
      hasAuthToken: false,
      isReady: false,
    })
  })

  it('reports readiness with a token', async () => {
    storage.setItem('auth_token', 'jwt')
    const { getDesktopRemoteSessionState } = await import('./auth-turso')

    await expect(getDesktopRemoteSessionState()).resolves.toMatchObject({
      hasAuthToken: true,
      isReady: false,
    })
  })
})
