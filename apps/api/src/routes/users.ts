/**
 * Users routes (protected — admin/manager only for most operations)
 *
 * GET    /api/users           — list users
 * GET    /api/users/:id       — get single user
 * POST   /api/users           — create user
 * PUT    /api/users/:id       — update user
 * DELETE /api/users/:id       — soft-delete user
 */

import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { authMiddleware, type JwtPayload } from '../middleware/auth.js'
import { execute, query } from '../lib/turso.js'

const BCRYPT_ROUNDS = 12

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'],
  manager: ['sales.view', 'sales.create', 'sales.edit', 'products.view', 'products.create', 'products.edit', 'products.delete', 'inventory.view', 'inventory.edit', 'reports.view', 'reports.export', 'users.view', 'users.create', 'users.edit', 'users.delete'],
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

export const usersRouter = new Hono()

usersRouter.use('/*', authMiddleware)

// GET /api/users
usersRouter.get('/', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const caller = (c as any).get('jwtPayload') as JwtPayload
  if (!caller.permissions.includes('*') && !caller.permissions.includes('users.view')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  const page = Math.max(1, Number(c.req.query('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '20')))
  const offset = (page - 1) * limit

  const [countResult, users] = await Promise.all([
    query<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL'),
    query<DatabaseUser>('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]),
  ])

  const totalCount = countResult[0]?.count ?? 0
  return c.json({ users: users.map(toUser), totalCount, page, totalPages: Math.ceil(totalCount / limit) })
})

// GET /api/users/:id
usersRouter.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const rows = await query<DatabaseUser>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1', [id])
  if (rows.length === 0) return c.json({ error: 'User not found' }, 404)
  return c.json({ user: toUser(rows[0]) })
})

// POST /api/users
usersRouter.post('/', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const caller = (c as any).get('jwtPayload') as JwtPayload
  if (!caller.permissions.includes('*') && !caller.permissions.includes('users.create')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  const body = await c.req.json<{ email: string; name: string; role: string; password: string }>()
  const existing = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [body.email.toLowerCase()])
  if (existing.length > 0) return c.json({ error: 'User with this email already exists' }, 409)

  const hashed = await bcrypt.hash(body.password, BCRYPT_ROUNDS)
  const permissions = JSON.stringify(DEFAULT_PERMISSIONS[body.role] ?? DEFAULT_PERMISSIONS.user)
  const now = new Date().toISOString()

  const result = await execute(
    'INSERT INTO users (email, password, name, role, permissions, created_at, password_hashed) VALUES (?, ?, ?, ?, ?, ?, 1)',
    [body.email.toLowerCase(), hashed, body.name, body.role, permissions, now],
  )

  const rows = await query<DatabaseUser>('SELECT * FROM users WHERE id = ? LIMIT 1', [result.lastInsertId])
  return c.json({ user: toUser(rows[0]) }, 201)
})

// PUT /api/users/:id
usersRouter.put('/:id', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const caller = (c as any).get('jwtPayload') as JwtPayload
  if (!caller.permissions.includes('*') && !caller.permissions.includes('users.edit')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  const id = Number(c.req.param('id'))
  const body = await c.req.json<Partial<{ name: string; email: string; role: string; password: string }>>()
  const now = new Date().toISOString()

  const fields: string[] = []
  const values: unknown[] = []

  if (body.name) { fields.push('name = ?'); values.push(body.name) }
  if (body.email) { fields.push('email = ?'); values.push(body.email.toLowerCase()) }
  if (body.role) {
    fields.push('role = ?', 'permissions = ?')
    values.push(body.role, JSON.stringify(DEFAULT_PERMISSIONS[body.role] ?? DEFAULT_PERMISSIONS.user))
  }
  if (body.password) {
    const hashed = await bcrypt.hash(body.password, BCRYPT_ROUNDS)
    fields.push('password = ?', 'password_hashed = 1')
    values.push(hashed)
  }

  if (fields.length > 0) {
    values.push(now, id)
    await execute(`UPDATE users SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`, values)
  }

  const rows = await query<DatabaseUser>('SELECT * FROM users WHERE id = ? LIMIT 1', [id])
  if (rows.length === 0) return c.json({ error: 'User not found' }, 404)
  return c.json({ user: toUser(rows[0]) })
})

// DELETE /api/users/:id (soft delete)
usersRouter.delete('/:id', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const caller = (c as any).get('jwtPayload') as JwtPayload
  if (!caller.permissions.includes('*') && !caller.permissions.includes('users.delete')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  const id = Number(c.req.param('id'))
  if (caller.sub === id.toString()) return c.json({ error: 'Cannot delete your own account' }, 400)

  const now = new Date().toISOString()
  const result = await execute('UPDATE users SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [now, id])
  if (result.rowsAffected === 0) return c.json({ error: 'User not found' }, 404)
  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toUser(u: DatabaseUser) {
  return {
    id: u.id.toString(),
    email: u.email,
    name: u.name,
    role: u.role,
    permissions: JSON.parse(u.permissions) as string[],
    createdAt: u.created_at,
    lastLogin: u.last_login,
  }
}
