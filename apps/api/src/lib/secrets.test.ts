import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, getInternalSecret, isValidEmail, verifyInternalSecret } from './secrets'

const originalJwtSecret = process.env.JWT_SECRET
const originalInternalSecret = process.env.INTERNAL_SECRET

beforeEach(() => {
  process.env.JWT_SECRET = 'secrets-test-jwt'
  process.env.INTERNAL_SECRET = 'operator-admin-secret'
})

afterAll(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalJwtSecret
  if (originalInternalSecret === undefined) delete process.env.INTERNAL_SECRET
  else process.env.INTERNAL_SECRET = originalInternalSecret
})

describe('secrets', () => {
  it('round-trips encrypted secrets', () => {
    const encrypted = encryptSecret('s3-access-key')
    expect(encrypted).toMatch(/^v1\./)
    expect(encrypted).not.toContain('s3-access-key')
    expect(decryptSecret(encrypted)).toBe('s3-access-key')
  })

  it('validates emails', () => {
    expect(isValidEmail('admin@example.com')).toBe(true)
    expect(isValidEmail('not-an-email')).toBe(false)
  })

  it('requires INTERNAL_SECRET', () => {
    delete process.env.INTERNAL_SECRET
    expect(() => getInternalSecret()).toThrow('INTERNAL_SECRET environment variable is not set')
  })

  it('accepts the configured internal secret and rejects others', () => {
    expect(verifyInternalSecret('operator-admin-secret')).toBe(true)
    expect(verifyInternalSecret('wrong-secret')).toBe(false)
  })

  it('requires JWT_SECRET for encryption', () => {
    delete process.env.JWT_SECRET
    expect(() => encryptSecret('x')).toThrow('JWT_SECRET must be configured')
  })

  it('rejects malformed encrypted secrets', () => {
    for (const malformed of ['junk', 'v1', 'v1.abc', 'v1.abc.def']) {
      expect(() => decryptSecret(malformed)).toThrow('Unsupported encrypted secret format')
    }
  })
})
