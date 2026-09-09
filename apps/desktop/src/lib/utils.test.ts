import { signal } from '@preact/signals'
import { describe, expect, it } from 'vitest'
import { clsx, formatRelativeTime } from './utils'

describe('clsx', () => {
  it('unwraps signals and drops falsy values', () => {
    expect(clsx('a', signal('b'), false, undefined, '')).toBe('a b')
    expect(clsx(signal(undefined), 'c')).toBe('c')
  })
})

describe('formatRelativeTime', () => {
  it('labels missing or invalid timestamps', () => {
    expect(formatRelativeTime()).toBe('not yet')
    expect(formatRelativeTime('')).toBe('not yet')
    expect(formatRelativeTime('not-a-date')).toBe('not yet')
  })

  it('formats recent timestamps relatively', () => {
    const now = Date.now()
    expect(formatRelativeTime(new Date(now - 2_000).toISOString())).toBe('just now')
    expect(formatRelativeTime(new Date(now - 30_000).toISOString())).toBe('30s ago')
    expect(formatRelativeTime(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago')
    expect(formatRelativeTime(new Date(now - 2 * 3_600_000).toISOString())).toBe('2h ago')
  })
})
