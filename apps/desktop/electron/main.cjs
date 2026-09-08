const { app, BrowserWindow, ipcMain, shell, nativeImage, Menu, nativeTheme, screen } = require('electron')
const bcrypt = require('bcryptjs')
const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const {
  createPublicConnectionConfig,
  desktopFirstRunNeedsApiSetup,
  normalizeDesktopApiUrl,
  resetDesktopRuntimeConfig,
  resolveDesktopConnectionConfig,
  resolveDesktopRuntimeConfigPath,
  writeDesktopRuntimeConfig,
} = require('./config-resolver.cjs')
const { formatPrinterCommandError, resolvePrinterConfig } = require('./printer-config.cjs')
const { isLegacyLocalImageKey } = require('./product-image-keys.cjs')
const { createSyncManager, ensureLocalSyncSchema, resetLocalDatabase } = require('@openpos/sync')
const {
  adoptLegacyLocalDatabase,
  clearActiveConnection,
  getConnectionDbPath,
  publicEnvelope,
  readActiveConnection,
  readEnvelope,
  registerPayloadFromEnvelope,
  resetLocalDevice,
  revealSeed,
  unwrapSecret,
  wrapSecret,
  writeActiveConnection,
  writeEnvelope,
} = require('./connection-store.cjs')
const {
  attachRemoteStore,
  bootstrapLocalOwner,
  createLocalStore,
  joinLocalStore,
  seedBoundLocalStore,
} = require('./connection-local.cjs')
const {
  assertUpdateFilePath,
  buildDebInstallCommands,
  buildDebRestartCommand,
  resolveMacAppBundlePath,
  resolveUpdateDownloadFileName,
  resolveUpdateFormat,
} = require('./update-installer.cjs')
const { registerSingleInstance } = require('./app-lifecycle.cjs')
const {
  fullscreenToggleAccelerator,
  isFullscreenToggleInput,
  resolveLinuxSessionSettleMs,
  shouldApplyFullscreenAfterLoad,
  shouldDisableLinuxHardwareAcceleration,
  shouldStartFullscreen,
} = require('./window-mode.cjs')
const {
  applyLinuxGraphicsSwitches,
  compositorNudgeBounds,
  hasGraphicsFallbackFlag,
  isDisplayGeometryReady,
  resolveBootTimeoutMs,
  resolveDisplayWaitMs,
  resolvePaintSettleMs,
  resolveWindowBootAction,
  shouldQuitOnLastWindow,
  applyLinuxRuntimeSwitches,
} = require('./window-boot.cjs')

const pkg = require('../package.json')

if (process.platform === 'linux') {
  // Chromium's user-namespace sandbox sets NO_NEW_PRIVS, which makes pkexec
  // report "must be setuid root" and blocks Debian in-app updates.
  app.commandLine.appendSwitch('no-sandbox')
}

applyLinuxRuntimeSwitches(app.commandLine, {
  platform: process.platform,
  env: process.env,
})

if (
  shouldDisableLinuxHardwareAcceleration({
    platform: process.platform,
    isPackaged: app.isPackaged,
    env: process.env,
  })
) {
  app.disableHardwareAcceleration()
}

applyLinuxGraphicsSwitches(app.commandLine, {
  platform: process.platform,
  isPackaged: app.isPackaged,
  env: process.env,
  argv: process.argv,
})

// Ensure userData resolves to 'OpenPOS' in dev mode, not the npm package name
app.setName('OpenPOS')

let mainWindow = null
let isRecreatingWindow = false
let suppressLastWindowQuit = true
let rendererSignalHandler = null
let db = null
let syncManager = null
let initialSyncPromise = null
let initialSyncError = null
let ownerBootstrapNeeded = false
let cachedRemoteClient = null
let cachedRemoteConfigKey = null
let cachedRemoteConnectModule = null
const hasSingleInstanceLock = registerSingleInstance(app, () => mainWindow)
const ORDER_COLUMNS = [
  'id',
  'subtotal',
  'tax',
  'total',
  'status',
  'payment_method',
  'notes',
  'created_at',
  'updated_at',
  'completed_at',
  'user_id',
  'customer_id',
]
const ORDER_ITEM_COLUMNS = [
  'id',
  'order_id',
  'product_id',
  'product_name',
  'quantity',
  'unit_price',
  'total_price',
  'variant_id',
  'variant_attributes',
  'created_at',
  'updated_at',
]
const UPDATE_TEMP_DIR_NAME = 'openpos-updates'
const PRODUCT_IMAGES_DIR_NAME = 'product-images'
const MIME_BY_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }

function getProductImagesDir() {
  return path.join(app.getPath('userData'), PRODUCT_IMAGES_DIR_NAME)
}

function logStartup(message, details) {
  if (details === undefined) {
    console.log(`[startup] ${message}`)
    return
  }

  console.log(`[startup] ${message}`, details)
}

function logOrderSync(message, details) {
  if (details === undefined) {
    console.log(`[order-sync] ${message}`)
    return
  }

  console.log(`[order-sync] ${message}`, details)
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`
}

function quoteColumns(columns) {
  return columns.map((column) => quoteIdentifier(column)).join(', ')
}

function isDev() {
  return !app.isPackaged
}

function getRendererUrl() {
  return process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420'
}

function getIndexHtmlPath() {
  return path.join(__dirname, '..', 'dist', 'index.html')
}

function getAppImageInstallPath() {
  return path.join(app.getPath('home'), '.local', 'bin', 'openpos')
}

function getIconsDir() {
  const candidates = [
    path.join(__dirname, 'build', 'icons'),
    path.join(process.resourcesPath, 'electron', 'build', 'icons'),
    path.join(process.resourcesPath, 'app.asar', 'electron', 'build', 'icons'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'build', 'icons'),
  ]

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]
}

function getIconPath(kind = 'window') {
  const iconsDir = getIconsDir()

  if (process.platform === 'darwin') {
    return path.join(iconsDir, kind === 'dock' ? 'icon.icns' : 'icon.png')
  }

  return path.join(iconsDir, process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

function setAppIcon() {
  if (process.platform !== 'darwin' || typeof app.dock?.setIcon !== 'function') {
    return
  }

  const dockIconPath = getIconPath('dock')
  if (!fs.existsSync(dockIconPath)) {
    return
  }

  const dockIcon = nativeImage.createFromPath(dockIconPath)
  if (!dockIcon.isEmpty()) {
    app.dock.setIcon(dockIcon)
  }
}

// Escape hatch for the sign-in screen: wipes the local runtime config
// (API URL, database, printer settings). Only the operator holding this
// key can trigger it — change it here if it ever needs to rotate.
const SETTINGS_RESET_KEY = 'OpenPOS-Local-Reset-2026'

function getUserDataConfigPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function getRuntimeConfigSelection() {
  return resolveDesktopRuntimeConfigPath({
    homeDir: app.getPath('home'),
    userDataPath: app.getPath('userData'),
    platform: process.platform,
    fileExists: (candidatePath) => fs.existsSync(candidatePath),
  })
}

function getDbPath() {
  const userDataPath = app.getPath('userData')
  const active = readActiveConnection(userDataPath)
  if (active?.key) {
    return getConnectionDbPath(userDataPath, active.key)
  }

  return path.join(userDataPath, 'postpos.db')
}

function getActiveEnvelope() {
  const userDataPath = app.getPath('userData')
  const active = readActiveConnection(userDataPath)
  if (!active?.key) return { active: null, envelope: null }
  return {
    active,
    envelope: readEnvelope(userDataPath, active.key),
  }
}

function getUpdateTempDir() {
  return path.join(app.getPath('temp'), UPDATE_TEMP_DIR_NAME)
}

function emitUpdateStatus(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send('desktop:update-status', payload)
}

function ensureHttpsUrl(url) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') {
    throw new Error('Only https: URLs allowed')
  }

  return parsed
}

function getUpdateFormat() {
  return resolveUpdateFormat({
    platform: process.platform,
    env: process.env,
    readFileSync: fs.readFileSync,
    isPackaged: app.isPackaged,
    exePath: app.getPath('exe'),
  })
}

async function downloadUpdateAsset(downloadUrl, version, format, expectedSha256) {
  const fileName = resolveUpdateDownloadFileName(downloadUrl, version, process.arch, format)
  const tempDir = getUpdateTempDir()
  const tempPath = path.join(tempDir, fileName)

  await fs.promises.mkdir(tempDir, { recursive: true })

  const response = await fetch(downloadUrl, {
    headers: {
      Accept: 'application/octet-stream',
    },
  })

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download update (${response.status})`)
  }

  const totalBytes = Number.parseInt(response.headers.get('content-length') || '0', 10)
  const reader = response.body.getReader()
  const fileHandle = await fs.promises.open(tempPath, 'w')
  let receivedBytes = 0
  const hash = expectedSha256 ? crypto.createHash('sha256') : null

  emitUpdateStatus({ phase: 'downloading', progress: 0 })

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      if (value) {
        await fileHandle.write(value)
        receivedBytes += value.length
        if (hash) hash.update(value)

        if (totalBytes > 0) {
          emitUpdateStatus({
            phase: 'downloading',
            progress: Math.min(100, Math.round((receivedBytes / totalBytes) * 100)),
          })
        } else {
          emitUpdateStatus({ phase: 'downloading', progress: null })
        }
      }
    }
  } catch (error) {
    await fileHandle.close()
    await fs.promises.rm(tempPath, { force: true })
    throw error
  }

  await fileHandle.close()
  if (hash && hash.digest('hex').toLowerCase() !== expectedSha256.toLowerCase()) {
    await fs.promises.rm(tempPath, { force: true })
    throw new Error('Downloaded update failed SHA-256 verification')
  }
  if (format === 'appimage') {
    await fs.promises.chmod(tempPath, 0o755)
  }
  emitUpdateStatus({ phase: 'downloaded', filePath: tempPath, progress: 100 })
  return { filePath: tempPath }
}

async function downloadAppImageUpdate(downloadUrl, version, expectedSha256) {
  if (process.platform !== 'linux') {
    throw new Error('In-app AppImage updates are only supported on Linux')
  }

  return downloadUpdateAsset(downloadUrl, version, 'appimage', expectedSha256)
}

async function downloadDebUpdate(downloadUrl, version, expectedSha256) {
  if (getUpdateFormat() !== 'deb') {
    throw new Error('In-app Debian package updates are only supported on Debian-family Linux')
  }

  return downloadUpdateAsset(downloadUrl, version, 'deb', expectedSha256)
}

async function downloadMacZipUpdate(downloadUrl, version, expectedSha256) {
  if (process.platform !== 'darwin') {
    throw new Error('In-app macOS updates are only supported on macOS')
  }

  return downloadUpdateAsset(downloadUrl, version, 'mac-zip', expectedSha256)
}

function runCommand(command, args, env, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: options.replaceEnv ? env : { ...process.env, ...env },
    })
    let stderr = ''

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code}`))
    })
  })
}

async function installDownloadedAppImage(tempPath) {
  if (process.platform !== 'linux') {
    throw new Error('In-app AppImage updates are only supported on Linux')
  }

  if (!tempPath || !fs.existsSync(tempPath)) {
    throw new Error('Downloaded AppImage was not found')
  }

  const resolvedTempPath = assertUpdateFilePath({
    tempDir: getUpdateTempDir(),
    filePath: tempPath,
    format: 'appimage',
  })

  const installPath = getAppImageInstallPath()
  const installDir = path.dirname(installPath)
  const stagedPath = `${installPath}.new`

  emitUpdateStatus({ phase: 'installing' })

  try {
    await fs.promises.mkdir(installDir, { recursive: true })
    await fs.promises.copyFile(resolvedTempPath, stagedPath)
    await fs.promises.chmod(stagedPath, 0o755)
    await fs.promises.rename(stagedPath, installPath)
  } catch (error) {
    await fs.promises.rm(stagedPath, { force: true }).catch(() => {})
    throw error
  }
}

async function installDownloadedDeb(tempPath) {
  if (process.platform !== 'linux') {
    throw new Error('In-app Debian package updates are only supported on Linux')
  }

  if (getUpdateFormat() !== 'deb') {
    throw new Error('In-app Debian package updates are only supported on Debian-family Linux')
  }

  if (!tempPath || !fs.existsSync(tempPath)) {
    throw new Error('Downloaded Debian package was not found')
  }

  const resolvedTempPath = assertUpdateFilePath({
    tempDir: getUpdateTempDir(),
    filePath: tempPath,
    format: 'deb',
  })
  const commands = buildDebInstallCommands({
    debPath: resolvedTempPath,
    isRoot: typeof process.getuid === 'function' && process.getuid() === 0,
    availableCommands: {
      pkcon: fs.existsSync('/usr/bin/pkcon'),
      pkexec: fs.existsSync('/usr/bin/pkexec'),
    },
    processEnv: process.env,
  })

  if (commands.length === 0) {
    throw new Error(
      `Could not find pkcon or pkexec. Install the package from a terminal:\n  sudo apt install -y '${resolvedTempPath}'`,
    )
  }

  emitUpdateStatus({ phase: 'installing' })

  const errors = []
  for (const { command, args, env } of commands) {
    try {
      await runCommand(command, args, env, { replaceEnv: true })
      await delay(1500)
      return
    } catch (error) {
      errors.push(`${command}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(
    [
      'Could not install the Debian update with elevated privileges.',
      ...errors,
      `Install it from a terminal, then reopen OpenPOS:`,
      `  sudo apt install -y '${resolvedTempPath}'`,
    ].join('\n'),
  )
}

async function restartFromInstalledAppImage() {
  if (process.platform !== 'linux') {
    throw new Error('In-app AppImage updates are only supported on Linux')
  }

  const installPath = getAppImageInstallPath()

  if (!fs.existsSync(installPath)) {
    throw new Error(`Installed AppImage not found at ${installPath}`)
  }

  const child = spawn(installPath, [], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  app.exit(0)
}

function restartFromInstalledDeb() {
  if (process.platform !== 'linux') {
    throw new Error('In-app Debian package updates are only supported on Linux')
  }

  // After apt replaces /opt/OpenPOS, app.relaunch() can restart into a blank
  // window. Spawn a fresh process from the installed binary instead.
  const exePath = fs.existsSync('/usr/bin/openpos') ? '/usr/bin/openpos' : process.execPath
  const childArgs = []
  if (
    shouldStartFullscreen({
      isPackaged: app.isPackaged,
      argv: process.argv,
      env: process.env,
    })
  ) {
    childArgs.push('--fullscreen')
  }

  const restart = buildDebRestartCommand({
    currentPid: process.pid,
    exePath,
    args: childArgs,
  })
  const restartEnv = { ...process.env }
  delete restartEnv.ELECTRON_RUN_AS_NODE

  const child = spawn(restart.command, restart.args, {
    detached: true,
    stdio: 'ignore',
    env: restartEnv,
  })
  child.unref()

  // app.quit() lets Electron properly terminate child processes (GPU,
  // renderer, utility) before exiting. app.exit(0) skips cleanup and
  // leaves orphaned processes that cause white screens on restart.
  const forceExitTimer = setTimeout(() => app.exit(0), 5000)
  forceExitTimer.unref()
  app.quit()
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForLinuxGraphicsReady() {
  if (process.platform !== 'linux' || !app.isPackaged) {
    return
  }

  const waitMs = resolveDisplayWaitMs(process.env)
  let displayWasDelayed = false
  try {
    displayWasDelayed = !isDisplayGeometryReady(screen.getPrimaryDisplay())
  } catch {
    displayWasDelayed = true
  }

  if (displayWasDelayed) {
    logStartup('waiting for display geometry', { waitMs })
    const started = Date.now()
    while (Date.now() - started < waitMs) {
      try {
        if (isDisplayGeometryReady(screen.getPrimaryDisplay())) {
          break
        }
      } catch {
        // Session compositor is not publishing a display yet.
      }
      await delay(200)
    }
  }

  const settleMs = resolveLinuxSessionSettleMs({
    isPackaged: app.isPackaged,
    platform: process.platform,
    env: process.env,
    displayWasDelayed,
  })
  if (settleMs > 0) {
    logStartup('waiting for Linux session settle', { settleMs, displayWasDelayed })
    await delay(settleMs)
  }
}

function relaunchForGraphicsFallback() {
  logStartup('relaunching with graphics fallback')
  process.env.OPENPOS_GRAPHICS_FALLBACK = '1'
  app.relaunch()
  app.exit(0)
}

function loadRenderer(win) {
  if (isDev()) {
    return win.loadURL(getRendererUrl())
  }

  return win.loadFile(getIndexHtmlPath())
}

function applyWindowPresentation(win, mode) {
  if (!win || win.isDestroyed()) {
    return
  }

  if (mode === 'fullscreen' && !win.isFullScreen()) {
    win.setFullScreen(true)
    return
  }

  if (mode === 'maximize' && !win.isMaximized()) {
    win.maximize()
  }
}

function nudgeCompositor(win) {
  if (!win || win.isDestroyed()) {
    return
  }

  if (typeof win.webContents.invalidate === 'function') {
    win.webContents.invalidate()
  }

  const bounds = win.getBounds()
  win.setBounds(compositorNudgeBounds(bounds))
  setTimeout(() => {
    if (win && !win.isDestroyed()) {
      win.setBounds(bounds)
    }
  }, 50)
}

function loadRendererFailureHtml(errorMessage) {
  const safeMessage = String(errorMessage || 'Unknown renderer load error')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>OpenPOS</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #fff; color: #111; }
  main { max-width: 28rem; padding: 1.5rem; text-align: center; }
  button { margin-top: 1rem; padding: 0.6rem 1rem; font-size: 1rem; cursor: pointer; }
</style></head>
<body><main>
  <h1>OpenPOS failed to load</h1>
  <p>${safeMessage}</p>
  <p>Close and reopen the app, or retry.</p>
  <button onclick="location.reload()">Retry</button>
</main></body></html>`
}

async function installDownloadedMacZip(tempPath) {
  if (process.platform !== 'darwin') {
    throw new Error('In-app macOS updates are only supported on macOS')
  }

  if (!tempPath || !fs.existsSync(tempPath)) {
    throw new Error('Downloaded update archive was not found')
  }

  const resolvedTempPath = assertUpdateFilePath({
    tempDir: getUpdateTempDir(),
    filePath: tempPath,
    format: 'mac-zip',
  })

  const targetAppPath = resolveMacAppBundlePath(app.getPath('exe'))
  if (!targetAppPath) {
    throw new Error('OpenPOS is not running from an installed .app bundle')
  }

  emitUpdateStatus({ phase: 'installing' })

  // ditto preserves symlinks and permissions; plain unzip libraries break .app bundles
  const extractDir = path.join(getUpdateTempDir(), 'extracted')
  await fs.promises.rm(extractDir, { recursive: true, force: true })
  await fs.promises.mkdir(extractDir, { recursive: true })
  await runCommand('ditto', ['-x', '-k', resolvedTempPath, extractDir])

  const entries = await fs.promises.readdir(extractDir)
  const appName = entries.find((entry) => entry.endsWith('.app'))
  if (!appName) {
    throw new Error('Update archive does not contain an app bundle')
  }
  const newAppPath = path.join(extractDir, appName)

  await runCommand('xattr', ['-dr', 'com.apple.quarantine', newAppPath]).catch(() => {})

  // Renaming a running .app bundle is allowed on macOS
  const backupPath = `${targetAppPath}.update-backup`
  await fs.promises.rm(backupPath, { recursive: true, force: true })
  await fs.promises.rename(targetAppPath, backupPath)

  try {
    try {
      await fs.promises.rename(newAppPath, targetAppPath)
    } catch (error) {
      if (error && error.code === 'EXDEV') {
        await runCommand('ditto', [newAppPath, targetAppPath])
      } else {
        throw error
      }
    }
  } catch (error) {
    await fs.promises.rename(backupPath, targetAppPath).catch(() => {})
    throw error
  }

  await fs.promises.rm(backupPath, { recursive: true, force: true }).catch(() => {})
}

async function restartFromUpdatedMacApp() {
  if (process.platform !== 'darwin') {
    throw new Error('In-app macOS updates are only supported on macOS')
  }

  app.relaunch()
  app.exit(0)
}

function getBootstrapDbPath() {
  try {
    const packageRoot = path.dirname(require.resolve('@openpos/data/package.json'))
    return path.join(packageRoot, 'assets', 'openpos-bootstrap.sqlite')
  } catch {
    return null
  }
}

function parseJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

function parseEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const values = {}

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) {
        continue
      }

      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) {
        continue
      }

      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
      values[key] = value
    }

    return values
  } catch {
    return {}
  }
}

function getDotEnvConfig() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '..', '.env'),
    path.join(process.cwd(), '..', '.env.local'),
    path.join(process.cwd(), '..', '..', '.env'),
    path.join(process.cwd(), '..', '..', '.env.local'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '..', '.env.local'),
    path.join(__dirname, '..', '..', '..', '.env'),
  ]

  const mergedConfig = {}

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      Object.assign(mergedConfig, parseEnvFile(candidate))
    }
  }

  return mergedConfig
}

function getRuntimeConfig() {
  const selection = getRuntimeConfigSelection()
  return {
    config: selection.exists ? parseJsonFile(selection.path) : {},
    configPath: selection.path,
    configSource: selection.source,
  }
}

function resolveConnectionConfig() {
  const runtimeConfig = getRuntimeConfig()
  const { envelope } = getActiveEnvelope()
  return resolveDesktopConnectionConfig({
    runtimeConfig: runtimeConfig.config,
    runtimeConfigSource: runtimeConfig.configSource,
    configPath: runtimeConfig.configPath,
    processEnv: process.env,
    envConfig: getDotEnvConfig(),
    defaultApiUrl: isDev() ? 'http://localhost:3001' : undefined,
    requireApiSetup: process.env.OPENPOS_REQUIRE_API_SETUP === '1',
    connectionRemote: envelope
      ? {
          url: envelope.url,
          authToken: envelope.authToken,
        }
      : {},
  })
}

function getDbConnectionConfig() {
  return resolveConnectionConfig().remote
}

function getApiConnectionConfig() {
  return resolveConnectionConfig().api
}

async function probeApiConnection() {
  const apiConfig = getApiConnectionConfig()
  const checkedAt = new Date().toISOString()

  if (!apiConfig.configured || !apiConfig.url) {
    return {
      ...createPublicConnectionConfig({ api: apiConfig, remote: getDbConnectionConfig() }),
      apiReachable: false,
      apiLastCheckedAt: checkedAt,
      apiLastError: null,
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 3_000)

  try {
    const healthUrl = new URL('/api/health', apiConfig.url).toString()
    const response = await fetch(healthUrl, { signal: controller.signal })

    if (!response.ok) {
      throw new Error(`API health check failed with ${response.status}`)
    }

    return {
      ...createPublicConnectionConfig({ api: apiConfig, remote: getDbConnectionConfig() }),
      apiReachable: true,
      apiLastCheckedAt: checkedAt,
      apiLastError: null,
    }
  } catch (error) {
    return {
      ...createPublicConnectionConfig({ api: apiConfig, remote: getDbConnectionConfig() }),
      apiReachable: false,
      apiLastCheckedAt: checkedAt,
      apiLastError:
        error instanceof Error && error.name === 'AbortError'
          ? 'API health check timed out after 3 seconds'
          : error instanceof TypeError
            ? 'Cannot reach the API server. Check the API URL and network connection.'
            : error instanceof Error
              ? error.message
              : String(error),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function getConnectivitySnapshot(options = {}) {
  if (options.refresh) {
    await syncManager.triggerSync({ foreground: true })
  }

  const apiSnapshot = await probeApiConnection()
  const syncSnapshot = syncManager.getStatusSnapshot()

  return {
    ...syncSnapshot,
    ...apiSnapshot,
  }
}

function getActiveUserCount(database = ensureDatabase()) {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL`).get()
  return Number(row?.count ?? 0)
}

function closeDatabase() {
  if (syncManager) {
    syncManager.stop()
  }
  if (db) {
    db.close()
    db = null
  }
  cachedRemoteClient = null
  cachedRemoteConfigKey = null
}

function startSyncIfPossible() {
  if (syncManager && readActiveConnection(app.getPath('userData'))) {
    syncManager.start()
  }
}

function bindConnection(result, options = {}) {
  const userDataPath = app.getPath('userData')
  closeDatabase()
  writeEnvelope(userDataPath, {
    key: result.key,
    storeName: result.storeName,
    url: result.dataPlane.url,
    authToken: result.dataPlane.authToken,
    seed: result.seed,
    published: result.published,
  })
  writeActiveConnection(userDataPath, {
    key: result.key,
    emergencyKitConfirmed: Boolean(options.emergencyKitConfirmed),
  })
  if (options.adoptLegacy) {
    adoptLegacyLocalDatabase(userDataPath, result.key)
  }
  ensureDatabase()
  if (!options.adoptLegacy) {
    resetLocalDatabase(db)
  }
  startSyncIfPossible()
}

function getFirstRunStatus(database = db) {
  const { active, envelope } = getActiveEnvelope()
  const remoteConfig = getDbConnectionConfig()
  const apiConfig = getApiConnectionConfig()
  const syncSnapshot = syncManager && database ? syncManager.getStatusSnapshot(database) : null
  const activeUserCount = database ? getActiveUserCount(database) : 0
  const apiFields = {
    apiUrl: apiConfig.url || '',
    apiConfigured: Boolean(apiConfig.configured),
  }

  const finish = (status) => {
    const nextStatus = { ...apiFields, ...status }
    logStartup('first-run status resolved', nextStatus)
    return nextStatus
  }

  if (!envelope) {
    return finish({
      status: 'needsConnection',
      remoteConfigured: Boolean(remoteConfig.configured),
      activeUserCount: 0,
      lastError: null,
      lastCheckedAt: syncSnapshot?.lastCheckedAt ?? null,
      lastSyncedAt: syncSnapshot?.lastSyncedAt ?? null,
    })
  }

  const readyDatabase = database || ensureDatabase()
  const users = getActiveUserCount(readyDatabase)
  const readySnapshot = syncManager ? syncManager.getStatusSnapshot(readyDatabase) : syncSnapshot

  if (!active?.emergencyKitConfirmed) {
    return finish({
      status: 'needsEmergencyKit',
      remoteConfigured: true,
      activeUserCount: users,
      connectionKey: envelope.key,
      storeName: envelope.storeName,
      lastError: null,
      lastCheckedAt: readySnapshot?.lastCheckedAt ?? null,
      lastSyncedAt: readySnapshot?.lastSyncedAt ?? null,
    })
  }

  if (
    desktopFirstRunNeedsApiSetup({
      hasConnection: true,
      emergencyKitConfirmed: true,
      apiConfigured: Boolean(apiConfig.configured),
    })
  ) {
    return finish({
      status: 'needsApi',
      remoteConfigured: true,
      activeUserCount: users,
      connectionKey: envelope.key,
      storeName: envelope.storeName,
      lastError: null,
      lastCheckedAt: readySnapshot?.lastCheckedAt ?? null,
      lastSyncedAt: readySnapshot?.lastSyncedAt ?? null,
    })
  }

  if (users > 0) {
    initialSyncError = null
    ownerBootstrapNeeded = false
    return finish({
      status: 'readyForSignIn',
      remoteConfigured: true,
      activeUserCount: users,
      connectionKey: envelope.key,
      storeName: envelope.storeName,
      lastError: null,
      lastCheckedAt: readySnapshot?.lastCheckedAt ?? null,
      lastSyncedAt: readySnapshot?.lastSyncedAt ?? null,
    })
  }

  if (initialSyncPromise || readySnapshot?.status === 'syncing') {
    return finish({
      status: 'syncingInitialData',
      remoteConfigured: true,
      activeUserCount: users,
      connectionKey: envelope.key,
      storeName: envelope.storeName,
      lastError: null,
      lastCheckedAt: readySnapshot?.lastCheckedAt ?? null,
      lastSyncedAt: readySnapshot?.lastSyncedAt ?? null,
    })
  }

  if (ownerBootstrapNeeded) {
    return finish({
      status: 'needsOwner',
      remoteConfigured: true,
      activeUserCount: users,
      connectionKey: envelope.key,
      storeName: envelope.storeName,
      lastError: null,
      lastCheckedAt: readySnapshot?.lastCheckedAt ?? null,
      lastSyncedAt: readySnapshot?.lastSyncedAt ?? null,
    })
  }

  if (initialSyncError) {
    return finish({
      status: 'initialSyncFailed',
      remoteConfigured: true,
      activeUserCount: users,
      connectionKey: envelope.key,
      storeName: envelope.storeName,
      lastError: initialSyncError,
      lastCheckedAt: readySnapshot?.lastCheckedAt ?? null,
      lastSyncedAt: readySnapshot?.lastSyncedAt ?? null,
    })
  }

  return finish({
    status: 'syncingInitialData',
    remoteConfigured: true,
    activeUserCount: users,
    connectionKey: envelope.key,
    storeName: envelope.storeName,
    lastError: null,
    lastCheckedAt: readySnapshot?.lastCheckedAt ?? null,
    lastSyncedAt: readySnapshot?.lastSyncedAt ?? null,
  })
}

async function initializeFirstRun() {
  const status = getFirstRunStatus()
  logStartup('initialize first run requested', {
    status: status.status,
    activeUserCount: status.activeUserCount,
    remoteConfigured: status.remoteConfigured,
  })

  // An imported remote store may already have its owner in Turso. Run the
  // initial sync before deciding an owner is needed, so locally-empty
  // databases get populated from the remote instead of blocking onboarding.
  const remoteConfiguredForOwnerSync = Boolean(getDbConnectionConfig().configured)

  if (
    status.status === 'readyForSignIn' ||
    status.status === 'needsEmergencyKit' ||
    status.status === 'needsConnection' ||
    (status.status === 'needsOwner' && !remoteConfiguredForOwnerSync) ||
    status.status === 'needsApi'
  ) {
    return status
  }

  if (initialSyncPromise) {
    logStartup('initial sync already in progress')
    return initialSyncPromise
  }

  initialSyncError = null

  initialSyncPromise = (async () => {
    let resolvedStatus = null

    try {
      logStartup('starting initial sync', {
        dbPath: getDbPath(),
        remoteConfigured: getDbConnectionConfig().configured,
        activeUserCountBefore: getActiveUserCount(),
      })
      const syncSnapshot = await syncManager.triggerSync({ foreground: true, force: true })
      logStartup('initial sync finished', syncSnapshot)

      if (getActiveUserCount() > 0) {
        initialSyncError = null
        ownerBootstrapNeeded = false
        logStartup('initial sync populated local users', { activeUserCount: getActiveUserCount() })
        resolvedStatus = getFirstRunStatus()
      } else {
        initialSyncError = null
        ownerBootstrapNeeded = true
        logStartup('initial sync completed without local users', {
          activeUserCount: getActiveUserCount(),
        })
      }
    } catch (error) {
      initialSyncError = error instanceof Error ? error.message : String(error)
      logStartup('initial sync threw error', {
        error: initialSyncError,
      })
    } finally {
      logStartup('initial sync promise cleared')
      initialSyncPromise = null
    }

    return resolvedStatus ?? getFirstRunStatus()
  })()

  return initialSyncPromise
}

function ensureLegacyCompatibility(database) {
  ensureLocalSyncSchema(database)
}

async function getRemoteDbClient() {
  const config = getDbConnectionConfig()

  if (!config.configured || !config.url || !config.authToken) {
    cachedRemoteClient = null
    cachedRemoteConfigKey = null
    return null
  }

  const configKey = `${config.url}:${config.authToken}`

  if (cachedRemoteClient && cachedRemoteConfigKey === configKey) {
    return cachedRemoteClient
  }

  if (!cachedRemoteConnectModule) {
    cachedRemoteConnectModule = (await import('@libsql/client')).createClient
  }

  cachedRemoteClient = cachedRemoteConnectModule({
    url: config.url,
    authToken: config.authToken,
  })
  cachedRemoteConfigKey = configKey
  return cachedRemoteClient
}

function upsertOrderSyncQueue(database, orderId, operation, lastError = null) {
  const now = new Date().toISOString()

  database
    .prepare(
      `INSERT INTO order_sync_queue (order_id, operation, attempts, last_error, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET
         operation = excluded.operation,
         attempts = order_sync_queue.attempts + 1,
         last_error = excluded.last_error,
         updated_at = excluded.updated_at`,
    )
    .run(String(orderId), operation, lastError, now, now)
}

function ensureOrderSyncQueue(database, orderId, operation) {
  const now = new Date().toISOString()

  database
    .prepare(
      `INSERT INTO order_sync_queue (order_id, operation, attempts, last_error, created_at, updated_at)
       VALUES (?, ?, 0, NULL, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET
         operation = excluded.operation,
         updated_at = excluded.updated_at`,
    )
    .run(String(orderId), operation, now, now)
}

function clearOrderSyncQueue(database, orderId) {
  database.prepare('DELETE FROM order_sync_queue WHERE order_id = ?').run(String(orderId))
}

function getLocalOrderAggregate(database, orderId) {
  const order = database
    .prepare(`SELECT ${quoteColumns(ORDER_COLUMNS)} FROM orders WHERE id = ? LIMIT 1`)
    .get(Number(orderId))

  const items = database
    .prepare(
      `SELECT ${quoteColumns(ORDER_ITEM_COLUMNS)}
         FROM order_items
        WHERE order_id = ?
        ORDER BY id ASC`,
    )
    .all(Number(orderId))

  return { order, items }
}

async function applyRemoteOrderAggregate(client, database, orderId, operation) {
  const numericOrderId = Number(orderId)

  if (operation === 'DELETE') {
    await client.execute('DELETE FROM order_items WHERE order_id = ?', [numericOrderId])
    await client.execute('DELETE FROM orders WHERE id = ?', [numericOrderId])
    return
  }

  const { order, items } = getLocalOrderAggregate(database, orderId)

  if (!order) {
    throw new Error(`Local order ${orderId} not found for remote aggregate sync`)
  }

  const orderAssignments = ORDER_COLUMNS.filter((column) => column !== 'id')
    .map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`)
    .join(', ')
  const orderPlaceholders = ORDER_COLUMNS.map(() => '?').join(', ')

  await client.execute(
    `INSERT INTO orders (${quoteColumns(ORDER_COLUMNS)})
     VALUES (${orderPlaceholders})
     ON CONFLICT(${quoteIdentifier('id')}) DO UPDATE SET ${orderAssignments}`,
    ORDER_COLUMNS.map((column) => order[column] ?? null),
  )

  await client.execute('DELETE FROM order_items WHERE order_id = ?', [numericOrderId])

  const itemPlaceholders = ORDER_ITEM_COLUMNS.map(() => '?').join(', ')
  for (const item of items) {
    await client.execute(
      `INSERT INTO order_items (${quoteColumns(ORDER_ITEM_COLUMNS)})
       VALUES (${itemPlaceholders})`,
      ORDER_ITEM_COLUMNS.map((column) => item[column] ?? null),
    )
  }
}

async function syncOrderAggregate(orderId, operation, options = {}) {
  const queueOnError = options.queueOnError !== false
  const database = ensureDatabase()

  if (queueOnError) {
    ensureOrderSyncQueue(database, orderId, operation)
    logOrderSync('aggregate protected locally pending remote push', {
      orderId: String(orderId),
      operation,
    })
  }

  const client = await getRemoteDbClient()

  if (!client) {
    const error = new Error('Remote database is not configured')
    if (queueOnError) {
      upsertOrderSyncQueue(database, orderId, operation, error.message)
    }
    throw error
  }

  try {
    await client.execute('SELECT 1')
    await applyRemoteOrderAggregate(client, database, orderId, operation)
    clearOrderSyncQueue(database, orderId)
    logOrderSync('aggregate synced', {
      orderId: String(orderId),
      operation,
    })
    return { queued: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (queueOnError) {
      upsertOrderSyncQueue(database, orderId, operation, message)
      logOrderSync('aggregate sync queued for retry', {
        orderId: String(orderId),
        operation,
        error: message,
      })
      return { queued: true }
    }

    throw error
  }
}

async function flushOrderSyncQueueWithClient(client) {
  const database = ensureDatabase()
  const queuedOrders = database
    .prepare('SELECT order_id, operation FROM order_sync_queue ORDER BY updated_at ASC')
    .all()

  for (const row of queuedOrders) {
    try {
      await applyRemoteOrderAggregate(client, database, row.order_id, row.operation)
      clearOrderSyncQueue(database, row.order_id)
      logOrderSync('aggregate synced', {
        orderId: String(row.order_id),
        operation: row.operation,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      database
        .prepare(
          `UPDATE order_sync_queue
              SET attempts = attempts + 1,
                  last_error = ?,
                  updated_at = ?
            WHERE order_id = ?`,
        )
        .run(message, new Date().toISOString(), String(row.order_id))
      logOrderSync('aggregate retry failed', {
        orderId: String(row.order_id),
        operation: row.operation,
        error: message,
      })
    }
  }
}

function ensureDatabase() {
  if (db) {
    return db
  }

  const { envelope } = getActiveEnvelope()
  if (!envelope) {
    throw new Error('Store connection required')
  }

  fs.mkdirSync(path.dirname(getDbPath()), { recursive: true })

  const dbPath = getDbPath()
  logStartup('ensuring local database', { dbPath })
  if (!fs.existsSync(dbPath)) {
    const bootstrapDbPath = getBootstrapDbPath()
    if (!bootstrapDbPath || !fs.existsSync(bootstrapDbPath)) {
      throw new Error(
        `Bootstrap database not found at ${bootstrapDbPath ?? '@openpos/data/assets/openpos-bootstrap.sqlite'}. ` +
        `If running from source, run "pnpm run prepare:bootstrap" first.`
      )
    }

    logStartup('creating local database from bootstrap', { bootstrapDbPath, dbPath })
    fs.writeFileSync(dbPath, fs.readFileSync(bootstrapDbPath))
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  ensureLegacyCompatibility(db)

  return db
}

function runSelect(sql, params = []) {
  const database = ensureDatabase()
  return database.prepare(sql).all(...params)
}

function runExecute(sql, params = []) {
  const database = ensureDatabase()
  const capturedWrite = syncManager.captureWrite(database, sql, params)
  const result = database.prepare(sql).run(...params)
  syncManager.trackWrite(database, capturedWrite, result)

  return {
    lastInsertId: Number(result.lastInsertRowid ?? 0),
    rowsAffected: result.changes ?? 0,
  }
}

function runTransaction(statements) {
  const database = ensureDatabase()
  const trackedWrites = []
  const executeMany = database.transaction((items) => {
    for (const statement of items) {
      const capturedWrite = syncManager.captureWrite(database, statement.sql, statement.params || [])
      const result = database.prepare(statement.sql).run(...(statement.params || []))
      trackedWrites.push({
        capturedWrite,
        result,
      })
    }
  })

  executeMany(statements)

  for (const write of trackedWrites) {
    syncManager.trackWrite(database, write.capturedWrite, write.result)
  }
}

function printThermalReceipt(receiptData) {
  return new Promise((resolve, reject) => {
    const receiptPayload = parseReceiptPayload(receiptData)
    if (!receiptPayload) {
      reject(new Error('Receipt data cannot be empty'))
      return
    }

    if (!['darwin', 'linux'].includes(process.platform)) {
      reject(new Error(`Native receipt printing is not supported on ${process.platform}`))
      return
    }

    let receiptBuffer
    try {
      receiptBuffer = createEscposReceiptBuffer(renderReceiptText(receiptPayload))
    } catch (error) {
      reject(error)
      return
    }

    const runtimeConfig = getRuntimeConfig()
    const { command, args, printerName } = resolvePrinterConfig({
      runtimeConfig: runtimeConfig.config,
      platform: process.platform,
      discover: true,
    })

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(new Error(`Failed to start printer command "${command}": ${error.message}`))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim() || `Receipt sent to printer command "${command}"`)
        return
      }

      reject(
        new Error(
          formatPrinterCommandError({
            command,
            code,
            stderr,
            printerName,
          }),
        ),
      )
    })

    child.stdin.end(receiptBuffer)
  })
}

function parseReceiptPayload(receiptData) {
  if (!receiptData || !String(receiptData).trim()) {
    return null
  }

  if (typeof receiptData === 'object') {
    return receiptData
  }

  try {
    return JSON.parse(receiptData)
  } catch (error) {
    throw new Error(`Receipt data must be valid JSON: ${error.message}`)
  }
}

function normalizePrinterText(text) {
  if (!text) return ''
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/¡/g, '!')
    .replace(/¿/g, '?')
}

function createEscposReceiptBuffer(receiptText) {
  const normalized = normalizePrinterText(receiptText)
  return Buffer.concat([
    Buffer.from([0x1b, 0x40]), // Initialize printer.
    Buffer.from(normalized, 'utf8'),
    Buffer.from('\n', 'utf8'),
    Buffer.from([0x1b, 0x64, 0x06]), // Feed 6 lines before cutting.
    Buffer.from([0x1d, 0x56, 0x00]), // Full cut.
  ])
}

function renderReceiptText(receiptData) {
  if (!receiptData || typeof receiptData !== 'object') {
    throw new Error('Receipt data is required')
  }

  if (!Array.isArray(receiptData.items)) {
    throw new Error('Receipt items must be an array')
  }

  const width = 42
  const line = '-'.repeat(width)
  const storeInfo = receiptData.storeInfo || {
    name: receiptData.title || 'Receipt',
    address: receiptData.address,
    phone: receiptData.phone,
  }
  const currencySymbol = receiptData.currencySymbol || '$'
  const taxRate = Number(receiptData.taxRate || 0)
  const appFooter = formatReceiptAppFooter(
    storeInfo.appName,
    receiptData.appVersionLabel,
    receiptData.supportLabel,
    receiptData.supportPhone,
  )
  const appFooterLines = appFooter.split('\n')

  const itemLabel = String(receiptData.itemLabel || 'Item').toUpperCase()
  const qtyLabel = String(receiptData.qtyLabel || 'Qty').toUpperCase()
  const totalLabel = String(receiptData.totalLabel || 'Total').toUpperCase()

  const lines = [
    centerText(storeInfo.name || receiptData.title || 'Receipt', width),
    storeInfo.address ? centerText(storeInfo.address, width) : '',
    storeInfo.phone ? centerText(storeInfo.phone, width) : '',
    storeInfo.email ? centerText(storeInfo.email, width) : '',
    storeInfo.website ? centerText(storeInfo.website, width) : '',
    line,
    formatReceiptRow(itemLabel, qtyLabel, totalLabel, width),
    line,
    ...receiptData.items.map((item) =>
      formatReceiptRow(
        String(item?.name || ''),
        String(item?.quantity || 0),
        formatCurrency(Number(item?.total ?? item?.price ?? 0), currencySymbol),
        width,
      ),
    ),
    line,
    receiptData.taxEnabled
      ? formatAmountLine(receiptData.subtotalLabel || 'Subtotal', Number(receiptData.subtotal || 0), currencySymbol, width)
      : '',
    receiptData.taxEnabled && taxRate > 0
      ? formatAmountLine(
          `${receiptData.taxLabel || 'Tax'} (${taxRate}%)`,
          Number(receiptData.tax || 0),
          currencySymbol,
          width,
        )
      : '',
    formatAmountLine(receiptData.totalLabel || 'Total', Number(receiptData.total || 0), currencySymbol, width),
    line,
    centerText(receiptData.footer || receiptData.footerLabel || 'Thank you for your purchase!', width),
    line,
    receiptData.orderId
      ? centerText(`${receiptData.orderLabel || 'Ref'}: ${receiptData.orderId}`, width)
      : '',
    receiptData.date
      ? centerText(receiptData.date, width)
      : centerText(new Date().toLocaleDateString(receiptData.locale), width),
    receiptData.time
      ? centerText(receiptData.time, width)
      : centerText(new Date().toLocaleTimeString(receiptData.locale), width),
    ...appFooterLines.map((l) => centerText(l, width)),
  ]

  return lines.filter(Boolean).join('\n')
}

function formatReceiptRow(name, quantity, total, width) {
  const qtyWidth = 5
  const totalWidth = 12
  const nameWidth = width - qtyWidth - totalWidth - 2
  const safeName = truncate(name, nameWidth)
  return `${safeName.padEnd(nameWidth)} ${quantity.padStart(qtyWidth)} ${total.padStart(totalWidth)}`
}

function formatAmountLine(label, amount, currencySymbol, width) {
  const value = formatCurrency(amount, currencySymbol)
  return `${label}:`.padEnd(width - value.length) + value
}

function formatCurrency(amount, currencySymbol) {
  return `${currencySymbol}${Number(amount || 0).toFixed(2)}`
}

function centerText(text, width) {
  const trimmed = String(text || '').trim()
  if (trimmed.length >= width) return trimmed
  const leftPadding = Math.floor((width - trimmed.length) / 2)
  return `${' '.repeat(leftPadding)}${trimmed}`
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value
}

function formatReceiptAppFooter(appName, appVersionLabel, supportLabel, supportPhone) {
  const version = pkg.version || '1.0.0'
  return `${appName || 'OpenPOS'} | ${appVersionLabel || 'Version'} ${version}\n${supportLabel || 'Support'}: ${supportPhone || '+523322633323'}`
}

function createWindow({ attempt = 0 } = {}) {
  const graphicsFallback = hasGraphicsFallbackFlag({
    argv: process.argv,
    env: process.env,
  })
  const wantFullscreen = shouldApplyFullscreenAfterLoad({
    isPackaged: app.isPackaged,
    argv: process.argv,
    env: process.env,
  })

  if (mainWindow && !mainWindow.isDestroyed()) {
    isRecreatingWindow = true
    mainWindow.removeAllListeners()
    mainWindow.webContents.removeAllListeners()
    mainWindow.destroy()
    mainWindow = null
  }

  const macOptions =
    process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 16, y: 18 },
          vibrancy: 'sidebar',
          visualEffectState: 'active',
          transparent: true,
          backgroundColor: '#00000000',
        }
      : {}

  mainWindow = new BrowserWindow({
    ...macOptions,
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    fullscreen: false,
    show: false,
    backgroundColor: '#ffffff',
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  })
  isRecreatingWindow = false

  const createdWindow = mainWindow
  const state = {
    loadFinished: false,
    rendererPainted: false,
    revealed: false,
    recovering: false,
  }
  const timers = []
  let loadAttempts = 0
  const maxLoadAttempts = 2
  let rendererCrashCount = 0

  const isCurrentWindow = () => createdWindow && !createdWindow.isDestroyed() && mainWindow === createdWindow

  const schedule = (fn, ms) => {
    const id = setTimeout(fn, ms)
    timers.push(id)
    return id
  }

  const clearTimers = () => {
    for (const id of timers) {
      clearTimeout(id)
    }
    timers.length = 0
  }

  const recover = (reason) => {
    if (state.recovering || !isCurrentWindow()) {
      return
    }

    const decision = resolveWindowBootAction({
      attempt,
      rendererPainted: state.rendererPainted,
      loadFinished: state.loadFinished,
      timedOut: true,
      graphicsFallback,
      wantFullscreen,
      reason,
    })
    state.recovering = true
    clearTimers()
    logStartup('window boot recovery', {
      reason,
      attempt,
      action: decision.action,
      rendererPainted: state.rendererPainted,
      loadFinished: state.loadFinished,
    })

    if (decision.action === 'recreate') {
      isRecreatingWindow = true
      if (isCurrentWindow() && createdWindow.isVisible()) {
        createdWindow.hide()
      }
      schedule(() => {
        createWindow({ attempt: decision.nextAttempt })
      }, decision.delayMs)
      return
    }

    if (decision.action === 'relaunch-graphics-fallback') {
      relaunchForGraphicsFallback()
      return
    }

    createdWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadRendererFailureHtml(reason))}`)
    createdWindow.show()
  }

  const finishPresentation = (fullscreenMode) => {
    if (!isCurrentWindow() || state.recovering) {
      return
    }

    applyWindowPresentation(createdWindow, fullscreenMode)
    schedule(() => {
      if (!isCurrentWindow() || state.recovering) {
        return
      }
      nudgeCompositor(createdWindow)
    }, 150)
  }

  const maybeReveal = () => {
    const decision = resolveWindowBootAction({
      attempt,
      rendererPainted: state.rendererPainted,
      loadFinished: state.loadFinished,
      timedOut: false,
      graphicsFallback,
      wantFullscreen,
    })
    if (decision.action !== 'reveal' || state.revealed || state.recovering || !isCurrentWindow()) {
      return
    }

    state.revealed = true
    logStartup('showing main window', {
      attempt,
      fullscreenMode: decision.fullscreenMode,
      graphicsFallback,
    })
    createdWindow.show()
    createdWindow.focus()
    nudgeCompositor(createdWindow)
    schedule(() => {
      finishPresentation(decision.fullscreenMode)
    }, resolvePaintSettleMs(process.env))
  }

  rendererSignalHandler = (payload) => {
    if (!isCurrentWindow() || payload?.phase !== 'painted') {
      return
    }

    logStartup('renderer signal', payload)
    state.rendererPainted = true
    maybeReveal()
  }

  createdWindow.webContents.on('did-finish-load', () => {
    state.loadFinished = true
    maybeReveal()
  })

  createdWindow.webContents.on('did-fail-load', async (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* aborted */ || !isCurrentWindow()) {
      return
    }

    logStartup('renderer failed to load', { errorCode, errorDescription, validatedURL, loadAttempts })
    loadAttempts += 1

    if (loadAttempts < maxLoadAttempts) {
      await delay(750)
      if (isCurrentWindow()) {
        loadRenderer(createdWindow)
      }
      return
    }

    recover(errorDescription || String(errorCode))
  })

  createdWindow.webContents.on('render-process-gone', (_event, details) => {
    rendererCrashCount += 1
    logStartup('renderer process gone', { ...details, rendererCrashCount })
    if (!isCurrentWindow() || state.recovering) {
      return
    }

    if (rendererCrashCount <= 3) {
      const delayMs = 1000 * rendererCrashCount
      logStartup('reloading after renderer crash', { delayMs, rendererCrashCount })
      schedule(() => {
        if (isCurrentWindow() && !state.recovering) {
          createdWindow.reload()
        }
      }, delayMs)
      return
    }

    recover(`render-process-gone:${details?.reason || 'unknown'}`)
  })

  createdWindow.webContents.on('before-input-event', (event, input) => {
    if (!isFullscreenToggleInput(input, process.platform) || !isCurrentWindow()) return
    event.preventDefault()
    createdWindow.setFullScreen(!createdWindow.isFullScreen())
  })

  createdWindow.on('closed', () => {
    clearTimers()
    if (rendererSignalHandler && mainWindow === createdWindow) {
      rendererSignalHandler = null
    }
  })

  if (!isDev()) {
    schedule(() => {
      if (state.revealed || state.recovering) {
        return
      }
      recover('boot-timeout')
    }, resolveBootTimeoutMs(process.env))
  }

  loadRenderer(createdWindow)
  if (isDev()) {
    createdWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

function registerIpcHandlers() {
  ipcMain.on('desktop:renderer-signal', (event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      return
    }
    rendererSignalHandler?.(payload)
  })

  ipcMain.handle('desktop:info', () => {
    return {
      isDesktop: true,
      isElectron: true,
      version: pkg.version,
      platform: process.platform,
      arch: process.arch,
      updateFormat: getUpdateFormat(),
    }
  })

  ipcMain.handle('desktop:greet', (_event, name) => `Hello, ${name}!!`)
  ipcMain.handle('desktop:hash-password', (_event, password) => bcrypt.hash(password, 12))
  ipcMain.handle('desktop:verify-password', (_event, password, hash) => bcrypt.compare(password, hash))
  ipcMain.handle('desktop:encrypt-secret', (_event, value) => {
    if (typeof value !== 'string' || !value) return ''
    return wrapSecret(app.getPath('userData'), value)
  })
  ipcMain.handle('desktop:decrypt-secret', (_event, value) => {
    if (typeof value !== 'string' || !value) return ''
    try {
      return unwrapSecret(app.getPath('userData'), value)
    } catch {
      return ''
    }
  })
  ipcMain.handle('desktop:db-query', (_event, sql, params) => runSelect(sql, params))
  ipcMain.handle('desktop:db-execute', (_event, sql, params) => runExecute(sql, params))
  ipcMain.handle('desktop:db-transaction', (_event, statements) => runTransaction(statements))
  ipcMain.handle('desktop:print-thermal-receipt', (_event, receiptData) => printThermalReceipt(receiptData))
  ipcMain.handle('desktop:sync-status', () => syncManager.getStatusSnapshot())
  ipcMain.handle('desktop:sync-trigger', () => syncManager.triggerSync({ foreground: true }))
  ipcMain.handle('desktop:sync-conflicts', () => syncManager.getConflictSummary())
  ipcMain.handle('desktop:sync-reset-local', async () => {
    const database = ensureDatabase()
    syncManager.stop()
    resetLocalDatabase(database)
    syncManager.start()
    return syncManager.triggerSync({ foreground: true })
  })
  ipcMain.handle('desktop:connectivity-status', () => getConnectivitySnapshot())
  ipcMain.handle('desktop:connectivity-refresh', () => getConnectivitySnapshot({ refresh: true }))
  ipcMain.handle('desktop:startup-status', () => getFirstRunStatus())
  ipcMain.handle('desktop:startup-initialize', () => initializeFirstRun())
  ipcMain.handle('desktop:startup-retry', () => initializeFirstRun())
  ipcMain.handle('desktop:connection-get', () => {
    const { active, envelope } = getActiveEnvelope()
    return publicEnvelope(envelope, active)
  })
  ipcMain.handle('desktop:connection-register-payload', () => {
    const { envelope } = getActiveEnvelope()
    const payload = registerPayloadFromEnvelope(envelope)
    if (!payload) {
      throw new Error('Store connection required')
    }
    return payload
  })
  ipcMain.handle('desktop:connection-create', async (_event, payload) => {
    const result = await createLocalStore({
      userDataPath: app.getPath('userData'),
      owner: payload,
    })
    bindConnection(result, { emergencyKitConfirmed: false })
    await seedBoundLocalStore(ensureDatabase(), result)
    const status = await initializeFirstRun()
    return {
      key: result.key,
      seed: result.seed,
      storeName: result.storeName,
      published: result.published,
      status,
    }
  })
  ipcMain.handle('desktop:connection-join', async (_event, payload) => {
    const result = await joinLocalStore({
      userDataPath: app.getPath('userData'),
      key: payload.key,
      seed: payload.seed,
    })
    bindConnection(result, { emergencyKitConfirmed: true, adoptLegacy: true })
    const status = await initializeFirstRun()
    return {
      key: result.key,
      storeName: result.storeName,
      published: result.published,
      status,
    }
  })
  ipcMain.handle('desktop:connection-import', async (_event, payload) => {
    const result = await attachRemoteStore(payload)
    bindConnection(result, { emergencyKitConfirmed: !result.seed })

    // The initial sync can settle slightly after the bind: the remote pull is
    // skipped while the sentinel is unchanged, then a later cycle pulls the
    // replicated rows (including users). Recompute before surfacing needsOwner
    // so an imported database with an existing owner lands on sign-in.
    let status = await initializeFirstRun()
    for (let attempt = 0; status.status === 'needsOwner' && attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      status = await initializeFirstRun()
    }

    return {
      key: result.key,
      seed: result.seed,
      storeName: result.storeName,
      published: result.published,
      status,
    }
  })
  ipcMain.handle('desktop:connection-apply-remote', async (_event, payload) => {
    const { envelope, active } = getActiveEnvelope()
    if (!envelope) {
      throw new Error('Store connection required')
    }
    writeEnvelope(app.getPath('userData'), {
      key: payload.key || envelope.key,
      storeName: payload.storeName || envelope.storeName,
      url: payload.dataPlane.url,
      authToken: payload.dataPlane.authToken,
      published: payload.published,
    })
    if (payload.key && payload.key !== envelope.key) {
      writeActiveConnection(app.getPath('userData'), {
        key: payload.key,
        emergencyKitConfirmed: Boolean(active?.emergencyKitConfirmed),
      })
    }
    closeDatabase()
    ensureDatabase()
    startSyncIfPossible()
    return publicEnvelope(readEnvelope(app.getPath('userData'), payload.key || envelope.key), readActiveConnection(app.getPath('userData')))
  })
  ipcMain.handle('desktop:connection-bootstrap-owner', async (_event, payload) => {
    const { envelope } = getActiveEnvelope()
    if (!envelope) {
      throw new Error('Store connection required')
    }

    await bootstrapLocalOwner(ensureDatabase(), {
      storeName: payload?.storeName,
      adminName: payload?.adminName,
      adminEmail: payload?.adminEmail,
      adminPassword: payload?.adminPassword,
    })
    ownerBootstrapNeeded = false
    initialSyncError = null
    return initializeFirstRun()
  })
  ipcMain.handle('desktop:connection-confirm-kit', () => {
    const { active } = getActiveEnvelope()
    if (!active?.key) {
      throw new Error('Store connection required')
    }
    writeActiveConnection(app.getPath('userData'), {
      key: active.key,
      emergencyKitConfirmed: true,
    })
    return getFirstRunStatus()
  })
  ipcMain.handle('desktop:connection-emergency-kit', () => {
    const { active, envelope } = getActiveEnvelope()
    if (!active?.key || !envelope) {
      throw new Error('Store connection required')
    }
    return {
      key: envelope.key,
      seed: revealSeed(app.getPath('userData'), envelope.key),
      storeName: envelope.storeName,
    }
  })
  ipcMain.handle('desktop:connection-leave', async () => {
    const snapshot = syncManager && db ? syncManager.getStatusSnapshot(db) : null
    if ((snapshot?.pendingWrites || 0) > 0) {
      throw new Error('Unsynced local changes must be synced or discarded before leaving this store')
    }
    closeDatabase()
    clearActiveConnection(app.getPath('userData'))
    return getFirstRunStatus()
  })
  ipcMain.handle('desktop:connection-factory-reset', async () => {
    closeDatabase()
    initialSyncPromise = null
    initialSyncError = null
    ownerBootstrapNeeded = false
    resetLocalDevice(app.getPath('userData'), [getProductImagesDir()])
    return getFirstRunStatus()
  })
  ipcMain.handle('desktop:orders-sync-aggregate', (_event, payload) =>
    syncOrderAggregate(payload.orderId, payload.operation),
  )
  ipcMain.handle('desktop:config', () => {
    const config = resolveConnectionConfig()
    const { envelope } = getActiveEnvelope()
    return {
      apiUrl: config.api.url || '',
      connectionKey: envelope?.key || '',
      configPath: config.api.configPath || getUserDataConfigPath(),
      configSource: config.api.source,
      userDataConfigPath: getUserDataConfigPath(),
    }
  })
  ipcMain.handle('desktop:config-set-api-url', (_event, apiUrl) => {
    writeDesktopRuntimeConfig(getUserDataConfigPath(), {
      apiUrl: normalizeDesktopApiUrl(apiUrl),
    })
    return getFirstRunStatus()
  })

  ipcMain.handle('desktop:config-reset', (_event, resetKey) => {
    if (resetKey !== SETTINGS_RESET_KEY) {
      throw new Error('Invalid reset key')
    }

    closeDatabase()
    initialSyncPromise = null
    initialSyncError = null
    ownerBootstrapNeeded = false
    resetLocalDevice(app.getPath('userData'), [getProductImagesDir()])
    resetDesktopRuntimeConfig(getUserDataConfigPath())
    return getFirstRunStatus()
  })
  ipcMain.handle('desktop:open-external', (_event, url) => {
    ensureHttpsUrl(url)
    return shell.openExternal(url)
  })
  ipcMain.handle('desktop:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })
  ipcMain.handle('desktop:update-download-appimage', async (_event, payload) => {
    try {
      return await downloadAppImageUpdate(payload.url, payload.version, payload.sha256)
    } catch (error) {
      emitUpdateStatus({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })
  ipcMain.handle('desktop:update-download-deb', async (_event, payload) => {
    try {
      return await downloadDebUpdate(payload.url, payload.version, payload.sha256)
    } catch (error) {
      emitUpdateStatus({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })
  ipcMain.handle('desktop:update-install-appimage', async (_event, payload) => {
    try {
      await installDownloadedAppImage(payload.tempPath)
    } catch (error) {
      emitUpdateStatus({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })
  ipcMain.handle('desktop:update-install-deb', async (_event, payload) => {
    try {
      await installDownloadedDeb(payload.tempPath)
    } catch (error) {
      emitUpdateStatus({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })
  ipcMain.handle('desktop:update-restart-appimage', () => restartFromInstalledAppImage())
  ipcMain.handle('desktop:update-restart-deb', () => restartFromInstalledDeb())
  ipcMain.handle('desktop:update-download-mac-zip', async (_event, payload) => {
    try {
      return await downloadMacZipUpdate(payload.url, payload.version, payload.sha256)
    } catch (error) {
      emitUpdateStatus({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })
  ipcMain.handle('desktop:update-install-mac-zip', async (_event, payload) => {
    try {
      await installDownloadedMacZip(payload.tempPath)
    } catch (error) {
      emitUpdateStatus({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })
  ipcMain.handle('desktop:update-restart-mac', () => restartFromUpdatedMacApp())

  // ── Product images (local file system) ──────────────────────────────
  ipcMain.handle('desktop:image-save', async (_event, payload) => {
    const { base64, mimeType } = payload
    if (!base64 || !mimeType) {
      throw new Error('base64 and mimeType are required')
    }

    const ext = EXT_BY_MIME[mimeType]
    if (!ext) {
      throw new Error(`Unsupported image type: ${mimeType}`)
    }

    const { randomUUID } = require('node:crypto')
    const dir = getProductImagesDir()
    await fs.promises.mkdir(dir, { recursive: true })

    const fileName = `${randomUUID()}${ext}`
    const filePath = path.join(dir, fileName)
    const buffer = Buffer.from(base64, 'base64')
    await fs.promises.writeFile(filePath, buffer)

    return { key: fileName }
  })

  ipcMain.handle('desktop:image-resolve', async (_event, keys) => {
    const dir = getProductImagesDir()
    const urls = {}

    for (const key of keys) {
      if (!isLegacyLocalImageKey(key)) {
        continue
      }
      const safeName = path.basename(key)
      const filePath = path.join(dir, safeName)
      try {
        const buffer = await fs.promises.readFile(filePath)
        const ext = path.extname(safeName).toLowerCase()
        const mime = MIME_BY_EXT[ext] || 'image/jpeg'
        urls[key] = `data:${mime};base64,${buffer.toString('base64')}`
      } catch {
        // File missing — skip silently
      }
    }

    return urls
  })

  ipcMain.handle('desktop:image-delete', async (_event, key) => {
    if (!isLegacyLocalImageKey(key)) return
    const safeName = path.basename(key)
    const filePath = path.join(getProductImagesDir(), safeName)
    await fs.promises.rm(filePath, { force: true })
  })
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin'

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'Cmd+,',
          click: () => { mainWindow?.webContents.send('navigate', 'settings') },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        {
          label: `Toggle Full Screen (${fullscreenToggleAccelerator(process.platform)})`,
          click: () => {
            if (!mainWindow) return
            mainWindow.setFullScreen(!mainWindow.isFullScreen())
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
        ] : [
          { role: 'close' },
        ]),
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}

function registerThemeHandlers() {
  ipcMain.handle('desktop:theme', () =>
    nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  )
  ipcMain.handle('desktop:set-theme', (_event, theme) => {
    if (theme !== 'system' && theme !== 'dark' && theme !== 'light') {
      throw new Error('Invalid theme preference')
    }
    nativeTheme.themeSource = theme
  })

  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    mainWindow?.webContents.send('desktop:theme-changed', theme)
  })
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  await waitForLinuxGraphicsReady()

  setAppIcon()
  Menu.setApplicationMenu(buildAppMenu())
  if (readActiveConnection(app.getPath('userData'))) {
    ensureDatabase()
  }
  syncManager = createSyncManager({
    getDatabase: ensureDatabase,
    getRemoteConfig: getDbConnectionConfig,
    onFlushOrderQueue: flushOrderSyncQueueWithClient,
  })
  registerIpcHandlers()
  registerThemeHandlers()
  createWindow({ attempt: 0 })
  suppressLastWindowQuit = false
  startSyncIfPossible()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && !isRecreatingWindow) {
      createWindow({ attempt: 0 })
    }
  })
})

app.on('window-all-closed', () => {
  if (!shouldQuitOnLastWindow({
    platform: process.platform,
    suppressLastWindowQuit: suppressLastWindowQuit || isRecreatingWindow,
  })) {
    return
  }

  app.quit()
})

app.on('before-quit', () => {
  if (syncManager) {
    syncManager.stop()
  }

  if (db) {
    db.close()
    db = null
  }
})
