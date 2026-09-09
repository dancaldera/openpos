import { describe, expect, it } from 'vitest'
import { validatePasswordStrength, validatePin } from './password'

describe('validatePasswordStrength', () => {
  it('accepts strong passwords', () => {
    expect(validatePasswordStrength('Str0ng!pass')).toBeNull()
  })

  it('reports each missing requirement', () => {
    expect(validatePasswordStrength('Sh0rt!')).toBe('Password must be at least 8 characters')
    expect(validatePasswordStrength('weak0!pass')).toBe('Password must contain an uppercase letter')
    expect(validatePasswordStrength('WEAK0!PASS')).toBe('Password must contain a lowercase letter')
    expect(validatePasswordStrength('Weak!pass')).toBe('Password must contain a number')
    expect(validatePasswordStrength('Weak0pass')).toBe('Password must contain a special character')
  })
})

describe('validatePin', () => {
  it('accepts exactly six digits', () => {
    expect(validatePin('123456')).toBeNull()
    expect(validatePin('12345')).toBe('PIN must be exactly 6 digits')
    expect(validatePin('1234567')).toBe('PIN must be exactly 6 digits')
    expect(validatePin('abcdef')).toBe('PIN must be exactly 6 digits')
  })
})
