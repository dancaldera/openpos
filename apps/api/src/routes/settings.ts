/**
 * Settings routes (protected)
 *
 * GET /api/settings                         — get company settings
 * PUT /api/settings                         — update company settings
 * GET /api/settings/password-reset          — get safe reset email configuration status
 * PUT /api/settings/password-reset          — save reset email configuration (admin)
 * DELETE /api/settings/password-reset       — clear reset email configuration (admin)
 * GET /api/settings/object-storage          — get safe object storage configuration status
 * PUT /api/settings/object-storage          — save object storage configuration (admin)
 * DELETE /api/settings/object-storage       — clear object storage configuration (admin)
 * GET /api/settings/database                — get safe database configuration status
 * PUT /api/settings/database                — save database URL/token and Turso platform credentials (admin)
 * DELETE /api/settings/database             — clear database configuration (admin)
 */

import { Hono } from 'hono'
import { applyRemoteToConnection, parsePlatformConfig } from '../lib/connection.js'
import { DEFAULT_SIGNED_URL_TTL_SECONDS } from '../lib/object-storage.js'
import { decryptSecret, encryptSecret, isValidEmail, normalizeWebAppUrl } from '../lib/password-reset-email.js'
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

interface DatabaseObjectStorageSettings {
  id: number
  endpoint: string | null
  region: string | null
  bucket: string | null
  access_key_id_encrypted: string | null
  secret_access_key_encrypted: string | null
  url_ttl_seconds: number | null
  created_at: string
  updated_at: string
}

interface DatabaseConnectionSettings {
  id: number
  database_url: string | null
  auth_token_encrypted: string | null
  api_token_encrypted: string | null
  org: string | null
  group_name: string | null
  created_at: string
  updated_at: string
}

const MAX_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60

export const settingsRouter = new Hono()

// ---------------------------------------------------------------------------
// GET /api/settings/public  (public - for pre-login UI initialization)
// ---------------------------------------------------------------------------
settingsRouter.get('/public', async (c) => {
  // Public endpoint - no auth required
  // Returns only display-safe fields: name, app_name, language, currency_symbol, logo_url
  const rows = await query<DatabaseCompanySettings>(
    'SELECT name, app_name, language, currency_symbol, logo_url FROM company_settings LIMIT 1',
  )
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

  const rows = await query<DatabasePasswordResetSettings>('SELECT * FROM password_reset_settings WHERE id = 1 LIMIT 1')
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

// GET /api/settings/object-storage (admin only — never returns credentials)
settingsRouter.get('/object-storage', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const caller = (c as any).get('jwtPayload') as JwtPayload
  if (caller.role !== 'admin' && !caller.permissions.includes('*')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  const rows = await query<DatabaseObjectStorageSettings>(
    'SELECT id, endpoint, region, bucket, access_key_id_encrypted, secret_access_key_encrypted, url_ttl_seconds, created_at, updated_at FROM object_storage_settings WHERE id = 1 LIMIT 1',
  )
  return c.json({ settings: toObjectStorageSettings(rows[0]) })
})

// PUT /api/settings/object-storage (admin only)
settingsRouter.put('/object-storage', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const caller = (c as any).get('jwtPayload') as JwtPayload
  if (caller.role !== 'admin' && !caller.permissions.includes('*')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  let body: {
    endpoint?: unknown
    region?: unknown
    bucket?: unknown
    accessKeyId?: unknown
    secretAccessKey?: unknown
    urlTtlSeconds?: unknown
  }
  try {
    const parsedBody: unknown = await c.req.json()
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    body = parsedBody as typeof body
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  for (const [field, value] of Object.entries(body)) {
    if (value !== undefined && typeof value !== 'string' && field !== 'urlTtlSeconds') {
      return c.json({ error: `${field} must be a string` }, 400)
    }
  }
  if (
    body.urlTtlSeconds !== undefined &&
    (typeof body.urlTtlSeconds !== 'number' || !Number.isInteger(body.urlTtlSeconds))
  ) {
    return c.json({ error: 'urlTtlSeconds must be an integer' }, 400)
  }

  const existingRows = await query<DatabaseObjectStorageSettings>(
    'SELECT * FROM object_storage_settings WHERE id = 1 LIMIT 1',
  )
  const existing = existingRows[0]
  const endpointInput = trimSetting(body.endpoint)
  const endpointValue = body.endpoint === undefined ? existing?.endpoint?.trim() || '' : endpointInput
  const region = body.region === undefined ? existing?.region?.trim() || 'auto' : trimSetting(body.region) || 'auto'
  const bucket = body.bucket === undefined ? existing?.bucket?.trim() || '' : trimSetting(body.bucket)
  const accessKeyId = trimSetting(body.accessKeyId)
  const secretAccessKey = trimSetting(body.secretAccessKey)
  const encryptedAccessKeyId = accessKeyId ? encryptSecret(accessKeyId) : existing?.access_key_id_encrypted || null
  const encryptedSecretAccessKey = secretAccessKey
    ? encryptSecret(secretAccessKey)
    : existing?.secret_access_key_encrypted || null
  const urlTtlSeconds =
    body.urlTtlSeconds === undefined
      ? (existing?.url_ttl_seconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS)
      : body.urlTtlSeconds

  let endpoint: string
  try {
    endpoint = normalizeObjectStorageEndpoint(endpointValue)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Invalid S3 endpoint' }, 400)
  }

  if (!bucket) {
    return c.json({ error: 'S3 bucket is required' }, 400)
  }
  if (bucket.length > 255 || /\s/.test(bucket)) {
    return c.json({ error: 'S3 bucket is invalid' }, 400)
  }
  if (!region || region.length > 100 || /\s/.test(region)) {
    return c.json({ error: 'S3 region is invalid' }, 400)
  }
  if (
    typeof urlTtlSeconds !== 'number' ||
    !Number.isInteger(urlTtlSeconds) ||
    urlTtlSeconds < 1 ||
    urlTtlSeconds > MAX_SIGNED_URL_TTL_SECONDS
  ) {
    return c.json({ error: 'Signed URL TTL must be between 1 and 604800 seconds' }, 400)
  }
  if (!encryptedAccessKeyId || !encryptedSecretAccessKey) {
    return c.json({ error: 'S3 access key ID and secret access key are required' }, 400)
  }

  const now = new Date().toISOString()
  if (existing) {
    await execute(
      `UPDATE object_storage_settings
       SET endpoint = ?, region = ?, bucket = ?, access_key_id_encrypted = ?, secret_access_key_encrypted = ?, url_ttl_seconds = ?, updated_at = ?
       WHERE id = 1`,
      [endpoint, region, bucket, encryptedAccessKeyId, encryptedSecretAccessKey, urlTtlSeconds, now],
    )
  } else {
    await execute(
      `INSERT INTO object_storage_settings
       (id, endpoint, region, bucket, access_key_id_encrypted, secret_access_key_encrypted, url_ttl_seconds, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [endpoint, region, bucket, encryptedAccessKeyId, encryptedSecretAccessKey, urlTtlSeconds, now, now],
    )
  }

  const rows = await query<DatabaseObjectStorageSettings>('SELECT * FROM object_storage_settings WHERE id = 1 LIMIT 1')
  return c.json({ settings: toObjectStorageSettings(rows[0]) })
})

// DELETE /api/settings/object-storage (admin only)
settingsRouter.delete('/object-storage', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const caller = (c as any).get('jwtPayload') as JwtPayload
  if (caller.role !== 'admin' && !caller.permissions.includes('*')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  await execute('DELETE FROM object_storage_settings WHERE id = 1')
  return c.json({ success: true })
})

settingsRouter.get('/database', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const caller = (c as any).get('jwtPayload') as JwtPayload
  if (caller.role !== 'admin' && !caller.permissions.includes('*')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  const rows = await query<DatabaseConnectionSettings>(
    'SELECT id, database_url, auth_token_encrypted, api_token_encrypted, org, group_name, created_at, updated_at FROM database_settings WHERE id = 1 LIMIT 1',
  )
  return c.json({ settings: toDatabaseSettings(rows[0]) })
})

settingsRouter.put('/database', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const caller = (c as any).get('jwtPayload') as JwtPayload
  if (caller.role !== 'admin' && !caller.permissions.includes('*')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  let body: {
    databaseUrl?: unknown
    authToken?: unknown
    apiToken?: unknown
    org?: unknown
    group?: unknown
    publish?: unknown
  }
  try {
    const parsedBody: unknown = await c.req.json()
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    body = parsedBody as typeof body
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  for (const [field, value] of Object.entries(body)) {
    if (value !== undefined && typeof value !== 'string' && field !== 'publish') {
      return c.json({ error: `${field} must be a string` }, 400)
    }
  }
  if (body.publish !== undefined && typeof body.publish !== 'boolean') {
    return c.json({ error: 'publish must be a boolean' }, 400)
  }

  const existingRows = await query<DatabaseConnectionSettings>('SELECT * FROM database_settings WHERE id = 1 LIMIT 1')
  const existing = existingRows[0]
  const databaseUrl =
    body.databaseUrl === undefined ? existing?.database_url?.trim() || '' : trimSetting(body.databaseUrl)
  const authToken = trimSetting(body.authToken)
  const apiToken = trimSetting(body.apiToken)
  const org = body.org === undefined ? existing?.org?.trim() || '' : trimSetting(body.org)
  const group = body.group === undefined ? existing?.group_name?.trim() || '' : trimSetting(body.group)
  const encryptedAuthToken = authToken ? encryptSecret(authToken) : existing?.auth_token_encrypted || null
  const encryptedApiToken = apiToken ? encryptSecret(apiToken) : existing?.api_token_encrypted || null
  const now = new Date().toISOString()

  if (org || group || apiToken || encryptedApiToken) {
    if (!org || !group || !encryptedApiToken) {
      return c.json({ error: 'Turso API token, org, and group are all required' }, 400)
    }
  }

  if (existing) {
    await execute(
      `UPDATE database_settings
       SET database_url = ?, auth_token_encrypted = ?, api_token_encrypted = ?, org = ?, group_name = ?, updated_at = ?
       WHERE id = 1`,
      [databaseUrl || null, encryptedAuthToken, encryptedApiToken, org || null, group || null, now],
    )
  } else {
    await execute(
      `INSERT INTO database_settings
       (id, database_url, auth_token_encrypted, api_token_encrypted, org, group_name, created_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
      [databaseUrl || null, encryptedAuthToken, encryptedApiToken, org || null, group || null, now, now],
    )
  }

  const rows = await query<DatabaseConnectionSettings>('SELECT * FROM database_settings WHERE id = 1 LIMIT 1')
  const settings = toDatabaseSettings(rows[0])
  const connectionKey = caller.connectionKey
  const shouldBind = Boolean(databaseUrl) || body.publish === true
  if (!shouldBind || !connectionKey) {
    return c.json({ settings })
  }

  try {
    const resolvedAuthToken = authToken || (existing?.auth_token_encrypted ? decryptSecret(existing.auth_token_encrypted) : '')
    const resolvedApiToken = apiToken || (existing?.api_token_encrypted ? decryptSecret(existing.api_token_encrypted) : '')
    const platform = parsePlatformConfig({
      apiToken: resolvedApiToken,
      org,
      group,
    })
    const connection = await applyRemoteToConnection(connectionKey, {
      url: databaseUrl || undefined,
      authToken: resolvedAuthToken || undefined,
      platform: body.publish === true ? platform : undefined,
    })
    return c.json({ settings: { ...settings, configured: connection.published || settings.configured }, connection })
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to apply database settings' }, 400)
  }
})

settingsRouter.delete('/database', async (c) => {
  // biome-ignore lint/suspicious/noExplicitAny: jwtPayload set by authMiddleware
  const caller = (c as any).get('jwtPayload') as JwtPayload
  if (caller.role !== 'admin' && !caller.permissions.includes('*')) {
    return c.json({ error: 'Insufficient permissions' }, 403)
  }

  await execute('DELETE FROM database_settings WHERE id = 1')
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
      [
        body.name ?? 'My Store',
        body.app_name ?? null,
        body.description ?? null,
        body.tax_enabled ?? 0,
        body.tax_percentage ?? 0,
        body.currency_symbol ?? '$',
        body.language ?? 'en',
        body.logo_url ?? null,
        body.address ?? null,
        body.phone ?? null,
        body.email ?? null,
        body.website ?? null,
        body.receipt_footer ?? null,
        now,
        now,
      ],
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
      [
        body.name ?? null,
        body.app_name ?? null,
        body.description ?? null,
        body.tax_enabled ?? null,
        body.tax_percentage ?? null,
        body.currency_symbol ?? null,
        body.language ?? null,
        body.logo_url ?? null,
        body.address ?? null,
        body.phone ?? null,
        body.email ?? null,
        body.website ?? null,
        body.receipt_footer ?? null,
        now,
        existing[0].id,
      ],
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

function toObjectStorageSettings(s?: DatabaseObjectStorageSettings) {
  return {
    configured: Boolean(s?.endpoint && s?.bucket && s?.access_key_id_encrypted && s?.secret_access_key_encrypted),
    endpoint: s?.endpoint ?? null,
    region: s?.region ?? 'auto',
    bucket: s?.bucket ?? null,
    urlTtlSeconds: s?.url_ttl_seconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS,
    updatedAt: s?.updated_at ?? null,
  }
}

function toDatabaseSettings(s?: DatabaseConnectionSettings) {
  return {
    configured: Boolean(s?.database_url && s?.auth_token_encrypted),
    hostedProvisioning: Boolean(s?.api_token_encrypted && s?.org && s?.group_name),
    databaseUrl: s?.database_url ?? null,
    org: s?.org ?? null,
    group: s?.group_name ?? null,
    updatedAt: s?.updated_at ?? null,
  }
}

function trimSetting(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeObjectStorageEndpoint(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  if (!normalized) throw new Error('S3 endpoint is required')

  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new Error('S3 endpoint must be a valid URL')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('S3 endpoint must use http or https')
  }
  if (!url.hostname) {
    throw new Error('S3 endpoint must include a hostname')
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('S3 endpoint must use HTTPS in production')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('S3 endpoint must not include credentials, query parameters, or a hash')
  }

  return normalized
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
