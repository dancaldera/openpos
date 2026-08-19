import { requestApiJson } from '../lib/api-client'
import { getDesktopApiConfig } from '../lib/api-config'
import { clearPersistedAuth, isAuthExpiredError } from '../lib/auth-session'
import { execute, query } from '../lib/db-adapter'
import { requireDesktopApi } from '../lib/desktop'
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  RECOVERY_CODE_COUNT,
  validatePasswordStrength,
} from '../lib/password-recovery'
import { isDesktop } from '../lib/platform'

// ---------------------------------------------------------------------------
// Password hashing helpers
// On Tauri (desktop): delegate to the Rust backend via invoke() for bcrypt.
// On web: call the API server which handles bcrypt server-side.
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

async function ensureLocalRecoveryCodesTable(): Promise<void> {
  if (!isDesktop) return

  await execute(`
    CREATE TABLE IF NOT EXISTS password_recovery_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      used_at TEXT
    )
  `)
  await execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_password_recovery_codes_code_hash_unique ON password_recovery_codes(code_hash)',
  )
  await execute('CREATE INDEX IF NOT EXISTS idx_password_recovery_codes_user_id ON password_recovery_codes(user_id)')
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

async function getDesktopApiToken(email: string, password: string): Promise<DesktopApiTokenResult> {
  const config = await getDesktopApiConfig()
  const apiUrl = config.apiUrl
  const configPath = config.configPath || config.userDataConfigPath || ''
  if (!apiUrl) {
    return {
      token: null,
      error: null,
      apiConfigured: false,
      configPath,
    }
  }

  try {
    const data = await requestApiJson<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })

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
}

export interface RecoveryCodesStatus {
  generated: boolean
  unusedCount: number
  lastGeneratedAt: string | null
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
    }
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
        await execute('UPDATE users SET password = ?, password_hashed = 1 WHERE id = ?', [hashedPassword, dbUser.id])
      }

      const user = this.convertDbUser(dbUser)

      await execute('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), dbUser.id])

      localStorage.removeItem('auth_token')
      const remoteAuthResult = await getDesktopApiToken(normalizedEmail, password)
      if (remoteAuthResult.token) {
        localStorage.setItem('auth_token', remoteAuthResult.token)
      }
      persistDesktopRemoteAuthStatus({
        apiConfigured: remoteAuthResult.apiConfigured,
        lastError: remoteAuthResult.token ? null : remoteAuthResult.error,
        configPath: remoteAuthResult.configPath,
      })

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
          users: Array<{ id: string; email: string; name: string; role: User['role'] }>
        }>('/api/auth/users')
        return data.users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          permissions: DEFAULT_PERMISSIONS[u.role], // Derive permissions from role
          createdAt: '', // Not needed for login screen
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

      // Hash new password and update
      const hashedPassword = await hashPassword(newPassword)
      await execute('UPDATE users SET password = ?, password_hashed = 1, updated_at = ? WHERE id = ?', [
        hashedPassword,
        new Date().toISOString(),
        parseInt(user.id, 10),
      ])

      return { success: true }
    } catch (error) {
      console.error('Change password error:', error)
      return { success: false, error: 'Failed to change password' }
    }
  }

  // -------------------------------------------------------------------------
  // Password recovery (single-use recovery codes)
  // -------------------------------------------------------------------------

  async getRecoveryCodesStatus(): Promise<RecoveryCodesStatus> {
    const user = this.getCurrentUser()
    if (!user) {
      return { generated: false, unusedCount: 0, lastGeneratedAt: null }
    }

    if (!isDesktop) {
      return requestApiJson<RecoveryCodesStatus>('/api/auth/recovery-codes', {
        requireAuth: true,
      })
    }

    await ensureLocalRecoveryCodesTable()

    const rows = await query<{ total_count: number; unused_count: number; last_generated_at: string | null }>(
      `SELECT COUNT(*) AS total_count,
              SUM(CASE WHEN used_at IS NULL THEN 1 ELSE 0 END) AS unused_count,
              MAX(created_at) AS last_generated_at
       FROM password_recovery_codes WHERE user_id = ?`,
      [parseInt(user.id, 10)],
    )

    const row = rows[0]
    return {
      generated: Number(row?.total_count ?? 0) > 0,
      unusedCount: Number(row?.unused_count ?? 0),
      lastGeneratedAt: row?.last_generated_at ?? null,
    }
  }

  async generateRecoveryCodes(
    currentPassword: string,
  ): Promise<{ success: boolean; codes?: string[]; error?: string }> {
    const user = this.getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    if (!currentPassword) {
      return { success: false, error: 'Current password is required' }
    }

    if (!isDesktop) {
      try {
        const data = await requestApiJson<{ codes: string[] }>('/api/auth/recovery-codes', {
          method: 'POST',
          requireAuth: true,
          body: { currentPassword },
        })
        return { success: true, codes: data.codes }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to generate recovery codes' }
      }
    }

    // Desktop mode: operate on the local database directly.
    try {
      await ensureLocalRecoveryCodesTable()
      const users = await query<DatabaseUser>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1', [
        parseInt(user.id, 10),
      ])

      if (users.length === 0) {
        return { success: false, error: 'User not found' }
      }

      const dbUser = users[0]
      const isHashed = dbUser.password_hashed === 1
      const passwordValid = isHashed
        ? await verifyPassword(currentPassword, dbUser.password)
        : dbUser.password === currentPassword

      if (!passwordValid) {
        return { success: false, error: 'Current password is incorrect' }
      }

      const codes = generateRecoveryCodes(RECOVERY_CODE_COUNT)
      const now = new Date().toISOString()

      // Generating new codes invalidates every previous code.
      await execute('DELETE FROM password_recovery_codes WHERE user_id = ?', [parseInt(user.id, 10)])
      for (const code of codes) {
        await execute('INSERT INTO password_recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)', [
          parseInt(user.id, 10),
          await hashRecoveryCode(code),
          now,
        ])
      }

      return { success: true, codes }
    } catch (error) {
      console.error('Generate recovery codes error:', error)
      return { success: false, error: 'Failed to generate recovery codes' }
    }
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    if (isDesktop) {
      return { success: false, error: 'Password reset links are available in the web version only' }
    }

    if (!email.trim()) {
      return { success: false, error: 'A valid email is required' }
    }

    try {
      await requestApiJson<{ success: boolean }>('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim().toLowerCase() },
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to request password reset' }
    }
  }

  async resetPasswordWithToken(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const strengthError = validatePasswordStrength(newPassword)
    if (strengthError) {
      return { success: false, error: strengthError }
    }

    if (isDesktop) {
      return { success: false, error: 'Password reset links are available in the web version only' }
    }

    try {
      await requestApiJson<{ success: boolean }>('/api/auth/reset-password-token', {
        method: 'POST',
        body: { token, newPassword },
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to reset password' }
    }
  }

  async resetPasswordWithRecoveryCode(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<{ success: boolean; error?: string }> {
    const strengthError = validatePasswordStrength(newPassword)
    if (strengthError) {
      return { success: false, error: strengthError }
    }

    if (!isDesktop) {
      try {
        await requestApiJson<{ success: boolean }>('/api/auth/reset-password', {
          method: 'POST',
          body: { email: email.toLowerCase(), code, newPassword },
        })
        return { success: true }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to reset password' }
      }
    }

    // Desktop mode: operate on the local database directly.
    try {
      await ensureLocalRecoveryCodesTable()
      const users = await query<DatabaseUser>('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1', [
        email.toLowerCase(),
      ])

      if (users.length === 0) {
        return { success: false, error: 'Invalid email or recovery code' }
      }

      const userId = users[0].id
      const codeHash = await hashRecoveryCode(code)

      const codeRows = await query<{ id: number }>(
        'SELECT id FROM password_recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL LIMIT 1',
        [userId, codeHash],
      )

      if (codeRows.length === 0) {
        return { success: false, error: 'Invalid email or recovery code' }
      }

      // Mark the code as used first (single-use guard, safe under concurrency).
      const markUsed = await execute(
        'UPDATE password_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL',
        [new Date().toISOString(), codeRows[0].id],
      )

      if (markUsed.rowsAffected !== 1) {
        return { success: false, error: 'Invalid email or recovery code' }
      }

      const hashedPassword = await hashPassword(newPassword)
      await execute('UPDATE users SET password = ?, password_hashed = 1, updated_at = ? WHERE id = ?', [
        hashedPassword,
        new Date().toISOString(),
        userId,
      ])

      return { success: true }
    } catch (error) {
      console.error('Reset password with recovery code error:', error)
      return { success: false, error: 'Failed to reset password' }
    }
  }

  async createUser(
    userData: Omit<User, 'id' | 'createdAt' | 'permissions'> & {
      password: string
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

      const result = await execute(
        'INSERT INTO users (email, password, name, role, permissions, created_at, password_hashed) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          userData.email.toLowerCase(),
          hashedPassword,
          userData.name,
          userData.role,
          permissions,
          new Date().toISOString(),
          1,
        ],
      )

      const newUser: User = {
        id: result.lastInsertId.toString(),
        email: userData.email,
        name: userData.name,
        role: userData.role,
        permissions: [...DEFAULT_PERMISSIONS[userData.role]],
        createdAt: new Date().toISOString(),
      }

      return { success: true, user: newUser }
    } catch (error) {
      console.error('Create user error:', error)
      return { success: false, error: 'Failed to create user' }
    }
  }

  async updateUser(
    userId: string,
    updates: Partial<Omit<User, 'id' | 'createdAt'> & { password?: string }>,
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

      if (updateFields.length > 0) {
        updateValues.push(parseInt(userId, 10))

        await execute(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`, updateValues)
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
      // Soft delete by setting deleted_at timestamp
      const result = await execute('UPDATE users SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [
        new Date().toISOString(),
        parseInt(userId, 10),
      ])

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
      // Restore by setting deleted_at to NULL
      const result = await execute('UPDATE users SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL', [
        parseInt(userId, 10),
      ])

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
