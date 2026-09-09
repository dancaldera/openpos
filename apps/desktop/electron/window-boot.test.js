import { describe, expect, it } from 'vitest'
const {
  GRAPHICS_FALLBACK_FLAG,
  applyLinuxGraphicsSwitches,
  applyLinuxRuntimeSwitches,
  compositorNudgeBounds,
  hasGraphicsFallbackFlag,
  isBlankFrame,
  isDisplayGeometryReady,
  luminanceVariance,
  relaunchArgvWithGraphicsFallback,
  resolveBootTimeoutMs,
  resolveDelayedDisplaySettleMs,
  resolveDisplayWaitMs,
  resolveFullscreenMode,
  resolvePaintSettleMs,
  resolveWindowBootAction,
  shouldQuitOnLastWindow,
} = await import('./window-boot.cjs')

function solidBitmap(width, height, [r, g, b, a = 255]) {
  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4
    data[offset] = b
    data[offset + 1] = g
    data[offset + 2] = r
    data[offset + 3] = a
  }
  return data
}

describe('resolveWindowBootAction', () => {
  it('waits until the app has loaded and painted', () => {
    expect(resolveWindowBootAction({
      rendererPainted: true,
      loadFinished: false,
    })).toEqual({ action: 'wait' })

    expect(resolveWindowBootAction({
      rendererPainted: false,
      loadFinished: true,
    })).toEqual({ action: 'wait' })
  })

  it('reveals windowed-first then fullscreen on a healthy first boot', () => {
    expect(resolveWindowBootAction({
      rendererPainted: true,
      loadFinished: true,
      wantFullscreen: true,
    })).toEqual({ action: 'reveal', fullscreenMode: 'fullscreen' })
  })

  it('recreates the window when the first boot times out', () => {
    expect(resolveWindowBootAction({
      timedOut: true,
      attempt: 0,
    })).toEqual({ action: 'recreate', nextAttempt: 1, delayMs: 500 })
  })

  it('relaunches with graphics fallback after recreates fail', () => {
    expect(resolveWindowBootAction({
      timedOut: true,
      attempt: 2,
      maxAttempts: 3,
    })).toEqual({ action: 'relaunch-graphics-fallback' })
  })

  it('fails closed once graphics fallback already ran', () => {
    expect(resolveWindowBootAction({
      timedOut: true,
      attempt: 2,
      maxAttempts: 3,
      graphicsFallback: true,
    })).toEqual({ action: 'fail' })
  })

  it('does not relaunch for graphics when the renderer crashed on /dev/shm', () => {
    expect(resolveWindowBootAction({
      timedOut: true,
      attempt: 2,
      maxAttempts: 3,
      reason: 'render-process-gone:crashed',
    })).toEqual({ action: 'fail' })
  })

  it('waits longer before recreating after a renderer crash', () => {
    expect(resolveWindowBootAction({
      timedOut: true,
      attempt: 0,
      reason: 'render-process-gone:crashed',
    })).toEqual({ action: 'recreate', nextAttempt: 1, delayMs: 2000 })
  })
})

describe('resolveFullscreenMode', () => {
  it('degrades fullscreen to maximize then windowed across recoveries', () => {
    expect(resolveFullscreenMode({ wantFullscreen: true, attempt: 0 })).toBe('fullscreen')
    expect(resolveFullscreenMode({ wantFullscreen: true, attempt: 1 })).toBe('maximize')
    expect(resolveFullscreenMode({ wantFullscreen: true, attempt: 2 })).toBe('none')
    expect(resolveFullscreenMode({ wantFullscreen: true, graphicsFallback: true })).toBe('none')
  })
})

describe('isBlankFrame', () => {
  it('treats a uniform white buffer as an unpainted compositor frame', () => {
    expect(isBlankFrame(solidBitmap(64, 64, [255, 255, 255]), { width: 64, height: 64 })).toBe(true)
  })

  it('treats mixed pixels as painted content', () => {
    const data = solidBitmap(64, 64, [255, 255, 255])
    data[0] = 0
    data[1] = 0
    data[2] = 0
    data[4 * 32] = 20
    data[4 * 32 + 1] = 40
    data[4 * 32 + 2] = 200
    expect(isBlankFrame(data, { width: 64, height: 64 }, { sampleStride: 1 })).toBe(false)
  })
})

describe('display and bounds helpers', () => {
  it('requires a usable desktop size', () => {
    expect(isDisplayGeometryReady({ size: { width: 1920, height: 1080 } })).toBe(true)
    expect(isDisplayGeometryReady({ size: { width: 0, height: 0 } })).toBe(false)
  })

  it('nudges height so Linux compositors get an expose', () => {
    expect(compositorNudgeBounds({ x: 10, y: 20, width: 1200, height: 800 })).toEqual({
      x: 10,
      y: 20,
      width: 1200,
      height: 801,
    })
  })
})

describe('shouldQuitOnLastWindow', () => {
  it('does not quit Linux while boot is still creating the main window', () => {
    expect(shouldQuitOnLastWindow({
      platform: 'linux',
      suppressLastWindowQuit: true,
    })).toBe(false)
  })

  it('quits Linux after the main window has been created', () => {
    expect(shouldQuitOnLastWindow({ platform: 'linux' })).toBe(true)
  })

  it('keeps the app alive on macOS', () => {
    expect(shouldQuitOnLastWindow({ platform: 'darwin' })).toBe(false)
  })
})

describe('Linux runtime switches', () => {
  it('disables /dev/shm usage on Linux so Chromium can start', () => {
    const switches = []
    applyLinuxRuntimeSwitches({
      appendSwitch: (name, value) => switches.push(value === undefined ? name : `${name}=${value}`),
    }, { platform: 'linux' })

    expect(switches).toContain('disable-dev-shm-usage')
  })

  it('keeps /dev/shm when OPENPOS_ALLOW_DEV_SHM is set', () => {
    const switches = []
    applyLinuxRuntimeSwitches({
      appendSwitch: (name, value) => switches.push(value === undefined ? name : `${name}=${value}`),
    }, { platform: 'linux', env: { OPENPOS_ALLOW_DEV_SHM: '1' } })

    expect(switches).toEqual([])
  })
})

describe('Linux graphics switches', () => {
  it('does not force ozone or extra GPU flags on a normal packaged launch', () => {
    const switches = []
    applyLinuxGraphicsSwitches({
      appendSwitch: (name, value) => switches.push(value === undefined ? name : `${name}=${value}`),
    }, { platform: 'linux', isPackaged: true, env: {}, argv: [] })

    expect(switches).toEqual([])
  })

  it('adds software-rendering fallback when relaunched', () => {
    const switches = []
    applyLinuxGraphicsSwitches({
      appendSwitch: (name, value) => switches.push(value === undefined ? name : `${name}=${value}`),
    }, {
      platform: 'linux',
      isPackaged: true,
      env: { OPENPOS_GRAPHICS_FALLBACK: '1' },
    })

    expect(switches).toContain('disable-gpu')
    expect(switches).toContain('in-process-gpu')
    expect(hasGraphicsFallbackFlag({ env: { OPENPOS_GRAPHICS_FALLBACK: '1' } })).toBe(true)
  })

  it('preserves current argv and appends the fallback flag for relaunch', () => {
    expect(relaunchArgvWithGraphicsFallback(['openpos', '--fullscreen'])).toEqual([
      '--fullscreen',
      GRAPHICS_FALLBACK_FLAG,
    ])
  })
})

describe('window boot branches', () => {
  it('resolves timeouts from env with defaults', () => {
    expect(resolveBootTimeoutMs()).toBe(6000)
    expect(resolvePaintSettleMs()).toBe(450)
    expect(resolveDisplayWaitMs()).toBe(12000)
    expect(resolveDelayedDisplaySettleMs()).toBe(2000)

    expect(resolveBootTimeoutMs({ OPENPOS_BOOT_TIMEOUT_MS: '1000' })).toBe(1000)
    expect(resolvePaintSettleMs({ OPENPOS_PAINT_SETTLE_MS: '  ' })).toBe(450)
    expect(resolveDisplayWaitMs({ OPENPOS_DISPLAY_WAIT_MS: 'soon' })).toBe(12000)
    expect(resolveDelayedDisplaySettleMs({ OPENPOS_SESSION_SETTLE_MS: '-5' })).toBe(2000)
    expect(resolveBootTimeoutMs({ OPENPOS_BOOT_TIMEOUT_MS: 500 })).toBe(6000)
  })

  it('treats true and yes as truthy flags', () => {
    expect(hasGraphicsFallbackFlag({ env: { OPENPOS_GRAPHICS_FALLBACK: 'true' } })).toBe(true)
    expect(hasGraphicsFallbackFlag({ env: { OPENPOS_GRAPHICS_FALLBACK: 'yes' } })).toBe(true)
    expect(hasGraphicsFallbackFlag({ env: { OPENPOS_GRAPHICS_FALLBACK: 'no' } })).toBe(false)
  })

  it('defaults helpers without input', () => {
    expect(hasGraphicsFallbackFlag()).toBe(false)
    expect(relaunchArgvWithGraphicsFallback()).toEqual([GRAPHICS_FALLBACK_FLAG])
    expect(compositorNudgeBounds()).toEqual({ x: undefined, y: undefined, width: 1200, height: 801 })
    expect(luminanceVariance(null)).toBe(0)
    expect(isBlankFrame(null)).toBe(true)
    expect(resolveFullscreenMode()).toBe('none')
    expect(resolveWindowBootAction()).toEqual({ action: 'wait' })
    expect(typeof shouldQuitOnLastWindow()).toBe('boolean')
    expect(applyLinuxRuntimeSwitches()).toEqual({ applied: [] })
    expect(applyLinuxGraphicsSwitches()).toEqual({ applied: [] })
  })

  it('rebuilds relaunch argv without duplication', () => {
    expect(relaunchArgvWithGraphicsFallback('nope')).toEqual([GRAPHICS_FALLBACK_FLAG])
    expect(relaunchArgvWithGraphicsFallback(['openpos', GRAPHICS_FALLBACK_FLAG])).toEqual([
      GRAPHICS_FALLBACK_FLAG,
    ])
  })

  it('nudges invalid bounds to defaults', () => {
    expect(compositorNudgeBounds({})).toEqual({ x: undefined, y: undefined, width: 1200, height: 801 })
    expect(compositorNudgeBounds({ width: 'wide', height: -5, x: 1, y: 2 })).toEqual({
      x: 1,
      y: 2,
      width: 1200,
      height: 801,
    })
  })

  it('scores empty or tiny frames as blank', () => {
    expect(luminanceVariance(null, { width: 4, height: 4 })).toBe(0)
    expect(luminanceVariance(Buffer.alloc(4), { width: 1, height: 1 })).toBe(0)
    expect(isBlankFrame(null, {})).toBe(true)
    expect(isBlankFrame(Buffer.alloc(4), {})).toBe(true)
  })

  it('uses the default variance threshold', () => {
    const bitmap = solidBitmap(4, 4, [10, 10, 10])
    expect(isBlankFrame(bitmap, { width: 4, height: 4 })).toBe(true)
  })

  it('honors an explicit variance threshold', () => {
    const bitmap = solidBitmap(4, 4, [10, 10, 10])
    expect(isBlankFrame(bitmap, { width: 4, height: 4 }, { maxVariance: 0 })).toBe(true)
    expect(isBlankFrame(bitmap, { width: 4, height: 4 }, { maxVariance: -1 })).toBe(false)
  })

  it('skips linux switches off linux', () => {
    expect(applyLinuxRuntimeSwitches(null, { platform: 'darwin' })).toEqual({ applied: [] })
    expect(applyLinuxGraphicsSwitches(null, { platform: 'darwin', isPackaged: true })).toEqual({ applied: [] })
  })

  it('skips graphics switches in development without force', () => {
    const commandLine = { appendSwitch: () => {} }
    expect(applyLinuxGraphicsSwitches(commandLine, { platform: 'linux', isPackaged: false })).toEqual({ applied: [] })
    expect(applyLinuxGraphicsSwitches(commandLine, { platform: 'linux', isPackaged: true })).toEqual({
      applied: [],
      graphicsFallback: false,
    })
  })
})
