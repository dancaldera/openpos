import Database from '@tauri-apps/plugin-sql'

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
}

export class AuthService {
  private static instance: AuthService
  private currentUser: User | null = null
  private db: Database | null = null

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService()
    }
    return AuthService.instance
  }

  private async getDatabase(): Promise<Database> {
    if (!this.db) {
      try {
        this.db = await Database.load('sqlite:postpos.db')
      } catch (error) {
        console.error('Database initialization error:', error)
        throw new Error('Failed to connect to database')
      }
    }
    return this.db
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

  async signIn(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const db = await this.getDatabase()

      const users = await db.select<DatabaseUser[]>(
        'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
        [email.toLowerCase()],
      )

      if (users.length === 0) {
        return {
          success: false,
          error: 'Invalid email or password',
        }
      }

      const dbUser = users[0]

      if (dbUser.password !== password) {
        return {
          success: false,
          error: 'Invalid email or password',
        }
      }

      const user = this.convertDbUser(dbUser)

      await db.execute('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), dbUser.id])

      this.currentUser = user
      localStorage.setItem('pos_user', JSON.stringify(user))

      return {
        success: true,
        user,
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
    localStorage.removeItem('pos_user')
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
      const db = await this.getDatabase()
      const users = await db.select<DatabaseUser[]>('SELECT * FROM users ORDER BY created_at DESC')

      return users.map((user) => this.convertDbUser(user))
    } catch (error) {
      console.error('Get users error:', error)
      throw new Error('Failed to fetch users')
    }
  }

  async getAllUsersForLogin(): Promise<User[]> {
    // Public method for login page - no authentication required
    // Only return active users (not deleted)
    try {
      const db = await this.getDatabase()
      const users = await db.select<DatabaseUser[]>('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY name ASC')

      return users.map((user) => this.convertDbUser(user))
    } catch (error) {
      console.error('Get users for login error:', error)
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
      const db = await this.getDatabase()
      const offset = (page - 1) * limit

      // Get total count (active users only)
      const countResult = await db.select<{ count: number }[]>(
        'SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL',
      )
      const totalCount = countResult[0]?.count || 0
      const totalPages = Math.ceil(totalCount / limit)

      // Get paginated users (active users only)
      const users = await db.select<DatabaseUser[]>(
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

    if (!/^\d{6}$/.test(newPassword)) {
      return {
        success: false,
        error: 'Password must be exactly 6 numbers',
      }
    }

    try {
      const db = await this.getDatabase()

      const users = await db.select<DatabaseUser[]>('SELECT password FROM users WHERE id = ? LIMIT 1', [
        parseInt(user.id, 10),
      ])

      if (users.length === 0) {
        return { success: false, error: 'User not found' }
      }

      if (users[0].password !== currentPassword) {
        return { success: false, error: 'Current password is incorrect' }
      }

      await db.execute('UPDATE users SET password = ? WHERE id = ?', [newPassword, parseInt(user.id, 10)])

      return { success: true }
    } catch (error) {
      console.error('Change password error:', error)
      return { success: false, error: 'Failed to change password' }
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

    if (!/^\d{6}$/.test(userData.password)) {
      return {
        success: false,
        error: 'Password must be exactly 6 numbers',
      }
    }

    try {
      const db = await this.getDatabase()

      const existingUsers = await db.select<DatabaseUser[]>('SELECT id FROM users WHERE email = ? LIMIT 1', [
        userData.email.toLowerCase(),
      ])

      if (existingUsers.length > 0) {
        return { success: false, error: 'User with this email already exists' }
      }

      const permissions = JSON.stringify(DEFAULT_PERMISSIONS[userData.role])

      const result = await db.execute(
        'INSERT INTO users (email, password, name, role, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          userData.email.toLowerCase(),
          userData.password,
          userData.name,
          userData.role,
          permissions,
          new Date().toISOString(),
        ],
      )

      const newUser: User = {
        id: (result.lastInsertId ?? 0).toString(),
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
      const db = await this.getDatabase()

      const users = await db.select<DatabaseUser[]>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1', [
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
        const existingUsers = await db.select<DatabaseUser[]>(
          'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1',
          [updates.email.toLowerCase(), parseInt(userId, 10)],
        )

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
        if (!/^\d{6}$/.test(updates.password)) {
          return {
            success: false,
            error: 'Password must be exactly 6 numbers',
          }
        }
        updateFields.push('password = ?')
        updateValues.push(updates.password)
      }

      if (updateFields.length > 0) {
        updateValues.push(parseInt(userId, 10))

        await db.execute(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`, updateValues)
      }

      const updatedUsers = await db.select<DatabaseUser[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [
        parseInt(userId, 10),
      ])

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
      const db = await this.getDatabase()

      // Soft delete by setting deleted_at timestamp
      const result = await db.execute('UPDATE users SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [
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
      const db = await this.getDatabase()
      const users = await db.select<DatabaseUser[]>(
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
      const db = await this.getDatabase()

      // Restore by setting deleted_at to NULL
      const result = await db.execute('UPDATE users SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL', [
        parseInt(userId, 10),
      ])

      if (result.rowsAffected === 0) {
        return { success: false, error: 'Deleted user not found' }
      }

      // Get the restored user
      const users = await db.select<DatabaseUser[]>('SELECT * FROM users WHERE id = ? LIMIT 1', [parseInt(userId, 10)])

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
      const db = await this.getDatabase()

      // First verify user is already soft deleted
      const users = await db.select<DatabaseUser[]>(
        'SELECT * FROM users WHERE id = ? AND deleted_at IS NOT NULL LIMIT 1',
        [parseInt(userId, 10)],
      )

      if (users.length === 0) {
        return { success: false, error: 'User not found or not deleted' }
      }

      // Disable foreign key constraints temporarily
      await db.execute('PRAGMA foreign_keys = OFF')

      try {
        // Permanently delete the user
        const result = await db.execute('DELETE FROM users WHERE id = ?', [parseInt(userId, 10)])

        if (result.rowsAffected === 0) {
          await db.execute('PRAGMA foreign_keys = ON')
          return { success: false, error: 'User not found' }
        }

        // Set user_id to NULL in orders table for this deleted user
        await db.execute('UPDATE orders SET user_id = NULL WHERE user_id = ?', [parseInt(userId, 10)])

        await db.execute('PRAGMA foreign_keys = ON')
        return { success: true }
      } catch (innerError) {
        await db.execute('PRAGMA foreign_keys = ON')
        throw innerError
      }
    } catch (error) {
      console.error('Hard delete user error:', error)
      return { success: false, error: 'Failed to permanently delete user' }
    }
  }
}

export const authService = AuthService.getInstance()
