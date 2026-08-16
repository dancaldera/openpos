/**
 * Auth routes
 *
 * POST /api/auth/login     — verify credentials, return JWT
 * POST /api/auth/hash      — bcrypt hash a password (replaces Rust invoke on web)
 * POST /api/auth/verify    — bcrypt verify a password (replaces Rust invoke on web)
 * GET  /api/auth/me        — return the current user from JWT (protected)
 */

import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { query } from '../lib/turso.js'
import { authMiddleware, signToken, type JwtPayload } from '../middleware/auth.js'

const BCRYPT_ROUNDS = 12

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

// ---------------------------------------------------------------------------
export const authRouter = new Hono()

// ---------------------------------------------------------------------------
// GET /api/auth/users  (public - for login screen user list)
// ---------------------------------------------------------------------------
authRouter.get('/users', async (c) => {
  // Public endpoint - no auth required
  // Returns only safe fields: id, name, email, role (no passwords, no sensitive data)
  const users = await query<DatabaseUser>(
    'SELECT id, email, name, role FROM users WHERE deleted_at IS NULL ORDER BY name ASC',
  )

  // Convert to frontend format
  const safeUsers = users.map(user => ({
    id: user.id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
  }))

  return c.json({ users: safeUsers })
})

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
authRouter.post('/login', async (c) => {
  let body: { email?: string; password?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { email, password } = body
  if (!email || !password) {
    return c.json({ error: 'email and password are required' }, 400)
  }

  const users = await query<DatabaseUser>(
    'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
    [email.toLowerCase()],
  )

  if (users.length === 0) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  const dbUser = users[0]
  const isHashed = dbUser.password_hashed === 1

  let passwordValid: boolean
  if (isHashed) {
    passwordValid = await bcrypt.compare(password, dbUser.password)
  } else {
    // Plain-text fallback (legacy users)
    passwordValid = dbUser.password === password
    if (passwordValid) {
      // Lazy-migrate to bcrypt
      const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS)
      await query('UPDATE users SET password = ?, password_hashed = 1 WHERE id = ?', [hashed, dbUser.id])
    }
  }

  if (!passwordValid) {
    return c.json({ error: 'Invalid email or password' }, 401)
  }

  // Update last_login
  await query('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), dbUser.id])

  const permissions: string[] = JSON.parse(dbUser.permissions)

  const tokenPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: dbUser.id.toString(),
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    permissions,
  }

  const token = signToken(tokenPayload)

  return c.json({
    token,
    user: {
      id: dbUser.id.toString(),
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      permissions,
      createdAt: dbUser.created_at,
      lastLogin: dbUser.last_login,
    },
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/hash  (internal — replaces Rust invoke in web context)
// ---------------------------------------------------------------------------
authRouter.post('/hash', async (c) => {
  let body: { password?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (!body.password) {
    return c.json({ error: 'password is required' }, 400)
  }

  const hash = await bcrypt.hash(body.password, BCRYPT_ROUNDS)
  return c.json({ hash })
})

// ---------------------------------------------------------------------------
// POST /api/auth/verify  (internal — replaces Rust invoke in web context)
// ---------------------------------------------------------------------------
authRouter.post('/verify', async (c) => {
  let body: { password?: string; hash?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (!body.password || !body.hash) {
    return c.json({ error: 'password and hash are required' }, 400)
  }

  const valid = await bcrypt.compare(body.password, body.hash)
  return c.json({ valid })
})

// ---------------------------------------------------------------------------
// GET /api/auth/me  (protected)
// ---------------------------------------------------------------------------
authRouter.get('/me', authMiddleware, (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const payload = (c as any).get('jwtPayload') as JwtPayload
  return c.json({ user: payload })
})
