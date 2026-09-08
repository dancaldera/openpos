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

function shouldStartFullscreen({ isPackaged = false, argv = [], env = {} } = {}) {
  if (argvHasFlag(argv, '--windowed') || envIsTruthy(env.OPENPOS_WINDOWED)) {
    return false
  }

  if (argvHasFlag(argv, '--fullscreen') || envIsTruthy(env.OPENPOS_FULLSCREEN)) {
    return true
  }

  return Boolean(isPackaged)
}

/**
 * Creating BrowserWindow with fullscreen:true before the Linux compositor is
 * ready (login autostart) often yields a permanent white/blank window.
 * Start windowed, then apply fullscreen after the renderer has loaded.
 */
function shouldApplyFullscreenAfterLoad({ isPackaged = false, argv = [], env = {} } = {}) {
  return shouldStartFullscreen({ isPackaged, argv, env })
}

function resolveLinuxSessionSettleMs({
  isPackaged = false,
  platform = process.platform,
  env = {},
  displayWasDelayed = false,
} = {}) {
  if (platform !== 'linux' || !isPackaged) {
    return 0
  }

  const raw = typeof env.OPENPOS_SESSION_SETTLE_MS === 'string' ? env.OPENPOS_SESSION_SETTLE_MS.trim() : ''
  if (raw) {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed
    }
  }

  // Extra settle only when login/autostart started before a usable display.
  return displayWasDelayed ? 2000 : 0
}

function shouldDisableLinuxHardwareAcceleration({
  platform = process.platform,
  isPackaged = false,
  env = {},
} = {}) {
  if (platform !== 'linux' || !isPackaged) {
    return false
  }

  if (envIsTruthy(env.OPENPOS_FORCE_GPU)) {
    return false
  }

  // Older Intel GPUs + early-session Chromium often paint a blank window.
  return true
}

function fullscreenToggleAccelerator(platform = process.platform) {
  return platform === 'darwin' ? 'Control+Command+F' : 'F11'
}

function isFullscreenToggleInput(input, platform = process.platform) {
  if (!input || input.type !== 'keyDown' || input.isAutoRepeat) {
    return false
  }

  if (platform === 'darwin') {
    const key = String(input.key || '')
    return (key === 'f' || key === 'F')
      && Boolean(input.control)
      && Boolean(input.meta)
      && !input.alt
      && !input.shift
  }

  return input.key === 'F11'
}

module.exports = {
  fullscreenToggleAccelerator,
  isFullscreenToggleInput,
  resolveLinuxSessionSettleMs,
  shouldApplyFullscreenAfterLoad,
  shouldDisableLinuxHardwareAcceleration,
  shouldStartFullscreen,
}
