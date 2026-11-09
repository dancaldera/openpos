import { decryptSecret as decryptWithKey, encryptSecret as encryptWithKey, secretsEqual } from '@openpos/control-plane'
import { getJwtSecret } from '../middleware/auth.js'

/** Encrypt a store setting (e.g. S3 keys) for database storage using AES-256-GCM. */
export async function encryptSecret(secret: string): Promise<string> {
  return encryptWithKey(secret, getJwtSecret())
}

/** Decrypt a value produced by encryptSecret (or the previous node:crypto version). */
export async function decryptSecret(value: string): Promise<string> {
  return decryptWithKey(value, getJwtSecret())
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Operator secret used for password recovery and other administration. */
export function getInternalSecret(): string {
  const secret = process.env.INTERNAL_SECRET?.trim()
  if (!secret) {
    throw new Error('INTERNAL_SECRET environment variable is not set')
  }
  return secret
}

/** Compare a candidate against INTERNAL_SECRET without leaking length. */
export async function verifyInternalSecret(candidate: string): Promise<boolean> {
  return secretsEqual(candidate, getInternalSecret())
}
