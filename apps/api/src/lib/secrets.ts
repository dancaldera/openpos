import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

function getEncryptionKey(): Buffer {
  const masterSecret = process.env.JWT_SECRET
  if (!masterSecret) {
    throw new Error('JWT_SECRET must be configured')
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
export function verifyInternalSecret(candidate: string): boolean {
  const expected = getInternalSecret()
  const left = createHash('sha256').update(candidate).digest()
  const right = createHash('sha256').update(expected).digest()
  return timingSafeEqual(left, right)
}
