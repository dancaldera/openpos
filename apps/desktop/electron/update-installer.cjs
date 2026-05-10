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

function resolveLinuxUpdateFormat({ platform, env = {}, readFileSync }) {
  if (platform !== 'linux') {
    return null
  }

  if (env.APPIMAGE) {
    return 'appimage'
  }

  try {
    const osRelease = readFileSync('/etc/os-release', 'utf8')
    return isDebianLikeOsRelease(osRelease) ? 'deb' : null
  } catch {
    return null
  }
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

function resolveUpdateDownloadFileName(downloadUrl, version, arch, format) {
  const url = new URL(downloadUrl)
  if (url.protocol !== 'https:') {
    throw new Error('Only https: URLs allowed')
  }

  const extension = format === 'deb' ? '.deb' : '.appimage'
  const fallbackExtension = format === 'deb' ? '.deb' : '.AppImage'
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

  const extension = format === 'deb' ? '.deb' : '.appimage'
  if (!resolvedFilePath.toLowerCase().endsWith(extension)) {
    throw new Error(`Downloaded update must be a ${extension} file`)
  }

  return resolvedFilePath
}

function buildDebInstallCommand({ debPath, isRoot }) {
  if (isRoot) {
    return { command: 'apt-get', args: ['install', '-y', debPath] }
  }

  return { command: 'pkexec', args: ['apt-get', 'install', '-y', debPath] }
}

module.exports = {
  assertUpdateFilePath,
  buildDebInstallCommand,
  isDebianLikeOsRelease,
  normalizeArchTokens,
  parseOsRelease,
  resolveLinuxUpdateFormat,
  resolveUpdateDownloadFileName,
}
