import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDesktopApi, requireDesktopApi } from './desktop'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('desktop api access', () => {
  it('returns null without a window', () => {
    expect(getDesktopApi()).toBeNull()
    expect(() => requireDesktopApi()).toThrow('Desktop API is not available in this runtime')
  })

  it('returns null without the bridge', () => {
    vi.stubGlobal('window', {})

    expect(getDesktopApi()).toBeNull()
    expect(() => requireDesktopApi()).toThrow('Desktop API is not available in this runtime')
  })

  it('returns the bridge when present', () => {
    const bridge = { getConfig: async () => ({}) }
    vi.stubGlobal('window', { openposDesktop: bridge })

    expect(getDesktopApi()).toBe(bridge)
    expect(requireDesktopApi()).toBe(bridge)
  })
})
