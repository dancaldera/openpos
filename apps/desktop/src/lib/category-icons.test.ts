import { describe, expect, it } from 'bun:test'
import { getCategoryIcon } from './category-icons'

describe('getCategoryIcon', () => {
  it('returns the mapped emoji for a known category', () => {
    expect(getCategoryIcon('Beverages')).toBe('🥤')
    expect(getCategoryIcon('Coffee & Tea')).toBe('☕')
    expect(getCategoryIcon('Electronics')).toBe('📱')
  })

  it('falls back to a tag icon for an unknown category', () => {
    expect(getCategoryIcon('Custom Category')).toBe('🏷️')
    expect(getCategoryIcon('')).toBe('🏷️')
  })
})
