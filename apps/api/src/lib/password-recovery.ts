/**
 * Password recovery helpers.
 *
 * Recovery codes are single-use, high-entropy strings. Only a SHA-256 hash of
 * the normalized code (uppercase, separators stripped) is stored, so a leaked
 * database does not expose usable codes.
 */

import { createHash, randomInt } from 'node:crypto'

export const RECOVERY_CODE_COUNT = 8
export const RECOVERY_CODE_LENGTH = 15

// 32 unambiguous characters (no 0/O/1/I) -> ~75 bits of entropy per code.
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Uppercase the code and strip everything except A-Z0-9 (dashes, spaces...). */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** SHA-256 hex digest of the normalized code. */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')
}

/** Generate one recovery code formatted as XXXXX-XXXXX-XXXXX. */
export function generateRecoveryCode(): string {
  let code = ''
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    code += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]
  }
  return `${code.slice(0, 5)}-${code.slice(5, 10)}-${code.slice(10, 15)}`
}

export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => generateRecoveryCode())
}

/** Same strength policy used by sign-up and user management flows. */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain a number'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain a special character'
  return null
}
