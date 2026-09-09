import { describe, expect, it } from 'vitest'
import { AVAILABLE_LOCALES, en, es } from './index'

describe('locales', () => {
  it('exposes english and spanish dictionaries', () => {
    expect(AVAILABLE_LOCALES).toEqual(['en', 'es'])
    expect(typeof en).toBe('object')
    expect(typeof es).toBe('object')
    expect(en).not.toBe(es)
  })
})
