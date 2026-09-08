const GRAPHICS_FALLBACK_FLAG = '--openpos-graphics-fallback'
const DEFAULT_MAX_WINDOW_ATTEMPTS = 3
const DEFAULT_BOOT_TIMEOUT_MS = 6000
const DEFAULT_PAINT_SETTLE_MS = 450
const DEFAULT_DISPLAY_WAIT_MS = 12000
const DEFAULT_DELAYED_DISPLAY_SETTLE_MS = 2000

function argvHasFlag(argv, flag) {
  return Array.isArray(argv) && argv.includes(flag)
}

function envIsTruthy(value) {
  if (typeof value !== 'string') {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function parseMs(raw, fallback) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return fallback
  }

  const parsed = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function hasGraphicsFallbackFlag({ argv = [], env = {} } = {}) {
  return argvHasFlag(argv, GRAPHICS_FALLBACK_FLAG) || envIsTruthy(env.OPENPOS_GRAPHICS_FALLBACK)
}

function relaunchArgvWithGraphicsFallback(argv = []) {
  const next = Array.isArray(argv) ? argv.slice(1) : []
  if (!next.includes(GRAPHICS_FALLBACK_FLAG)) {
    next.push(GRAPHICS_FALLBACK_FLAG)
  }
  return next
}

function resolveBootTimeoutMs(env = {}) {
  return parseMs(env.OPENPOS_BOOT_TIMEOUT_MS, DEFAULT_BOOT_TIMEOUT_MS)
}

function resolvePaintSettleMs(env = {}) {
  return parseMs(env.OPENPOS_PAINT_SETTLE_MS, DEFAULT_PAINT_SETTLE_MS)
}

function resolveDisplayWaitMs(env = {}) {
  return parseMs(env.OPENPOS_DISPLAY_WAIT_MS, DEFAULT_DISPLAY_WAIT_MS)
}

function resolveDelayedDisplaySettleMs(env = {}) {
  return parseMs(env.OPENPOS_SESSION_SETTLE_MS, DEFAULT_DELAYED_DISPLAY_SETTLE_MS)
}

function isDisplayGeometryReady(display) {
  const size = display?.workAreaSize || display?.size
  return Boolean(size && size.width >= 640 && size.height >= 480)
}

function compositorNudgeBounds(bounds = {}) {
  const width = Number(bounds.width) || 0
  const height = Number(bounds.height) || 0
  return {
    x: bounds.x,
    y: bounds.y,
    width: width > 0 ? width : 1200,
    height: height > 0 ? height + 1 : 801,
  }
}

function luminanceVariance(bitmap, { width, height, sampleStride = 32 } = {}) {
  if (!bitmap || !bitmap.length || !width || !height) {
    return 0
  }

  const stride = Math.max(1, sampleStride)
  let count = 0
  let sum = 0
  let sumSquares = 0

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4
      const blue = bitmap[offset] || 0
      const green = bitmap[offset + 1] || 0
      const red = bitmap[offset + 2] || 0
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      count += 1
      sum += luminance
      sumSquares += luminance * luminance
    }
  }

  if (count < 2) {
    return 0
  }

  const mean = sum / count
  return Math.max(0, sumSquares / count - mean * mean)
}

function isBlankFrame(bitmap, size = {}, options = {}) {
  const width = size.width || 0
  const height = size.height || 0
  if (!bitmap || !bitmap.length || width < 2 || height < 2) {
    return true
  }

  const maxVariance = typeof options.maxVariance === 'number' ? options.maxVariance : 4
  return luminanceVariance(bitmap, { width, height, sampleStride: options.sampleStride }) <= maxVariance
}

function resolveFullscreenMode({
  wantFullscreen = false,
  attempt = 0,
  graphicsFallback = false,
} = {}) {
  if (!wantFullscreen || graphicsFallback || attempt >= 2) {
    return 'none'
  }

  if (attempt >= 1) {
    return 'maximize'
  }

  return 'fullscreen'
}

function isRendererCrashReason(reason) {
  return String(reason || '').includes('render-process-gone')
}

function resolveWindowBootAction({
  attempt = 0,
  maxAttempts = DEFAULT_MAX_WINDOW_ATTEMPTS,
  rendererPainted = false,
  loadFinished = false,
  timedOut = false,
  graphicsFallback = false,
  wantFullscreen = false,
  reason = '',
} = {}) {
  if (!timedOut && rendererPainted && loadFinished) {
    return {
      action: 'reveal',
      fullscreenMode: resolveFullscreenMode({ wantFullscreen, attempt, graphicsFallback }),
    }
  }

  if (!timedOut) {
    return { action: 'wait' }
  }

  const rendererCrash = isRendererCrashReason(reason)

  if (attempt + 1 < maxAttempts) {
    return {
      action: 'recreate',
      nextAttempt: attempt + 1,
      delayMs: rendererCrash ? 2000 * (attempt + 1) : 500 * (attempt + 1),
    }
  }

  // A /dev/shm renderer FATAL is not a GPU compositor bug. Relaunching with
  // extra graphics flags just crashes again before a window appears.
  if (!graphicsFallback && !rendererCrash) {
    return { action: 'relaunch-graphics-fallback' }
  }

  return { action: 'fail' }
}

function shouldQuitOnLastWindow({
  platform = process.platform,
  suppressLastWindowQuit = false,
} = {}) {
  if (suppressLastWindowQuit) {
    return false
  }

  return platform !== 'darwin'
}

function applyLinuxRuntimeSwitches(commandLine, {
  platform = process.platform,
  env = {},
} = {}) {
  const applied = []
  if (platform !== 'linux' || !commandLine || typeof commandLine.appendSwitch !== 'function') {
    return { applied }
  }

  if (envIsTruthy(env.OPENPOS_ALLOW_DEV_SHM)) {
    return { applied }
  }

  // Chromium FATALS on some /dev/shm mounts (usrquota, noexec, early login).
  // Use /tmp instead so the renderer can start.
  commandLine.appendSwitch('disable-dev-shm-usage')
  applied.push('disable-dev-shm-usage')
  return { applied }
}

function applyLinuxGraphicsSwitches(commandLine, {
  platform = process.platform,
  isPackaged = false,
  env = {},
  argv = [],
} = {}) {
  const applied = []
  if (platform !== 'linux' || !commandLine || typeof commandLine.appendSwitch !== 'function') {
    return { applied }
  }

  if (!isPackaged && !envIsTruthy(env.OPENPOS_FORCE_SOFTWARE_RENDERING)) {
    return { applied }
  }

  const graphicsFallback = hasGraphicsFallbackFlag({ argv, env })

  // Keep first launch close to disableHardwareAcceleration() only.
  // Forcing ozone x11 on Wayland or extra Chromium GPU flags can exit
  // before a window appears. Stronger switches are fallback-only.
  if (graphicsFallback && !envIsTruthy(env.OPENPOS_FORCE_GPU)) {
    commandLine.appendSwitch('disable-gpu')
    commandLine.appendSwitch('disable-gpu-compositing')
    commandLine.appendSwitch('in-process-gpu')
    applied.push('disable-gpu', 'disable-gpu-compositing', 'in-process-gpu')
  }

  return { applied, graphicsFallback }
}

module.exports = {
  DEFAULT_MAX_WINDOW_ATTEMPTS,
  GRAPHICS_FALLBACK_FLAG,
  applyLinuxGraphicsSwitches,
  applyLinuxRuntimeSwitches,
  compositorNudgeBounds,
  hasGraphicsFallbackFlag,
  isBlankFrame,
  isDisplayGeometryReady,
  isRendererCrashReason,
  luminanceVariance,
  relaunchArgvWithGraphicsFallback,
  shouldQuitOnLastWindow,
  resolveBootTimeoutMs,
  resolveDelayedDisplaySettleMs,
  resolveDisplayWaitMs,
  resolveFullscreenMode,
  resolvePaintSettleMs,
  resolveWindowBootAction,
}
