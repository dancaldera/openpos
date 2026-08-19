/**
 * Password recovery helpers (browser-safe).
 *
 * Recovery codes are single-use, high-entropy strings. Only a SHA-256 hash of
 * the normalized code (uppercase, separators stripped) is stored, so a leaked
 * database does not expose usable codes.
 *
 * Web mode: code generation and hashing happen server-side (see the API).
 * Desktop mode: the SPA hashes/generates locally against the local database,
 * using Web Crypto (available in browsers and Electron's secure contexts).
 */

export const RECOVERY_CODE_COUNT = 8
export const RECOVERY_CODE_LENGTH = 15

// 32 unambiguous characters (no 0/O/1/I) -> ~75 bits of entropy per code.
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Uppercase the code and strip everything except A-Z0-9 (dashes, spaces...). */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** SHA-256 hex digest of the normalized code, via Web Crypto. */
export async function hashRecoveryCode(code: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Secure crypto is not available in this context')
  }

  const data = new TextEncoder().encode(normalizeRecoveryCode(code))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Generate one recovery code formatted as XXXXX-XXXXX-XXXXX. */
export function generateRecoveryCode(): string {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('Secure crypto is not available in this context')
  }

  const bytes = new Uint8Array(RECOVERY_CODE_LENGTH)
  crypto.getRandomValues(bytes)

  let code = ''
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    code += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length]
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
