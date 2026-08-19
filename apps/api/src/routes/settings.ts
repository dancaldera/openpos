/**
 * Settings routes (protected)
 *
 * GET /api/settings                         — get company settings
 * PUT /api/settings                         — update company settings
 * GET /api/settings/password-reset          — get safe reset email configuration status
 * PUT /api/settings/password-reset          — save reset email configuration (admin)
 * DELETE /api/settings/password-reset       — clear reset email configuration (admin)
 */

import { Hono } from 'hono'
import { encryptSecret, isValidEmail, normalizeWebAppUrl } from '../lib/password-reset-email.js'
import { execute, query } from '../lib/turso.js'
import { authMiddleware, type JwtPayload } from '../middleware/auth.js'

interface DatabaseCompanySettings {
  id: number
  name: string
  app_name: string | null
  description: string | null
  tax_enabled: number
  tax_percentage: number
  currency_symbol: string
  language: string
  logo_url: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  receipt_footer: string | null
  created_at: string
  updated_at: string
}

interface DatabasePasswordResetSettings {
  id: number
  resend_api_key_encrypted: string | null
  from_email: string | null
  web_app_url: string | null
  created_at: string
  updated_at: string
}

export const settingsRouter = new Hono()

// ---------------------------------------------------------------------------
// GET /api/settings/public  (public - for pre-login UI initialization)
// ---------------------------------------------------------------------------
settingsRouter.get('/public', async (c) => {
  // Public endpoint - no auth required
  // Returns only display-safe fields: name, app_name, language, currency_symbol, logo_url
  const rows = await query<DatabaseCompanySettings>('SELECT name, app_name, language, currency_symbol, logo_url FROM company_settings LIMIT 1')
  if (rows.length === 0) return c.json({ error: 'Settings not found' }, 404)

  const s = rows[0]
  return c.json({
    name: s.name,
    appName: s.app_name,
    language: s.language,
    currencySymbol: s.currency_symbol,
    logoUrl: s.logo_url,
  })
})

settingsRouter.use('/*', authMiddleware)

// GET /api/settings/password-reset (admin only — never returns the API key)
settingsRouter.get('/password-reset', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const caller = (c as any).get('jwtPayload') as JwtPayload
  if (caller.role !== 'admin' && !caller.permissions.includes('*')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  const rows = await query<DatabasePasswordResetSettings>(
    'SELECT id, resend_api_key_encrypted, from_email, web_app_url, created_at, updated_at FROM password_reset_settings WHERE id = 1 LIMIT 1',
  )
  return c.json({ settings: toPasswordResetSettings(rows[0]) })
})

// PUT /api/settings/password-reset (admin only)
settingsRouter.put('/password-reset', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const caller = (c as any).get('jwtPayload') as JwtPayload
  if (caller.role !== 'admin' && !caller.permissions.includes('*')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  let body: { resendApiKey?: unknown; fromEmail?: unknown; webAppUrl?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (body.resendApiKey !== undefined && typeof body.resendApiKey !== 'string') {
    return c.json({ error: 'resendApiKey must be a string' }, 400)
  }
  if (body.fromEmail !== undefined && typeof body.fromEmail !== 'string') {
    return c.json({ error: 'fromEmail must be a string' }, 400)
  }
  if (body.webAppUrl !== undefined && typeof body.webAppUrl !== 'string') {
    return c.json({ error: 'webAppUrl must be a string' }, 400)
  }

  const existingRows = await query<DatabasePasswordResetSettings>(
    'SELECT * FROM password_reset_settings WHERE id = 1 LIMIT 1',
  )
  const existing = existingRows[0]
  const apiKey = body.resendApiKey?.trim() || ''
  const encryptedApiKey = apiKey ? encryptSecret(apiKey) : existing?.resend_api_key_encrypted || null
  const fromEmail = body.fromEmail === undefined ? existing?.from_email?.trim() || '' : body.fromEmail.trim()

  if (!encryptedApiKey) {
    return c.json({ error: 'Resend API key is required' }, 400)
  }
  if (!fromEmail || !isValidEmail(fromEmail)) {
    return c.json({ error: 'A valid from email is required' }, 400)
  }

  let webAppUrl: string | null = existing?.web_app_url || null
  if (body.webAppUrl !== undefined) {
    try {
      webAppUrl = normalizeWebAppUrl(body.webAppUrl)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Invalid web app URL' }, 400)
    }
    if (webAppUrl.length > 2048) {
      return c.json({ error: 'Web app URL is too long' }, 400)
    }
  }

  const now = new Date().toISOString()
  if (existing) {
    await execute(
      `UPDATE password_reset_settings
       SET resend_api_key_encrypted = ?, from_email = ?, web_app_url = ?, updated_at = ?
       WHERE id = 1`,
      [encryptedApiKey, fromEmail, webAppUrl, now],
    )
  } else {
    await execute(
      `INSERT INTO password_reset_settings
       (id, resend_api_key_encrypted, from_email, web_app_url, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?)`,
      [encryptedApiKey, fromEmail, webAppUrl, now, now],
    )
  }

  const rows = await query<DatabasePasswordResetSettings>(
    'SELECT * FROM password_reset_settings WHERE id = 1 LIMIT 1',
  )
  return c.json({ settings: toPasswordResetSettings(rows[0]) })
})

// DELETE /api/settings/password-reset (admin only)
settingsRouter.delete('/password-reset', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const caller = (c as any).get('jwtPayload') as JwtPayload
  if (caller.role !== 'admin' && !caller.permissions.includes('*')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  await execute('DELETE FROM password_reset_settings WHERE id = 1')
  return c.json({ success: true })
})

// GET /api/settings
settingsRouter.get('/', async (c) => {
  const rows = await query<DatabaseCompanySettings>('SELECT * FROM company_settings LIMIT 1')
  if (rows.length === 0) return c.json({ error: 'Settings not found' }, 404)
  return c.json({ settings: toSettings(rows[0]) })
})

// PUT /api/settings
settingsRouter.put('/', async (c) => {
  const body = await c.req.json<Partial<DatabaseCompanySettings>>()
  const now = new Date().toISOString()

  // Upsert: if no settings row exists yet, create one
  const existing = await query<{ id: number }>('SELECT id FROM company_settings LIMIT 1')

  if (existing.length === 0) {
    await execute(
      `INSERT INTO company_settings (name, app_name, description, tax_enabled, tax_percentage,
       currency_symbol, language, logo_url, address, phone, email, website, receipt_footer, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [body.name ?? 'My Store', body.app_name ?? null, body.description ?? null, body.tax_enabled ?? 0, body.tax_percentage ?? 0, body.currency_symbol ?? '$', body.language ?? 'en', body.logo_url ?? null, body.address ?? null, body.phone ?? null, body.email ?? null, body.website ?? null, body.receipt_footer ?? null, now, now],
    )
  } else {
    await execute(
      `UPDATE company_settings SET name = COALESCE(?, name), app_name = COALESCE(?, app_name),
       description = COALESCE(?, description), tax_enabled = COALESCE(?, tax_enabled),
       tax_percentage = COALESCE(?, tax_percentage), currency_symbol = COALESCE(?, currency_symbol),
       language = COALESCE(?, language), logo_url = COALESCE(?, logo_url), address = COALESCE(?, address),
       phone = COALESCE(?, phone), email = COALESCE(?, email), website = COALESCE(?, website),
       receipt_footer = COALESCE(?, receipt_footer), updated_at = ?
       WHERE id = ?`,
      [body.name ?? null, body.app_name ?? null, body.description ?? null, body.tax_enabled ?? null, body.tax_percentage ?? null, body.currency_symbol ?? null, body.language ?? null, body.logo_url ?? null, body.address ?? null, body.phone ?? null, body.email ?? null, body.website ?? null, body.receipt_footer ?? null, now, existing[0].id],
    )
  }

  const rows = await query<DatabaseCompanySettings>('SELECT * FROM company_settings LIMIT 1')
  return c.json({ settings: toSettings(rows[0]) })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toPasswordResetSettings(s?: DatabasePasswordResetSettings) {
  return {
    configured: Boolean(s?.resend_api_key_encrypted && s?.from_email),
    fromEmail: s?.from_email ?? null,
    webAppUrl: s?.web_app_url ?? null,
    updatedAt: s?.updated_at ?? null,
  }
}

function toSettings(s: DatabaseCompanySettings) {
  return {
    id: s.id.toString(),
    name: s.name,
    appName: s.app_name,
    description: s.description,
    taxEnabled: s.tax_enabled === 1,
    taxPercentage: s.tax_percentage,
    currencySymbol: s.currency_symbol,
    language: s.language,
    logoUrl: s.logo_url,
    address: s.address,
    phone: s.phone,
    email: s.email,
    website: s.website,
    receiptFooter: s.receipt_footer,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }
}
