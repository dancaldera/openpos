import { describe, expect, it } from 'vitest'
import {
  generateRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  validatePasswordStrength,
} from './password-recovery'

describe('normalizeRecoveryCode', () => {
  it('uppercases and strips separators', () => {
    expect(normalizeRecoveryCode('abcde-fghjk-lmnpq')).toBe('ABCDEFGHJKLMNPQ')
    expect(normalizeRecoveryCode(' abcde fghjk  lmnpq ')).toBe('ABCDEFGHJKLMNPQ')
    expect(normalizeRecoveryCode('ABCDE_FGHJK_LMNPQ')).toBe('ABCDEFGHJKLMNPQ')
  })
})

describe('hashRecoveryCode', () => {
  it('hashes the normalized code and accepts any separator style', async () => {
    const dashed = await hashRecoveryCode('ABCDE-FGHJK-LMNPQ')
    const spaced = await hashRecoveryCode('abcde fghjk lmnpq')

    expect(dashed).toMatch(/^[a-f0-9]{64}$/)
    expect(spaced).toBe(dashed)
  })
})

describe('generateRecoveryCodes', () => {
  it('generates unique unambiguous codes', () => {
    const codes = generateRecoveryCodes(50)
    expect(new Set(codes).size).toBe(50)

    for (const code of codes) {
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/)
    }

    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode())
  })
})

describe('validatePasswordStrength', () => {
  it('accepts strong passwords', () => {
    expect(validatePasswordStrength('NewPass1!')).toBeNull()
  })

  it('rejects weak passwords with a reason', () => {
    expect(validatePasswordStrength('short')).toBe('Password must be at least 8 characters')
    expect(validatePasswordStrength('alllowercase1!')).toBe('Password must contain an uppercase letter')
    expect(validatePasswordStrength('ALLUPPERCASE1!')).toBe('Password must contain a lowercase letter')
    expect(validatePasswordStrength('NoNumbersHere!')).toBe('Password must contain a number')
    expect(validatePasswordStrength('NoSpecials123')).toBe('Password must contain a special character')
  })
})
