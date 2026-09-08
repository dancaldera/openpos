import { describe, expect, it } from 'vitest'
import { validatePasswordStrength } from './password'

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
