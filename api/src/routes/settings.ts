/**
 * Settings routes (protected)
 *
 * GET /api/settings     — get company settings
 * PUT /api/settings     — update company settings
 */

import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.js'
import { execute, query } from '../lib/turso.js'

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

export const settingsRouter = new Hono()

settingsRouter.use('/*', authMiddleware)

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
