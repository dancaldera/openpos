const path = require('node:path')

function parseOsRelease(content) {
  const values = {}

  for (const rawLine of String(content || '').split('\n')) {
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
}

function isDebianLikeOsRelease(content) {
  const values = parseOsRelease(content)
  const id = String(values.ID || '').toLowerCase()
  const idLike = String(values.ID_LIKE || '').toLowerCase().split(/\s+/).filter(Boolean)

  return id === 'debian' || idLike.includes('debian')
}

function isLinuxDebInstall(exePath) {
  if (!exePath) {
    return false
  }

  const resolved = path.resolve(exePath)
  return (
    resolved === '/opt' ||
    resolved.startsWith(`/opt${path.sep}`) ||
    resolved === '/usr' ||
    resolved.startsWith(`/usr${path.sep}`)
  )
}

function resolveLinuxUpdateFormat({ platform, env = {}, readFileSync, isPackaged, exePath }) {
  if (platform !== 'linux') {
    return null
  }

  if (env.APPIMAGE) {
    return 'appimage'
  }

  if (!isPackaged || !isLinuxDebInstall(exePath)) {
    return null
  }

  try {
    const osRelease = readFileSync('/etc/os-release', 'utf8')
    return isDebianLikeOsRelease(osRelease) ? 'deb' : null
  } catch {
    return null
  }
}

function resolveMacAppBundlePath(exePath) {
  if (!exePath) {
    return null
  }

  let current = path.resolve(exePath)
  while (true) {
    if (current.endsWith('.app')) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

function resolveUpdateFormat({ platform, env = {}, readFileSync, isPackaged, exePath }) {
  if (platform === 'linux') {
    return resolveLinuxUpdateFormat({ platform, env, readFileSync, isPackaged, exePath })
  }

  if (platform === 'darwin') {
    return isPackaged && resolveMacAppBundlePath(exePath) ? 'mac-zip' : null
  }

  return null
}

function normalizeArchTokens(arch) {
  if (arch === 'arm64') {
    return ['arm64', 'aarch64']
  }

  if (arch === 'x64') {
    return ['x86_64', 'amd64', 'x64']
  }

  return [arch]
}

function sanitizeVersion(version) {
  return String(version || 'latest').replace(/[^a-zA-Z0-9._-]/g, '-')
}

const UPDATE_FORMAT_EXTENSIONS = {
  deb: { extension: '.deb', fallbackExtension: '.deb' },
  appimage: { extension: '.appimage', fallbackExtension: '.AppImage' },
  'mac-zip': { extension: '.zip', fallbackExtension: '.zip' },
}

function getUpdateFormatExtensions(format) {
  const extensions = UPDATE_FORMAT_EXTENSIONS[format]
  if (!extensions) {
    throw new Error(`Unsupported update format: ${format}`)
  }
  return extensions
}

function resolveUpdateDownloadFileName(downloadUrl, version, arch, format) {
  const url = new URL(downloadUrl)
  if (url.protocol !== 'https:') {
    throw new Error('Only https: URLs allowed')
  }

  const { extension, fallbackExtension } = getUpdateFormatExtensions(format)
  const candidate = path.basename(url.pathname)

  if (candidate.toLowerCase().endsWith(extension)) {
    return candidate
  }

  return `openpos-${sanitizeVersion(version)}-${arch}${fallbackExtension}`
}

function assertUpdateFilePath({ tempDir, filePath, format }) {
  if (!filePath) {
    throw new Error('Downloaded update was not found')
  }

  const expectedTempDir = path.resolve(tempDir)
  const resolvedFilePath = path.resolve(filePath)
  if (!resolvedFilePath.startsWith(expectedTempDir + path.sep)) {
    throw new Error('Refusing to install update from an unexpected location')
  }

  const { extension } = getUpdateFormatExtensions(format)
  if (!resolvedFilePath.toLowerCase().endsWith(extension)) {
    throw new Error(`Downloaded update must be a ${extension} file`)
  }

  return resolvedFilePath
}

const PRIVILEGED_ENV_KEYS = [
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'XAUTHORITY',
  'XDG_RUNTIME_DIR',
  'DBUS_SESSION_BUS_ADDRESS',
  'DBUS_SYSTEM_BUS_ADDRESS',
  'XDG_CURRENT_DESKTOP',
  'XDG_SESSION_TYPE',
  'LANG',
  'LC_ALL',
  'LANGUAGE',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
]

function privilegedSpawnEnv(processEnv = {}) {
  const env = {
    PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
    DEBIAN_FRONTEND: 'noninteractive',
  }

  for (const key of PRIVILEGED_ENV_KEYS) {
    const value = processEnv[key]
    if (typeof value === 'string' && value) {
      env[key] = value
    }
  }

  return env
}

function aptGetInstallArgs(debPath) {
  return [
    '-o',
    'Dpkg::Options::=--force-confdef',
    '-o',
    'Dpkg::Options::=--force-confold',
    'install',
    '-y',
    '--allow-downgrades',
    debPath,
  ]
}

function buildDebInstallCommands({ debPath, isRoot, availableCommands = {}, processEnv = {} } = {}) {
  const aptGet = '/usr/bin/apt-get'
  const aptArgs = aptGetInstallArgs(debPath)
  const env = privilegedSpawnEnv(processEnv)

  if (isRoot) {
    return [
      {
        command: aptGet,
        args: aptArgs,
        env,
      },
    ]
  }

  const commands = []
  if (availableCommands.pkcon !== false) {
    commands.push({
      command: '/usr/bin/pkcon',
      args: ['install-local', '--allow-untrusted', debPath],
      env,
    })
  }
  if (availableCommands.pkexec !== false) {
    commands.push({
      command: '/usr/bin/pkexec',
      args: ['/usr/bin/env', 'DEBIAN_FRONTEND=noninteractive', aptGet, ...aptArgs],
      env,
    })
  }

  return commands
}

function buildDebInstallCommand({ debPath, isRoot }) {
  return buildDebInstallCommands({
    debPath,
    isRoot,
    availableCommands: { pkcon: false, pkexec: true },
  })[0]
}

function buildDebRestartCommand({ currentPid, exePath, args = [] }) {
  return {
    command: '/bin/sh',
    args: [
      '-c',
      'old_pid=$1\nshift\nwhile kill -0 "$old_pid" 2>/dev/null; do sleep 0.1; done\nfor pid in $(pgrep -f "$1.*--type=" 2>/dev/null); do kill "$pid" 2>/dev/null; done\nsleep 2.5\nexec "$@"',
      'openpos-restart',
      String(currentPid),
      exePath,
      ...args,
    ],
  }
}

module.exports = {
  assertUpdateFilePath,
  buildDebInstallCommand,
  buildDebInstallCommands,
  buildDebRestartCommand,
  isDebianLikeOsRelease,
  isLinuxDebInstall,
  normalizeArchTokens,
  parseOsRelease,
  privilegedSpawnEnv,
  resolveLinuxUpdateFormat,
  resolveMacAppBundlePath,
  resolveUpdateDownloadFileName,
  resolveUpdateFormat,
}
