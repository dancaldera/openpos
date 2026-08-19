import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptSecret, hashResetToken } from '../lib/password-reset-email'
import {
  generateRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from '../lib/password-recovery'

const { execute, query } = vi.hoisted(() => ({
  execute: vi.fn(
    async (_sql: string, _params?: unknown[]): Promise<{ lastInsertId: number; rowsAffected: number }> => ({
      lastInsertId: 1,
      rowsAffected: 1,
    }),
  ),
  query: vi.fn(async (_sql: string, _params?: unknown[]): Promise<Array<Record<string, unknown>>> => []),
}))

vi.mock('../middleware/auth.js', () => ({
  signToken: vi.fn(() => 'test-token'),
  authMiddleware: async (c: unknown, next: () => Promise<void>) => {
    // biome-ignore lint/suspicious/noExplicitAny: test doubles Hono context
    ;(c as any).set('jwtPayload', {
      sub: '1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
      permissions: ['*'],
    })
    await next()
  },
}))

vi.mock('../lib/turso.js', () => ({
  execute,
  query,
}))

process.env.JWT_SECRET = 'password-recovery-test-secret'

const resendFetch = vi.fn()
vi.stubGlobal('fetch', resendFetch)

const { authRouter } = await import('./auth')

function createApp() {
  const app = new Hono()
  app.route('/api/auth', authRouter)
  return app
}

const CODE = 'ABCDE-FGHJK-LMNPQ'

beforeEach(() => {
  resendFetch.mockReset()
  resendFetch.mockResolvedValue({ ok: true, status: 200 })
})

function sha256OfNormalized(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')
}

describe('password-recovery helpers', () => {
  it('normalizes codes regardless of case and separators', () => {
    expect(normalizeRecoveryCode('abcde-fghjk-lmnpq')).toBe('ABCDEFGHJKLMNPQ')
    expect(normalizeRecoveryCode(' abcde fghjk  lmnpq ')).toBe('ABCDEFGHJKLMNPQ')
  })

  it('hashes the normalized code with SHA-256', () => {
    expect(hashRecoveryCode('abcde-fghjk-lmnpq')).toBe(sha256OfNormalized(CODE))
  })

  it('generates unambiguous codes in the expected format', () => {
    const generated = new Set(generateRecoveryCodes(50))
    expect(generated.size).toBe(50)
    for (const code of generated) {
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/)
    }
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode())
  })
})

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 })
  })

  it('rejects missing fields', async () => {
    const response = await createApp().request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com' }),
    })

    expect(response.status).toBe(400)
  })

  it('rejects weak passwords', async () => {
    const response = await createApp().request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', code: CODE, newPassword: 'weak' }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Password must be at least 8 characters' })
  })

  it('returns a generic error for unknown emails', async () => {
    query.mockResolvedValue([])

    const response = await createApp().request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ghost@example.com', code: CODE, newPassword: 'NewPass1!' }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Invalid email or recovery code' })
  })

  it('rejects invalid or already used codes', async () => {
    query
      .mockResolvedValueOnce([{ id: 1 }]) // user lookup
      .mockResolvedValueOnce([]) // code lookup

    const response = await createApp().request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', code: 'WRONG-CODE', newPassword: 'NewPass1!' }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Invalid email or recovery code' })
  })

  it('resets the password with a valid unused code', async () => {
    query
      .mockResolvedValueOnce([{ id: 7 }]) // user lookup
      .mockResolvedValueOnce([{ id: 42 }]) // code lookup (hash of normalized code)

    const response = await createApp().request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
        code: 'abcde-fghjk-lmnpq', // lower-case, different separators
        newPassword: 'NewPass1!',
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })

    // The code must be looked up by the hash of its normalized form.
    const codeLookup = query.mock.calls[1]
    expect(codeLookup?.[1]).toEqual([7, sha256OfNormalized(CODE)])

    // The code is marked used before the password is updated.
    const [markUsedSql, markUsedParams] = execute.mock.calls[0]
    expect(markUsedSql).toContain('UPDATE password_recovery_codes SET used_at')
    expect(markUsedParams).toEqual([expect.any(String), 42])

    const [updateUserSql, updateUserParams] = execute.mock.calls[1]
    expect(updateUserSql).toContain('UPDATE users SET password')
    expect(updateUserParams?.[1]).toEqual(expect.any(String))
    expect(updateUserParams?.[2]).toBe(7)
    await expect(bcrypt.compare('NewPass1!', updateUserParams?.[0] as string)).resolves.toBe(true)
  })

  it('fails safely when the code was consumed concurrently', async () => {
    query.mockResolvedValueOnce([{ id: 7 }]).mockResolvedValueOnce([{ id: 42 }])
    execute.mockResolvedValue({ lastInsertId: 0, rowsAffected: 0 })

    const response = await createApp().request('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', code: CODE, newPassword: 'NewPass1!' }),
    })

    expect(response.status).toBe(401)
    // Password was never touched.
    expect(execute.mock.calls.filter(([sql]) => sql.includes('UPDATE users'))).toHaveLength(0)
  })
})

describe('POST /api/auth/recovery-codes', () => {
  beforeEach(() => {
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 })
  })

  it('requires the current password', async () => {
    const response = await createApp().request('/api/auth/recovery-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)
  })

  it('rejects an incorrect current password', async () => {
    query.mockResolvedValue([
      {
        id: 1,
        email: 'admin@example.com',
        password: await bcrypt.hash('Password1!', 4),
        name: 'Admin',
        role: 'admin',
        permissions: '["*"]',
        created_at: '2024-01-01T00:00:00.000Z',
        password_hashed: 1,
      },
    ])

    const response = await createApp().request('/api/auth/recovery-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'WrongPass1!' }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Current password is incorrect' })
  })

  it('generates single-use codes and invalidates previous ones', async () => {
    query.mockResolvedValue([
      {
        id: 1,
        email: 'admin@example.com',
        password: await bcrypt.hash('Password1!', 4),
        name: 'Admin',
        role: 'admin',
        permissions: '["*"]',
        created_at: '2024-01-01T00:00:00.000Z',
        password_hashed: 1,
      },
    ])

    const response = await createApp().request('/api/auth/recovery-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'Password1!' }),
    })

    expect(response.status).toBe(200)
    const { codes } = (await response.json()) as { codes: string[] }
    expect(codes).toHaveLength(8)

    // Old codes are deleted first, then the new hashes are inserted.
    const [deleteSql, deleteParams] = execute.mock.calls[0]
    expect(deleteSql).toContain('DELETE FROM password_recovery_codes')
    expect(deleteParams).toEqual([1])

    const inserts = execute.mock.calls.slice(1)
    expect(inserts).toHaveLength(8)

    // Every returned code is stored as the SHA-256 hash of its normalized form.
    const storedHashes = new Set(inserts.map(([, params]) => (params as unknown[])[1]))
    for (const code of codes) {
      expect(storedHashes.has(hashRecoveryCode(code))).toBe(true)
    }
  })

  it('supports legacy plain-text passwords', async () => {
    query.mockResolvedValue([
      {
        id: 1,
        email: 'admin@example.com',
        password: 'Password1!',
        name: 'Admin',
        role: 'admin',
        permissions: '["*"]',
        created_at: '2024-01-01T00:00:00.000Z',
        password_hashed: 0,
      },
    ])

    const response = await createApp().request('/api/auth/recovery-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'Password1!' }),
    })

    expect(response.status).toBe(200)
  })
})

describe('GET /api/auth/recovery-codes', () => {
  beforeEach(() => {
    execute.mockReset()
    query.mockReset()
  })

  it('returns the recovery code status without exposing codes', async () => {
    query.mockResolvedValue([{ total_count: 8, unused_count: 5, last_generated_at: '2025-01-01T00:00:00.000Z' }])

    const response = await createApp().request('/api/auth/recovery-codes')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      generated: true,
      unusedCount: 5,
      lastGeneratedAt: '2025-01-01T00:00:00.000Z',
    })
  })
})

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 })
  })

  it('requires a valid email', async () => {
    const response = await createApp().request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    })

    expect(response.status).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('reports when email delivery is not configured', async () => {
    query.mockResolvedValue([])

    const response = await createApp().request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com' }),
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Password reset email is not configured' })
  })

  it('does not reveal whether an unknown email exists', async () => {
    query
      .mockResolvedValueOnce([
        {
          resend_api_key_encrypted: encryptSecret('re_test_key'),
          from_email: 'no-reply@example.com',
          web_app_url: 'https://pos.example.com',
        },
      ])
      .mockResolvedValueOnce([])

    const response = await createApp().request('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'unknown@example.com' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(resendFetch).not.toHaveBeenCalled()
  })

  it('creates a token and sends a Resend reset link', async () => {
    query
      .mockResolvedValueOnce([
        {
          resend_api_key_encrypted: encryptSecret('re_test_key'),
          from_email: 'no-reply@example.com',
          web_app_url: 'https://pos.example.com',
        },
      ])
      .mockResolvedValueOnce([{ id: 7 }])

    const response = await createApp().request('/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://pos.example.com',
      },
      body: JSON.stringify({ email: 'ADMIN@example.com' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(resendFetch).toHaveBeenCalledTimes(1)

    const [url, options] = resendFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(options.headers).toEqual({
      Authorization: 'Bearer re_test_key',
      'Content-Type': 'application/json',
    })

    const payload = JSON.parse(options.body as string) as { to: string[]; html: string; text: string }
    expect(payload.to).toEqual(['admin@example.com'])
    expect(payload.html).toContain('https://pos.example.com/reset-password?token=')
    expect(payload.text).toContain('https://pos.example.com/reset-password?token=')

    const sentUrl = payload.text.match(/https:\/\/pos\.example\.com\/reset-password\?token=\S+/)?.[0]
    expect(sentUrl).toBeTruthy()
    const token = new URL(sentUrl as string).searchParams.get('token')
    expect(token).toBeTruthy()
    expect(execute.mock.calls[1]?.[1]).toContain(hashResetToken(token as string))
  })
})

describe('POST /api/auth/reset-password-token', () => {
  beforeEach(() => {
    execute.mockReset()
    query.mockReset()
    execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 })
  })

  it('rejects missing or invalid tokens', async () => {
    query.mockResolvedValue([])

    const response = await createApp().request('/api/auth/reset-password-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'expired-token', newPassword: 'NewPass1!' }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Invalid or expired password reset link' })
  })

  it('resets the password and consumes the token once', async () => {
    query.mockResolvedValueOnce([{ id: 44, user_id: 7 }])

    const response = await createApp().request('/api/auth/reset-password-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'valid-token', newPassword: 'NewPass1!' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(query.mock.calls[0]?.[1]?.[0]).toBe(hashResetToken('valid-token'))
    expect(execute.mock.calls[0]?.[1]).toEqual([expect.any(String), 44])
    expect(execute.mock.calls[1]?.[1]?.[2]).toBe(7)
    await expect(bcrypt.compare('NewPass1!', execute.mock.calls[1]?.[1]?.[0] as string)).resolves.toBe(true)
  })
})
