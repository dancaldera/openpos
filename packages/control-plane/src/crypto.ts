/**
 * AES-256-GCM secret envelopes using WebCrypto (Node 20+, Workers, browsers).
 *
 * Format: v1.<iv>.<authTag>.<ciphertext> in base64url. This matches the
 * format the API previously produced with node:crypto, so values encrypted
 * before the move to WebCrypto still decrypt.
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const TAG_BYTES = 16

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

// Derived from the API so it type-checks with either DOM or Node lib typings.
type AesKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>

const keyCache = new Map<string, Promise<AesKey>>()

function deriveKey(masterSecret: string): Promise<AesKey> {
  if (!masterSecret) throw new Error('Encryption secret is not configured')
  let key = keyCache.get(masterSecret)
  if (!key) {
    key = crypto.subtle
      .digest('SHA-256', encoder.encode(masterSecret))
      .then((digest) => crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']))
    keyCache.set(masterSecret, key)
  }
  return key
}

export async function encryptSecret(plaintext: string, masterSecret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(masterSecret), encoder.encode(plaintext)),
  )
  const ciphertext = sealed.slice(0, sealed.length - TAG_BYTES)
  const tag = sealed.slice(sealed.length - TAG_BYTES)
  return `v1.${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(ciphertext)}`
}

export async function decryptSecret(envelope: string, masterSecret: string): Promise<string> {
  const [version, iv, tag, ciphertext] = envelope.split('.')
  if (version !== 'v1' || !iv || !tag || ciphertext === undefined) {
    throw new Error('Unsupported encrypted secret format')
  }
  const sealed = new Uint8Array([...fromBase64Url(ciphertext), ...fromBase64Url(tag)]) as Uint8Array<ArrayBuffer>
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(iv) },
    await deriveKey(masterSecret),
    sealed,
  )
  return decoder.decode(plaintext)
}

/** Constant-time string comparison (hashes first so lengths do not leak). */
export async function secretsEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let index = 0; index < x.length; index += 1) diff |= x[index] ^ y[index]
  return diff === 0
}
