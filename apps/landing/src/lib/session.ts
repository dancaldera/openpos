import { createHash, timingSafeEqual } from 'node:crypto'
import { getEnv, requireEnv } from './env'

export const SESSION_COOKIE = 'openpos_admin'
const SESSION_TTL_SECONDS = 8 * 60 * 60

interface SessionPayload {
  email: string
  exp: number
}

function hashValue(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

export function verifyCredentials(email: string, password: string): boolean {
  const adminEmail = getEnv('ADMIN_EMAIL')
  const adminPassword = getEnv('ADMIN_PASSWORD')
  if (!adminEmail || !adminPassword) return false

  try {
    const emailMatch = timingSafeEqual(hashValue(email), hashValue(adminEmail))
    const passwordMatch = timingSafeEqual(hashValue(password), hashValue(adminPassword))
    return emailMatch && passwordMatch
  } catch {
    return false
  }
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function getHmacKey(): Promise<CryptoKey> {
  const secret = requireEnv('SESSION_SECRET')
  const secretBytes = new TextEncoder().encode(secret)
  return crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function createSession(email: string): Promise<string> {
  const payload: SessionPayload = {
    email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
  const payloadPart = toBase64Url(payloadBytes)
  const key = await getHmacKey()
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadPart))
  return `${payloadPart}.${toBase64Url(new Uint8Array(signature))}`
}

export async function verifySession(cookieValue: string | undefined): Promise<SessionPayload | null> {
  if (!cookieValue) return null

  const [payloadPart, signaturePart] = cookieValue.split('.')
  if (!payloadPart || !signaturePart) return null

  try {
    const key = await getHmacKey()
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(signaturePart),
      new TextEncoder().encode(payloadPart),
    )
    if (!valid) return null

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadPart))) as SessionPayload
    if (!payload.email || !payload.exp) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}
