import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000
export const PASSWORD_RESET_REQUEST_COOLDOWN_MS = 60 * 1000

function getEncryptionKey(): Buffer {
  const masterSecret = process.env.PASSWORD_RESET_ENCRYPTION_KEY || process.env.JWT_SECRET
  if (!masterSecret) {
    throw new Error('JWT_SECRET or PASSWORD_RESET_ENCRYPTION_KEY must be configured')
  }

  return createHash('sha256').update(masterSecret).digest()
}

function encode(value: Buffer): string {
  return value.toString('base64url')
}

function decode(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

/** Encrypt a secret for database storage using AES-256-GCM. */
export function encryptSecret(secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `v1.${encode(iv)}.${encode(authTag)}.${encode(ciphertext)}`
}

/** Decrypt a secret stored by encryptSecret. */
export function decryptSecret(value: string): string {
  const [version, encodedIv, encodedAuthTag, encodedCiphertext] = value.split('.')
  if (version !== 'v1' || !encodedIv || !encodedAuthTag || !encodedCiphertext) {
    throw new Error('Unsupported encrypted secret format')
  }

  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), decode(encodedIv))
  decipher.setAuthTag(decode(encodedAuthTag))
  return Buffer.concat([decipher.update(decode(encodedCiphertext)), decipher.final()]).toString('utf8')
}

export function generateResetToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Normalize and validate a web app URL used in reset links. */
export function normalizeWebAppUrl(value: string): string {
  const normalized = value.trim()
  if (!normalized) return ''

  const url = new URL(normalized)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Web app URL must use http or https')
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('Web app URL must use HTTPS in production')
  }
  if (url.search || url.hash) {
    throw new Error('Web app URL must not include a query string or hash')
  }

  return normalized.replace(/\/+$/, '')
}

/** Resolve the configured frontend URL without trusting an arbitrary request origin in production. */
export function resolveWebAppUrl(configuredUrl?: string | null, requestOrigin?: string | null): string {
  const candidates = [configuredUrl, process.env.PUBLIC_WEB_URL, process.env.ALLOWED_ORIGIN]
  if (process.env.NODE_ENV !== 'production') {
    candidates.push(requestOrigin)
  }

  for (const candidate of candidates) {
    if (!candidate?.trim()) continue
    const normalized = normalizeWebAppUrl(candidate)
    if (normalized) return normalized
  }

  throw new Error('Password reset web app URL is not configured')
}

export function buildPasswordResetUrl(webAppUrl: string, token: string): string {
  const url = new URL(`${webAppUrl.replace(/\/+$/, '')}/reset-password`)
  url.searchParams.set('token', token)
  return url.toString()
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character,
  )
}

export async function sendPasswordResetEmail(
  apiKey: string,
  fromEmail: string,
  recipientEmail: string,
  resetUrl: string,
): Promise<void> {
  const safeResetUrl = escapeHtml(resetUrl)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipientEmail],
      subject: 'Reset your OpenPOS password',
      text: `Use this link to reset your OpenPOS password: ${resetUrl}\n\nThis link expires in 1 hour.`,
      html: `<p>Use the link below to reset your OpenPOS password:</p><p><a href="${safeResetUrl}">Reset password</a></p><p>This link expires in 1 hour.</p>`,
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend email request failed with status ${response.status}`)
  }
}
