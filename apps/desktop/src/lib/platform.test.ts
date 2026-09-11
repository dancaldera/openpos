// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  delete (window as { __OPENPOS_DESKTOP__?: unknown }).__OPENPOS_DESKTOP__
})

describe('platform', () => {
  it('detects the electron preload marker', async () => {
    const withoutMarker = await import('./platform.ts')
    expect(withoutMarker.isElectron).toBe(false)
    expect(withoutMarker.isDesktop).toBe(false)
    expect(withoutMarker.isWeb).toBe(true)

    window.__OPENPOS_DESKTOP__ = { isElectron: true, platform: 'linux' }
    vi.resetModules()
    const withMarker = await import('./platform.ts')
    expect(withMarker.isElectron).toBe(true)
    expect(withMarker.isDesktop).toBe(true)
    expect(withMarker.isWeb).toBe(false)
  })
})
