// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  delete (window as { __OPENPOS_DESKTOP__?: unknown }).__OPENPOS_DESKTOP__
})

describe('usePlatform', () => {
  it('reports web without the desktop marker', async () => {
    const { usePlatform } = await import('./usePlatform.ts')

    expect(usePlatform()).toEqual({ isMac: false, isWindows: false, isLinux: false, isDesktop: false })
  })

  it('reports the host platform from the marker', async () => {
    window.__OPENPOS_DESKTOP__ = { isElectron: true, platform: 'darwin' }
    vi.resetModules()
    const { usePlatform } = await import('./usePlatform.ts')

    expect(usePlatform()).toEqual({ isMac: true, isWindows: false, isLinux: false, isDesktop: true })
  })
})
