import { validatePasswordStrength, validatePin } from '@openpos/domain'
import { requestApiJson } from '../lib/api-client'
import { getDesktopApiConfig } from '../lib/api-config'
import { clearPersistedAuth, isAuthExpiredError } from '../lib/auth-session'
import { execute, query } from '../lib/db-adapter'
import { requireDesktopApi } from '../lib/desktop'
import { isDesktop } from '../lib/platform'
import { registerStoreConnection } from './connections'

// ---------------------------------------------------------------------------
// Password hashing helpers
// On desktop, delegate bcrypt to Electron; on web, use the API server.
// ---------------------------------------------------------------------------

async function hashPassword(password: string): Promise<string> {
  if (isDesktop) {
    return requireDesktopApi().hashPassword(password)
  }
  const data = await requestApiJson<{ hash: string }>('/api/auth/hash', {
    method: 'POST',
    body: { password },
  })
  return data.hash
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (isDesktop) {
    return requireDesktopApi().verifyPassword(password, hash)
  }
  const data = await requestApiJson<{ valid: boolean }>('/api/auth/verify', {
    method: 'POST',
    body: { password, hash },
  })
  return data.valid
}

/**
 * Push queued outbox writes to the remote store right away. Replicated-table
 * writes are captured automatically by the sync engine; this only removes the
 * wait for the background poll. Best effort: offline, the write stays queued
 * and replicates on a later sync cycle.
 */
function triggerBackgroundSync(): void {
  if (!isDesktop) return
  try {
    void requireDesktopApi()
      .sync.trigger()
      .catch(() => {})
  } catch {
    // Replicates on the next sync cycle.
  }
}

export interface DesktopRemoteSessionState {
  apiConfigured: boolean
  hasAuthToken: boolean
  isReady: boolean
  lastError: string | null
  configPath: string
}

const DESKTOP_REMOTE_AUTH_STATUS_KEY = 'desktop_remote_auth_status'

interface PersistedDesktopRemoteAuthStatus {
  apiConfigured: boolean
  lastError: string | null
  configPath: string
}

interface DesktopApiTokenResult {
  token: string | null
  error: string | null
  apiConfigured: boolean
  configPath: string
}

function readDesktopRemoteAuthStatus(): PersistedDesktopRemoteAuthStatus | null {
  if (typeof localStorage === 'undefined') {
    return null
  }

  const storedStatus = localStorage.getItem(DESKTOP_REMOTE_AUTH_STATUS_KEY)
  if (!storedStatus) {
    return null
  }

  try {
    const parsed = JSON.parse(storedStatus) as Partial<PersistedDesktopRemoteAuthStatus>
    return {
      apiConfigured: Boolean(parsed.apiConfigured),
      lastError: typeof parsed.lastError === 'string' ? parsed.lastError : null,
      configPath: typeof parsed.configPath === 'string' ? parsed.configPath : '',
    }
  } catch {
    localStorage.removeItem(DESKTOP_REMOTE_AUTH_STATUS_KEY)
    return null
  }
}

function persistDesktopRemoteAuthStatus(status: PersistedDesktopRemoteAuthStatus): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(DESKTOP_REMOTE_AUTH_STATUS_KEY, JSON.stringify(status))
}

export async function getDesktopRemoteSessionState(): Promise<DesktopRemoteSessionState> {
  const config = isDesktop
    ? await getDesktopApiConfig()
    : {
        apiUrl: import.meta.env.VITE_API_URL || '',
        configPath: '',
        configSource: 'bundled' as const,
        userDataConfigPath: '',
      }
  const apiUrl = config.apiUrl
  const hasAuthToken = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('auth_token'))
  const persistedStatus = isDesktop ? readDesktopRemoteAuthStatus() : null

  return {
    apiConfigured: Boolean(apiUrl),
    hasAuthToken,
    isReady: Boolean(apiUrl) && hasAuthToken,
    lastError: hasAuthToken ? null : persistedStatus?.lastError || null,
    configPath: config.configPath || config.userDataConfigPath || '',
  }
}

type DesktopLoginCredentials =
  | { email: string; password: string; owner?: { name: string } }
  | { userId: string; pin: string }

function isPinLoginCredentials(credentials: DesktopLoginCredentials): credentials is { userId: string; pin: string } {
  return 'pin' in credentials
}

async function getDesktopApiToken(credentials: DesktopLoginCredentials): Promise<DesktopApiTokenResult> {
  const config = await getDesktopApiConfig()
  const apiUrl = config.apiUrl
  const configPath = config.configPath || config.userDataConfigPath || ''
  if (!apiUrl) {
    return {
      token: null,
      error: 'Remote API is not configured',
      apiConfigured: false,
      configPath,
    }
  }

  const loginBody = isPinLoginCredentials(credentials)
    ? { userId: credentials.userId, pin: credentials.pin }
    : { email: credentials.email, password: credentials.password }

  const login = () =>
    requestApiJson<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: loginBody,
    })

  try {
    let data: { token: string }
    try {
      data = await login()
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message !== 'connection_not_found' || isPinLoginCredentials(credentials)) {
        throw error
      }

      await registerStoreConnection({
        adminName: credentials.owner?.name,
        adminEmail: credentials.email,
        adminPassword: credentials.password,
      })
      data = await login()
    }

    const token = typeof data.token === 'string' ? data.token.trim() : ''
    if (!token) {
      return {
        token: null,
        error: 'Remote API sign-in did not return a token.',
        apiConfigured: true,
        configPath,
      }
    }

    return {
      token,
      error: null,
      apiConfigured: true,
      configPath,
    }
  } catch (error) {
    console.warn('[AuthService] Desktop API sign-in failed:', error)
    return {
      token: null,
      error: error instanceof Error ? error.message : 'Remote API sign-in failed.',
      apiConfigured: true,
      configPath,
    }
  }
}

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'manager' | 'user'
  permissions: string[]
  createdAt: string
  lastLogin?: string
  deletedAt?: string
  pinEnabled?: boolean
}

export const DEFAULT_PERMISSIONS = {
  admin: ['*'],
  manager: [
    'sales.view',
    'sales.create',
    'sales.edit',
    'products.view',
    'products.create',
    'products.edit',
    'products.delete',
    'inventory.view',
    'inventory.edit',
    'reports.view',
    'reports.export',
    'users.view',
    'users.create',
    'users.edit',
    'users.delete',
  ],
  user: ['sales.view', 'sales.create', 'products.view'],
}

interface DatabaseUser {
  id: number
  email: string
  password: string
  name: string
  role: 'admin' | 'manager' | 'user'
  permissions: string
  created_at: string
  last_login?: string
  deleted_at?: string
  password_hashed?: number
  pin_enabled?: number
  pin_hash?: string | null
}

export class AuthService {
  private static instance: AuthService
  private currentUser: User | null = null

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService()
    }
    return AuthService.instance
  }

  private convertDbUser(dbUser: DatabaseUser): User {
    return {
      id: dbUser.id.toString(),
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      permissions: JSON.parse(dbUser.permissions),
      createdAt: dbUser.created_at,
      lastLogin: dbUser.last_login,
      deletedAt: dbUser.deleted_at,
      pinEnabled: Boolean(dbUser.pin_enabled) && Boolean(dbUser.pin_hash),
    }
  }

  private canManageMemberPin(targetRole: User['role']): boolean {
    if (this.hasRole('admin')) return true
    return this.hasRole('manager') && targetRole !== 'admin'
  }

  async signIn(
    email: string,
    password: string,
  ): Promise<{ success: boolean; user?: User; error?: string; warning?: string }> {
    try {
      const normalizedEmail = email.toLowerCase()

      if (!isDesktop) {
        const data = await requestApiJson<{ user: User; token: string }>('/api/auth/login', {
          method: 'POST',
          body: { email: normalizedEmail, password },
        })

        // Store JWT token for subsequent API calls
        localStorage.setItem('auth_token', data.token)

        this.currentUser = data.user
        localStorage.setItem('pos_user', JSON.stringify(data.user))

        return {
          success: true,
          user: data.user,
        }
      }

      // Desktop mode: direct database access
      const users = await query<DatabaseUser>('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1', [
        normalizedEmail,
      ])

      if (users.length === 0) {
        return {
          success: false,
          error: 'Invalid email or password',
        }
      }

      const dbUser = users[0]

      // Check if password is already hashed
      const isHashed = dbUser.password_hashed === 1

      if (isHashed) {
        // Bcrypt verification
        const isValid = await verifyPassword(password, dbUser.password)
        if (!isValid) {
          return { success: false, error: 'Invalid email or password' }
        }
      } else {
        // Plain text fallback - verify then migrate
        if (dbUser.password !== password) {
          return { success: false, error: 'Invalid email or password' }
        }
        // Lazy migration: hash password and update database
        const hashedPassword = await hashPassword(password)
        await execute('UPDATE users SET password = ?, password_hashed = 1, updated_at = ? WHERE id = ?', [
          hashedPassword,
          new Date().toISOString(),
          dbUser.id,
        ])
      }

      const user = this.convertDbUser(dbUser)

      await execute('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), dbUser.id])

      localStorage.removeItem('auth_token')
      const remoteAuthResult = await getDesktopApiToken({
        email: normalizedEmail,
        password,
        owner: { name: user.name },
      })
      persistDesktopRemoteAuthStatus({
        apiConfigured: remoteAuthResult.apiConfigured,
        lastError: remoteAuthResult.token ? null : remoteAuthResult.error,
        configPath: remoteAuthResult.configPath,
      })

      if (!remoteAuthResult.apiConfigured) {
        return {
          success: false,
          error: remoteAuthResult.error || 'Remote API is not configured',
        }
      }

      if (remoteAuthResult.token) {
        localStorage.setItem('auth_token', remoteAuthResult.token)
      }

      this.currentUser = user
      localStorage.setItem('pos_user', JSON.stringify(user))

      return {
        success: true,
        user,
        warning: remoteAuthResult.token ? undefined : remoteAuthResult.error || undefined,
      }
    } catch (error) {
      console.error('Sign in error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sign in failed',
      }
    }
  }

  async signInWithPin(
    userId: string,
    pin: string,
  ): Promise<{ success: boolean; user?: User; error?: string; warning?: string }> {
    try {
      if (validatePin(pin)) {
        return { success: false, error: 'Invalid PIN' }
      }

      if (!isDesktop) {
        const data = await requestApiJson<{ user: User; token: string }>('/api/auth/login', {
          method: 'POST',
          body: { userId, pin },
        })

        localStorage.setItem('auth_token', data.token)
        this.currentUser = data.user
        localStorage.setItem('pos_user', JSON.stringify(data.user))

        return { success: true, user: data.user }
      }

      const users = await query<DatabaseUser>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1', [
        parseInt(userId, 10),
      ])
      const dbUser = users[0]
      if (!dbUser?.pin_enabled || !dbUser.pin_hash) {
        return { success: false, error: 'Invalid PIN' }
      }

      const isValid = await verifyPassword(pin, dbUser.pin_hash)
      if (!isValid) {
        return { success: false, error: 'Invalid PIN' }
      }

      const user = this.convertDbUser(dbUser)

      await execute('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), dbUser.id])

      localStorage.removeItem('auth_token')
      const remoteAuthResult = await getDesktopApiToken({ userId, pin })
      persistDesktopRemoteAuthStatus({
        apiConfigured: remoteAuthResult.apiConfigured,
        lastError: remoteAuthResult.token ? null : remoteAuthResult.error,
        configPath: remoteAuthResult.configPath,
      })

      if (!remoteAuthResult.apiConfigured) {
        return {
          success: false,
          error: remoteAuthResult.error || 'Remote API is not configured',
        }
      }

      if (remoteAuthResult.token) {
        localStorage.setItem('auth_token', remoteAuthResult.token)
      }

      this.currentUser = user
      localStorage.setItem('pos_user', JSON.stringify(user))

      return {
        success: true,
        user,
        warning: remoteAuthResult.token ? undefined : remoteAuthResult.error || undefined,
      }
    } catch (error) {
      console.error('PIN sign in error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sign in failed',
      }
    }
  }

  signOut(): void {
    this.currentUser = null
    clearPersistedAuth()
  }

  private clearPersistedUser(): void {
    this.currentUser = null
    clearPersistedAuth()
  }

  getCurrentUser(): User | null {
    if (this.currentUser) {
      return this.currentUser
    }

    const storedUser = localStorage.getItem('pos_user')
    if (storedUser) {
      try {
        this.currentUser = JSON.parse(storedUser)
        return this.currentUser
      } catch {
        return null
      }
    }

    return null
  }

  async restoreCurrentUser(): Promise<User | null> {
    if (this.currentUser) {
      return this.currentUser
    }

    const storedUser = localStorage.getItem('pos_user')
    if (!storedUser) {
      return null
    }

    try {
      const parsedUser = JSON.parse(storedUser) as User

      if (!isDesktop) {
        const data = await requestApiJson<{ user: User }>('/api/auth/me', {
          requireAuth: true,
        })

        this.currentUser = data.user
        localStorage.setItem('pos_user', JSON.stringify(data.user))
        return data.user
      }

      const users = await query<DatabaseUser>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1', [
        Number(parsedUser.id),
      ])

      if (users.length === 0) {
        this.clearPersistedUser()
        return null
      }

      const restoredUser = this.convertDbUser(users[0])
      this.currentUser = restoredUser
      localStorage.setItem('pos_user', JSON.stringify(restoredUser))

      return restoredUser
    } catch (error) {
      if (isAuthExpiredError(error)) {
        this.clearPersistedUser()
        return null
      }

      console.error('Restore current user error:', error)
      this.clearPersistedUser()
      return null
    }
  }

  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null
  }

  hasPermission(permission: string): boolean {
    const user = this.getCurrentUser()
    if (!user) return false

    if (user.permissions.includes('*')) return true

    return user.permissions.includes(permission)
  }

  hasRole(role: User['role']): boolean {
    const user = this.getCurrentUser()
    return user?.role === role
  }

  async getUsers(): Promise<User[]> {
    if (!this.hasPermission('users.view') && !this.hasRole('admin')) {
      throw new Error('Insufficient permissions')
    }

    try {
      const users = await query<DatabaseUser>('SELECT * FROM users ORDER BY created_at DESC')

      return users.map((user) => this.convertDbUser(user))
    } catch (error) {
      console.error('Get users error:', error)
      throw new Error('Failed to fetch users')
    }
  }

  async getAllUsersForLogin(): Promise<User[]> {
    // Public method for login page - no authentication required
    // Only return active users (not deleted)
    if (!isDesktop) {
      // Web mode: fetch from public API endpoint
      try {
        const data = await requestApiJson<{
          users: Array<{ id: string; email: string; name: string; role: User['role']; pinEnabled?: boolean }>
        }>('/api/auth/users')
        return data.users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          permissions: DEFAULT_PERMISSIONS[u.role], // Derive permissions from role
          createdAt: '', // Not needed for login screen
          pinEnabled: Boolean(u.pinEnabled),
        }))
      } catch (error) {
        console.error('[AuthService] Failed to fetch users from API:', error)
        return []
      }
    }

    // Desktop mode: direct database access
    try {
      const users = await query<DatabaseUser>('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY name ASC')
      return users.map((user) => this.convertDbUser(user))
    } catch (error) {
      console.error('[AuthService] Get users for login error:', error)
      return []
    }
  }

  async getUsersPaginated(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    users: User[]
    totalCount: number
    totalPages: number
    currentPage: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }> {
    if (!this.hasPermission('users.view') && !this.hasRole('admin')) {
      throw new Error('Insufficient permissions')
    }

    try {
      const offset = (page - 1) * limit

      // Get total count (active users only)
      const countResult = await query<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL')
      const totalCount = countResult[0]?.count || 0
      const totalPages = Math.ceil(totalCount / limit)

      // Get paginated users (active users only)
      const users = await query<DatabaseUser>(
        'SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [limit, offset],
      )

      return {
        users: users.map((user) => this.convertDbUser(user)),
        totalCount,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      }
    } catch (error) {
      console.error('Get paginated users error:', error)
      throw new Error('Failed to fetch paginated users')
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const user = this.getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const strengthError = validatePasswordStrength(newPassword)
    if (strengthError) {
      return { success: false, error: strengthError }
    }

    try {
      const users = await query<DatabaseUser>('SELECT password, password_hashed FROM users WHERE id = ? LIMIT 1', [
        parseInt(user.id, 10),
      ])

      if (users.length === 0) {
        return { success: false, error: 'User not found' }
      }

      const dbUser = users[0]
      const isHashed = dbUser.password_hashed === 1

      // Verify current password
      if (isHashed) {
        const isValid = await verifyPassword(currentPassword, dbUser.password)
        if (!isValid) {
          return { success: false, error: 'Current password is incorrect' }
        }
      } else {
        if (dbUser.password !== currentPassword) {
          return { success: false, error: 'Current password is incorrect' }
        }
      }

      // Hash new password and update the local store.
      const hashedPassword = await hashPassword(newPassword)
      await execute('UPDATE users SET password = ?, password_hashed = 1, updated_at = ? WHERE id = ?', [
        hashedPassword,
        new Date().toISOString(),
        parseInt(user.id, 10),
      ])

      // Replicate the new hash to the remote store right away. Offline the
      // write stays queued in the outbox and replicates on the next sync.
      if (isDesktop) {
        try {
          await requireDesktopApi().sync.trigger()
        } catch {
          // Best effort: the queued write replicates on a later sync.
        }
      }

      return { success: true }
    } catch (error) {
      console.error('Change password error:', error)
      return { success: false, error: 'Failed to change password' }
    }
  }
  async resetPasswordWithInternalSecret(
    email: string,
    internalSecret: string,
    newPassword: string,
  ): Promise<{ success: boolean; error?: string }> {
    const strengthError = validatePasswordStrength(newPassword)
    if (strengthError) {
      return { success: false, error: strengthError }
    }

    if (!email.trim() || !internalSecret) {
      return { success: false, error: 'A valid email and internal secret are required' }
    }

    try {
      await requestApiJson<{ success: boolean }>('/api/auth/admin-reset-password', {
        method: 'POST',
        body: {
          email: email.trim().toLowerCase(),
          newPassword,
          internalSecret,
        },
      })

      // Pull the new hash into this device's local copy right away so both
      // sides match without waiting for the background sync.
      if (isDesktop) {
        try {
          await requireDesktopApi().sync.trigger()
        } catch {
          // Best effort: the next background sync pulls it anyway.
        }
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to reset password' }
    }
  }

  async verifyInternalSecret(internalSecret: string): Promise<void> {
    await requestApiJson<{ valid: boolean }>('/api/auth/verify-internal-secret', {
      method: 'POST',
      body: { internalSecret },
    })
  }

  async createUser(
    userData: Omit<User, 'id' | 'createdAt' | 'permissions'> & {
      password: string
      pin?: string
    },
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    if (!this.hasPermission('users.create') && !this.hasRole('admin')) {
      return { success: false, error: 'Insufficient permissions' }
    }

    // Strong password validation
    if (userData.password.length < 8) {
      return {
        success: false,
        error: 'Password must be at least 8 characters',
      }
    }
    if (!/[A-Z]/.test(userData.password)) {
      return {
        success: false,
        error: 'Password must contain an uppercase letter',
      }
    }
    if (!/[a-z]/.test(userData.password)) {
      return {
        success: false,
        error: 'Password must contain a lowercase letter',
      }
    }
    if (!/[0-9]/.test(userData.password)) {
      return {
        success: false,
        error: 'Password must contain a number',
      }
    }
    if (!/[^A-Za-z0-9]/.test(userData.password)) {
      return {
        success: false,
        error: 'Password must contain a special character',
      }
    }

    try {
      const existingUsers = await query<DatabaseUser>('SELECT id FROM users WHERE email = ? LIMIT 1', [
        userData.email.toLowerCase(),
      ])

      if (existingUsers.length > 0) {
        return { success: false, error: 'User with this email already exists' }
      }

      const permissions = JSON.stringify(DEFAULT_PERMISSIONS[userData.role])
      const hashedPassword = await hashPassword(userData.password)
      const now = new Date().toISOString()

      let pinEnabled = 0
      let pinHash: string | null = null
      if (userData.pinEnabled) {
        if (!this.canManageMemberPin(userData.role)) {
          return { success: false, error: 'Insufficient permissions' }
        }
        const pinError = validatePin(userData.pin || '')
        if (pinError) {
          return { success: false, error: pinError }
        }
        pinEnabled = 1
        pinHash = await hashPassword(userData.pin || '')
      }

      const result = await execute(
        'INSERT INTO users (email, password, name, role, permissions, created_at, updated_at, password_hashed, pin_enabled, pin_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          userData.email.toLowerCase(),
          hashedPassword,
          userData.name,
          userData.role,
          permissions,
          now,
          now,
          1,
          pinEnabled,
          pinHash,
        ],
      )
      triggerBackgroundSync()

      const newUser: User = {
        id: result.lastInsertId.toString(),
        email: userData.email,
        name: userData.name,
        role: userData.role,
        permissions: [...DEFAULT_PERMISSIONS[userData.role]],
        createdAt: new Date().toISOString(),
        pinEnabled: pinEnabled === 1,
      }

      return { success: true, user: newUser }
    } catch (error) {
      console.error('Create user error:', error)
      return { success: false, error: 'Failed to create user' }
    }
  }

  async updateUser(
    userId: string,
    updates: Partial<Omit<User, 'id' | 'createdAt'> & { password?: string; pin?: string }>,
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    if (!this.hasPermission('users.edit') && !this.hasRole('admin')) {
      return { success: false, error: 'Insufficient permissions' }
    }

    try {
      const users = await query<DatabaseUser>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1', [
        parseInt(userId, 10),
      ])

      if (users.length === 0) {
        return { success: false, error: 'User not found or has been deleted' }
      }

      const currentUser = this.getCurrentUser()
      if (currentUser?.id === userId && updates.role && updates.role !== currentUser.role) {
        return { success: false, error: 'Cannot change your own role' }
      }

      if (updates.email) {
        const existingUsers = await query<DatabaseUser>('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [
          updates.email.toLowerCase(),
          parseInt(userId, 10),
        ])

        if (existingUsers.length > 0) {
          return {
            success: false,
            error: 'User with this email already exists',
          }
        }
      }

      const updateFields = []
      const updateValues = []

      if (updates.email) {
        updateFields.push('email = ?')
        updateValues.push(updates.email.toLowerCase())
      }

      if (updates.name) {
        updateFields.push('name = ?')
        updateValues.push(updates.name)
      }

      if (updates.role) {
        updateFields.push('role = ?')
        updateValues.push(updates.role)
        updateFields.push('permissions = ?')
        updateValues.push(JSON.stringify(DEFAULT_PERMISSIONS[updates.role]))
      }

      // Allow admin to reset password when editing user
      if (updates.password && this.hasRole('admin')) {
        // Strong password validation
        if (updates.password.length < 8) {
          return {
            success: false,
            error: 'Password must be at least 8 characters',
          }
        }
        if (!/[A-Z]/.test(updates.password)) {
          return {
            success: false,
            error: 'Password must contain an uppercase letter',
          }
        }
        if (!/[a-z]/.test(updates.password)) {
          return {
            success: false,
            error: 'Password must contain a lowercase letter',
          }
        }
        if (!/[0-9]/.test(updates.password)) {
          return {
            success: false,
            error: 'Password must contain a number',
          }
        }
        if (!/[^A-Za-z0-9]/.test(updates.password)) {
          return {
            success: false,
            error: 'Password must contain a special character',
          }
        }
        const hashedPassword = await hashPassword(updates.password)
        updateFields.push('password = ?')
        updateFields.push('password_hashed = ?')
        updateValues.push(hashedPassword)
        updateValues.push(1)
      }

      if (updates.pinEnabled !== undefined || updates.pin) {
        if (!this.canManageMemberPin(users[0].role)) {
          return { success: false, error: 'Insufficient permissions' }
        }

        if (updates.pinEnabled === false) {
          updateFields.push('pin_enabled = ?')
          updateFields.push('pin_hash = ?')
          updateValues.push(0)
          updateValues.push(null)
        } else if (updates.pin) {
          const pinError = validatePin(updates.pin)
          if (pinError) {
            return { success: false, error: pinError }
          }
          const hashedPin = await hashPassword(updates.pin)
          updateFields.push('pin_enabled = ?')
          updateFields.push('pin_hash = ?')
          updateValues.push(1)
          updateValues.push(hashedPin)
        } else if (updates.pinEnabled === true) {
          if (!users[0].pin_hash) {
            return { success: false, error: 'PIN must be exactly 6 digits' }
          }
          updateFields.push('pin_enabled = ?')
          updateValues.push(1)
        }
      }

      if (updateFields.length > 0) {
        // Advance the sync watermark so the change replicates to other devices.
        updateFields.push('updated_at = ?')
        updateValues.push(new Date().toISOString())
        updateValues.push(parseInt(userId, 10))

        await execute(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`, updateValues)
        triggerBackgroundSync()
      }

      const updatedUsers = await query<DatabaseUser>('SELECT * FROM users WHERE id = ? LIMIT 1', [parseInt(userId, 10)])

      const updatedUser = this.convertDbUser(updatedUsers[0])
      return { success: true, user: updatedUser }
    } catch (error) {
      console.error('Update user error:', error)
      return { success: false, error: 'Failed to update user' }
    }
  }

  async deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.hasPermission('users.delete') && !this.hasRole('admin')) {
      return { success: false, error: 'Insufficient permissions' }
    }

    const currentUser = this.getCurrentUser()
    if (currentUser?.id === userId) {
      return { success: false, error: 'Cannot delete your own account' }
    }

    try {
      // Soft delete by setting deleted_at timestamp; bump updated_at so the
      // deletion watermarks forward and other devices pull it.
      const result = await execute(
        'UPDATE users SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [new Date().toISOString(), new Date().toISOString(), parseInt(userId, 10)],
      )
      triggerBackgroundSync()

      if (result.rowsAffected === 0) {
        return { success: false, error: 'User not found or already deleted' }
      }

      return { success: true }
    } catch (error) {
      console.error('Delete user error:', error)
      return { success: false, error: 'Failed to delete user' }
    }
  }

  async getDeletedUsers(): Promise<User[]> {
    if (!this.hasPermission('users.delete') && !this.hasRole('admin')) {
      throw new Error('Insufficient permissions')
    }

    try {
      const users = await query<DatabaseUser>(
        'SELECT * FROM users WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC',
      )

      return users.map((user) => this.convertDbUser(user))
    } catch (error) {
      console.error('Get deleted users error:', error)
      throw new Error('Failed to fetch deleted users')
    }
  }

  async restoreUser(userId: string): Promise<{ success: boolean; user?: User; error?: string }> {
    if (!this.hasPermission('users.delete') && !this.hasRole('admin')) {
      return { success: false, error: 'Insufficient permissions' }
    }

    try {
      // Restore by clearing deleted_at; bump updated_at so the change
      // watermarks forward and other devices pull it.
      const result = await execute(
        'UPDATE users SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL',
        [new Date().toISOString(), parseInt(userId, 10)],
      )
      triggerBackgroundSync()

      if (result.rowsAffected === 0) {
        return { success: false, error: 'Deleted user not found' }
      }

      // Get the restored user
      const users = await query<DatabaseUser>('SELECT * FROM users WHERE id = ? LIMIT 1', [parseInt(userId, 10)])

      if (users.length === 0) {
        return { success: false, error: 'Failed to retrieve restored user' }
      }

      const restoredUser = this.convertDbUser(users[0])
      return { success: true, user: restoredUser }
    } catch (error) {
      console.error('Restore user error:', error)
      return { success: false, error: 'Failed to restore user' }
    }
  }

  async hardDeleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.hasPermission('users.delete') && !this.hasRole('admin')) {
      return { success: false, error: 'Insufficient permissions' }
    }

    const currentUser = this.getCurrentUser()
    if (currentUser?.id === userId) {
      return { success: false, error: 'Cannot delete your own account' }
    }

    try {
      // First verify user is already soft deleted
      const users = await query<DatabaseUser>('SELECT * FROM users WHERE id = ? AND deleted_at IS NOT NULL LIMIT 1', [
        parseInt(userId, 10),
      ])

      if (users.length === 0) {
        return { success: false, error: 'User not found or not deleted' }
      }

      // Disable foreign key constraints temporarily
      await execute('PRAGMA foreign_keys = OFF')

      try {
        // Set user_id to NULL in orders table for this deleted user
        await execute('UPDATE orders SET user_id = NULL WHERE user_id = ?', [parseInt(userId, 10)])

        // Permanently delete the user
        const result = await execute('DELETE FROM users WHERE id = ?', [parseInt(userId, 10)])

        if (result.rowsAffected === 0) {
          await execute('PRAGMA foreign_keys = ON')
          return { success: false, error: 'User not found' }
        }

        await execute('PRAGMA foreign_keys = ON')
        return { success: true }
      } catch (innerError) {
        await execute('PRAGMA foreign_keys = ON')
        throw innerError
      }
    } catch (error) {
      console.error('Hard delete user error:', error)
      return { success: false, error: 'Failed to permanently delete user' }
    }
  }
}

export const authService = AuthService.getInstance()
