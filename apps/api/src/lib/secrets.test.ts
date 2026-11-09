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
  it('round-trips encrypted secrets', async () => {
    const encrypted = await encryptSecret('s3-access-key')
    expect(encrypted).toMatch(/^v1\./)
    expect(encrypted).not.toContain('s3-access-key')
    await expect(decryptSecret(encrypted)).resolves.toBe('s3-access-key')
  })

  it('cannot decrypt with a different JWT_SECRET', async () => {
    const encrypted = await encryptSecret('s3-access-key')
    process.env.JWT_SECRET = 'another-secret'
    await expect(decryptSecret(encrypted)).rejects.toThrow()
  })

  it('validates emails', () => {
    expect(isValidEmail('admin@example.com')).toBe(true)
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false)
  })

  it('requires INTERNAL_SECRET', () => {
    delete process.env.INTERNAL_SECRET
    expect(() => getInternalSecret()).toThrow('INTERNAL_SECRET environment variable is not set')
  })

  it('accepts the configured internal secret and rejects others', async () => {
    expect(getInternalSecret()).toBe('operator-admin-secret')
    await expect(verifyInternalSecret('operator-admin-secret')).resolves.toBe(true)
    await expect(verifyInternalSecret('wrong-secret')).resolves.toBe(false)
  })

  it('requires JWT_SECRET for encryption', async () => {
    delete process.env.JWT_SECRET
    await expect(encryptSecret('x')).rejects.toThrow('JWT_SECRET environment variable is not set')
    await expect(decryptSecret('v1.a.b.c')).rejects.toThrow('JWT_SECRET environment variable is not set')
  })

  it('rejects malformed encrypted secrets', async () => {
    for (const malformed of ['junk', 'v1', 'v1.abc', 'v1.abc.def', 'v2.a.b.c']) {
      await expect(decryptSecret(malformed)).rejects.toThrow('Unsupported encrypted secret format')
    }
  })
})
