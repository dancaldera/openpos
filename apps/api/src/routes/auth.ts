/**
 * Auth routes
 *
 * POST /api/auth/login            — verify credentials, return JWT
 * POST /api/auth/forgot-password  — send a password reset link (public)
 * POST /api/auth/hash             — bcrypt hash a password (replaces Rust invoke on web)
 * POST /api/auth/verify           — bcrypt verify a password (replaces Rust invoke on web)
 * GET  /api/auth/me               — return the current user from JWT (protected)
 * GET  /api/auth/recovery-codes   — recovery code status for the current user (protected)
 * POST /api/auth/recovery-codes   — regenerate recovery codes (protected + current password)
 * POST /api/auth/reset-password   — reset password with a recovery code (public)
 * POST /api/auth/reset-password-token — reset password with an emailed link (public)
 */

import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import {
  buildPasswordResetUrl,
  decryptSecret,
  generateResetToken,
  hashResetToken,
  isValidEmail,
  PASSWORD_RESET_REQUEST_COOLDOWN_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
  resolveWebAppUrl,
  sendPasswordResetEmail,
} from '../lib/password-reset-email.js'
import { execute, query } from '../lib/turso.js'
import { generateRecoveryCodes, hashRecoveryCode, validatePasswordStrength } from '../lib/password-recovery.js'
import { readCurrentConnectionMeta } from '../lib/connection.js'
import { authMiddleware, signToken, type JwtPayload } from '../middleware/auth.js'

const BCRYPT_ROUNDS = 12
const INVALID_RECOVERY_ERROR = 'Invalid email or recovery code'
const PASSWORD_RESET_EMAIL_NOT_CONFIGURED = 'Password reset email is not configured'

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

interface DatabasePasswordResetSettings {
  resend_api_key_encrypted: string | null
  from_email: string | null
  web_app_url: string | null
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
  const connection = await readCurrentConnectionMeta()

  const tokenPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: dbUser.id.toString(),
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    permissions,
    ...(connection ? { connectionKey: connection.key } : {}),
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
// POST /api/auth/forgot-password  (public — send a reset link)
// ---------------------------------------------------------------------------
authRouter.post('/forgot-password', async (c) => {
  let body: { email?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const email = body.email?.trim().toLowerCase() || ''
  if (!email || !isValidEmail(email)) {
    return c.json({ error: 'A valid email is required' }, 400)
  }

  const settings = await query<DatabasePasswordResetSettings>(
    'SELECT resend_api_key_encrypted, from_email, web_app_url FROM password_reset_settings WHERE id = 1 LIMIT 1',
  )
  const passwordResetSettings = settings[0]
  if (!passwordResetSettings?.resend_api_key_encrypted || !passwordResetSettings.from_email) {
    return c.json({ error: PASSWORD_RESET_EMAIL_NOT_CONFIGURED }, 503)
  }

  let apiKey: string
  try {
    apiKey = decryptSecret(passwordResetSettings.resend_api_key_encrypted)
  } catch (error) {
    console.error('[Auth] Unable to decrypt password reset email configuration:', error)
    return c.json({ error: PASSWORD_RESET_EMAIL_NOT_CONFIGURED }, 503)
  }

  let webAppUrl: string
  try {
    webAppUrl = resolveWebAppUrl(passwordResetSettings.web_app_url, c.req.header('Origin'))
  } catch (error) {
    console.error('[Auth] Unable to resolve password reset web URL:', error)
    return c.json({ error: 'Password reset web app URL is not configured' }, 503)
  }

  const users = await query<{ id: number }>(
    'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
    [email],
  )

  // Always return the same response for unknown accounts.
  if (users.length === 0) {
    return c.json({ success: true })
  }

  const now = new Date()
  const recentRequests = await query<{ id: number }>(
    'SELECT id FROM password_reset_tokens WHERE user_id = ? AND created_at > ? LIMIT 1',
    [users[0].id, new Date(now.getTime() - PASSWORD_RESET_REQUEST_COOLDOWN_MS).toISOString()],
  )
  if (recentRequests.length > 0) {
    return c.json({ success: true })
  }

  const token = generateResetToken()
  const tokenHash = hashResetToken(token)
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString()

  // Only the most recently requested link remains valid.
  await execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [users[0].id])
  await execute(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
    [users[0].id, tokenHash, expiresAt, now.toISOString()],
  )

  try {
    await sendPasswordResetEmail(
      apiKey,
      passwordResetSettings.from_email,
      email,
      buildPasswordResetUrl(webAppUrl, token),
    )
  } catch (error) {
    console.error('[Auth] Password reset email delivery failed:', error instanceof Error ? error.message : error)
    // Do not leave a token that could become valid if delivery failed.
    await execute('DELETE FROM password_reset_tokens WHERE token_hash = ?', [tokenHash]).catch(() => undefined)
  }

  // Do not reveal whether a matching account exists or whether delivery succeeded.
  return c.json({ success: true })
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

// ---------------------------------------------------------------------------
// GET /api/auth/recovery-codes  (protected — status only, never returns codes)
// ---------------------------------------------------------------------------
authRouter.get('/recovery-codes', authMiddleware, async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const payload = (c as any).get('jwtPayload') as JwtPayload
  const userId = Number(payload.sub)

  const rows = await query<{ total_count: number; unused_count: number; last_generated_at: string | null }>(
    `SELECT COUNT(*) AS total_count,
            SUM(CASE WHEN used_at IS NULL THEN 1 ELSE 0 END) AS unused_count,
            MAX(created_at) AS last_generated_at
     FROM password_recovery_codes WHERE user_id = ?`,
    [userId],
  )

  const row = rows[0]
  return c.json({
    generated: Number(row?.total_count ?? 0) > 0,
    unusedCount: Number(row?.unused_count ?? 0),
    lastGeneratedAt: row?.last_generated_at ?? null,
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/recovery-codes  (protected — regenerate, requires current password)
// ---------------------------------------------------------------------------
authRouter.post('/recovery-codes', authMiddleware, async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const payload = (c as any).get('jwtPayload') as JwtPayload
  const userId = Number(payload.sub)

  let body: { currentPassword?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (!body.currentPassword) {
    return c.json({ error: 'currentPassword is required' }, 400)
  }

  const users = await query<DatabaseUser>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1', [userId])
  if (users.length === 0) {
    return c.json({ error: 'User not found' }, 404)
  }

  const dbUser = users[0]
  const isHashed = dbUser.password_hashed === 1
  const passwordValid = isHashed
    ? await bcrypt.compare(body.currentPassword, dbUser.password)
    : dbUser.password === body.currentPassword

  if (!passwordValid) {
    return c.json({ error: 'Current password is incorrect' }, 403)
  }

  // Generating new codes invalidates every previous code.
  const codes = generateRecoveryCodes()
  const now = new Date().toISOString()

  await execute('DELETE FROM password_recovery_codes WHERE user_id = ?', [userId])
  for (const code of codes) {
    await execute('INSERT INTO password_recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)', [
      userId,
      hashRecoveryCode(code),
      now,
    ])
  }

  // Codes are returned as plain text exactly once.
  return c.json({ codes })
})

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password  (public — recover with a single-use code)
// ---------------------------------------------------------------------------
authRouter.post('/reset-password', async (c) => {
  let body: { email?: string; code?: string; newPassword?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { email, code, newPassword } = body
  if (!email || !code || !newPassword) {
    return c.json({ error: 'email, code and newPassword are required' }, 400)
  }

  const strengthError = validatePasswordStrength(newPassword)
  if (strengthError) {
    return c.json({ error: strengthError }, 400)
  }

  const users = await query<{ id: number }>('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1', [
    email.toLowerCase(),
  ])
  if (users.length === 0) {
    // Generic error — do not reveal whether the account exists.
    return c.json({ error: INVALID_RECOVERY_ERROR }, 401)
  }
  const userId = users[0].id

  const codeRows = await query<{ id: number }>(
    'SELECT id FROM password_recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL LIMIT 1',
    [userId, hashRecoveryCode(code)],
  )
  if (codeRows.length === 0) {
    return c.json({ error: INVALID_RECOVERY_ERROR }, 401)
  }

  // Mark the code as used first (single-use guard, safe under concurrency).
  const markUsed = await execute('UPDATE password_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL', [
    new Date().toISOString(),
    codeRows[0].id,
  ])
  if (markUsed.rowsAffected !== 1) {
    return c.json({ error: INVALID_RECOVERY_ERROR }, 401)
  }

  const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await execute('UPDATE users SET password = ?, password_hashed = 1, updated_at = ? WHERE id = ?', [
    hashed,
    new Date().toISOString(),
    userId,
  ])

  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password-token  (public — reset with an emailed link)
// ---------------------------------------------------------------------------
authRouter.post('/reset-password-token', async (c) => {
  let body: { token?: string; newPassword?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { token, newPassword } = body
  if (!token || !newPassword) {
    return c.json({ error: 'token and newPassword are required' }, 400)
  }

  const strengthError = validatePasswordStrength(newPassword)
  if (strengthError) {
    return c.json({ error: strengthError }, 400)
  }

  const rows = await query<{ id: number; user_id: number }>(
    `SELECT password_reset_tokens.id, password_reset_tokens.user_id
     FROM password_reset_tokens
     INNER JOIN users ON users.id = password_reset_tokens.user_id
     WHERE password_reset_tokens.token_hash = ?
       AND password_reset_tokens.used_at IS NULL
       AND password_reset_tokens.expires_at > ?
       AND users.deleted_at IS NULL
     LIMIT 1`,
    [hashResetToken(token), new Date().toISOString()],
  )

  if (rows.length === 0) {
    return c.json({ error: 'Invalid or expired password reset link' }, 401)
  }

  const markUsed = await execute(
    'UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL',
    [new Date().toISOString(), rows[0].id],
  )
  if (markUsed.rowsAffected !== 1) {
    return c.json({ error: 'Invalid or expired password reset link' }, 401)
  }

  const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await execute('UPDATE users SET password = ?, password_hashed = 1, updated_at = ? WHERE id = ?', [
    hashed,
    new Date().toISOString(),
    rows[0].user_id,
  ])

  return c.json({ success: true })
})
