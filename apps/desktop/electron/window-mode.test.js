import { describe, expect, it } from 'vitest'
const {
  fullscreenToggleAccelerator,
  isFullscreenToggleInput,
  resolveLinuxSessionSettleMs,
  shouldApplyFullscreenAfterLoad,
  shouldDisableLinuxHardwareAcceleration,
  shouldStartFullscreen,
} = await import('./window-mode.cjs')

describe('shouldStartFullscreen', () => {
  it('starts fullscreen for packaged installs', () => {
    expect(shouldStartFullscreen({ isPackaged: true })).toBe(true)
  })

  it('stays windowed in development', () => {
    expect(shouldStartFullscreen({ isPackaged: false })).toBe(false)
  })

  it('honors --windowed over packaged fullscreen', () => {
    expect(shouldStartFullscreen({
      isPackaged: true,
      argv: ['openpos', '--windowed'],
    })).toBe(false)
  })

  it('honors OPENPOS_WINDOWED over packaged fullscreen', () => {
    expect(shouldStartFullscreen({
      isPackaged: true,
      env: { OPENPOS_WINDOWED: '1' },
    })).toBe(false)
  })

  it('starts fullscreen in development with --fullscreen', () => {
    expect(shouldStartFullscreen({
      isPackaged: false,
      argv: ['electron', '.', '--fullscreen'],
    })).toBe(true)
  })

  it('starts fullscreen in development with OPENPOS_FULLSCREEN', () => {
    expect(shouldStartFullscreen({
      isPackaged: false,
      env: { OPENPOS_FULLSCREEN: 'true' },
    })).toBe(true)
  })

  it('lets --windowed win when both flags are present', () => {
    expect(shouldStartFullscreen({
      isPackaged: true,
      argv: ['openpos', '--fullscreen', '--windowed'],
      env: { OPENPOS_FULLSCREEN: '1' },
    })).toBe(false)
  })

  it('treats yes as truthy', () => {
    expect(shouldStartFullscreen({
      isPackaged: false,
      env: { OPENPOS_FULLSCREEN: 'yes' },
    })).toBe(true)
  })

  it('defaults to windowed without input', () => {
    expect(shouldStartFullscreen()).toBe(false)
    expect(resolveLinuxSessionSettleMs()).toBe(0)
    expect(shouldDisableLinuxHardwareAcceleration()).toBe(false)
  })
})

describe('shouldApplyFullscreenAfterLoad', () => {
  it('mirrors shouldStartFullscreen with defaults', () => {
    expect(shouldApplyFullscreenAfterLoad()).toBe(false)
    expect(shouldApplyFullscreenAfterLoad({ isPackaged: true })).toBe(true)
    expect(shouldApplyFullscreenAfterLoad({ argv: ['openpos', '--windowed'] })).toBe(false)
  })
})

describe('resolveLinuxSessionSettleMs', () => {
  it('stays instant when the display is already usable', () => {
    expect(resolveLinuxSessionSettleMs({ isPackaged: true, platform: 'linux' })).toBe(0)
  })

  it('settles after autostart when the display was not ready yet', () => {
    expect(resolveLinuxSessionSettleMs({
      isPackaged: true,
      platform: 'linux',
      displayWasDelayed: true,
    })).toBe(2000)
  })

  it('skips settle outside packaged Linux', () => {
    expect(resolveLinuxSessionSettleMs({ isPackaged: false, platform: 'linux' })).toBe(0)
    expect(resolveLinuxSessionSettleMs({ isPackaged: true, platform: 'darwin' })).toBe(0)
  })

  it('honors OPENPOS_SESSION_SETTLE_MS', () => {
    expect(resolveLinuxSessionSettleMs({
      isPackaged: true,
      platform: 'linux',
      env: { OPENPOS_SESSION_SETTLE_MS: '5000' },
    })).toBe(5000)
  })

  it('ignores invalid settle values', () => {
    expect(resolveLinuxSessionSettleMs({
      isPackaged: true,
      platform: 'linux',
      env: { OPENPOS_SESSION_SETTLE_MS: 'soon' },
    })).toBe(0)
  })
})

describe('shouldDisableLinuxHardwareAcceleration', () => {
  it('disables GPU on packaged Linux by default', () => {
    expect(shouldDisableLinuxHardwareAcceleration({
      platform: 'linux',
      isPackaged: true,
    })).toBe(true)
  })

  it('keeps GPU when OPENPOS_FORCE_GPU is set', () => {
    expect(shouldDisableLinuxHardwareAcceleration({
      platform: 'linux',
      isPackaged: true,
      env: { OPENPOS_FORCE_GPU: '1' },
    })).toBe(false)
  })

  it('only applies to packaged Linux', () => {
    expect(shouldDisableLinuxHardwareAcceleration({
      platform: 'darwin',
      isPackaged: true,
    })).toBe(false)
    expect(shouldDisableLinuxHardwareAcceleration({
      platform: 'linux',
      isPackaged: false,
    })).toBe(false)
  })
})

describe('fullscreenToggleAccelerator', () => {
  it('uses F11 on Linux checkout PCs', () => {
    expect(fullscreenToggleAccelerator('linux')).toBe('F11')
  })

  it('uses Control+Command+F on macOS', () => {
    expect(fullscreenToggleAccelerator('darwin')).toBe('Control+Command+F')
  })

  it('resolves the accelerator for the host platform', () => {
    expect(fullscreenToggleAccelerator()).toBe(process.platform === 'darwin' ? 'Control+Command+F' : 'F11')
  })
})

describe('isFullscreenToggleInput', () => {
  it('matches F11 on Linux', () => {
    expect(isFullscreenToggleInput({ type: 'keyDown', key: 'F11' }, 'linux')).toBe(true)
  })

  it('ignores key repeat so holding F11 does not flicker', () => {
    expect(isFullscreenToggleInput({
      type: 'keyDown',
      key: 'F11',
      isAutoRepeat: true,
    }, 'linux')).toBe(false)
  })

  it('matches Control+Command+F on macOS', () => {
    expect(isFullscreenToggleInput({
      type: 'keyDown',
      key: 'f',
      control: true,
      meta: true,
    }, 'darwin')).toBe(true)
  })

  it('ignores plain F on macOS', () => {
    expect(isFullscreenToggleInput({ type: 'keyDown', key: 'f' }, 'darwin')).toBe(false)
  })

  it('matches uppercase F with modifiers on macOS', () => {
    expect(isFullscreenToggleInput({
      type: 'keyDown',
      key: 'F',
      control: true,
      meta: true,
    }, 'darwin')).toBe(true)
  })

  it('ignores other keys with modifiers on macOS', () => {
    expect(isFullscreenToggleInput({
      type: 'keyDown',
      key: 'g',
      control: true,
      meta: true,
    }, 'darwin')).toBe(false)
  })

  it('ignores missing keys on macOS', () => {
    expect(isFullscreenToggleInput({
      type: 'keyDown',
      control: true,
      meta: true,
    }, 'darwin')).toBe(false)
  })

  it('rejects empty input on the host platform', () => {
    expect(isFullscreenToggleInput(null)).toBe(false)
  })
})
