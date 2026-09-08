const fs = require('node:fs')
const path = require('node:path')

function normalizeString(value) {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function getDesktopRuntimeConfigCandidates({ homeDir, userDataPath, platform = process.platform } = {}) {
  const candidates = []
  const seen = new Set()

  const registerCandidate = (candidatePath, source) => {
    const normalizedPath = normalizeString(candidatePath)
    if (!normalizedPath || seen.has(normalizedPath)) {
      return
    }

    seen.add(normalizedPath)
    candidates.push({
      path: normalizedPath,
      source,
    })
  }

  const normalizedUserDataPath = normalizeString(userDataPath)
  if (normalizedUserDataPath) {
    registerCandidate(path.join(normalizedUserDataPath, 'config.json'), 'userData')
  }

  if (platform === 'darwin') {
    const normalizedHomeDir = normalizeString(homeDir)
    if (normalizedHomeDir) {
      registerCandidate(path.join(normalizedHomeDir, '.config', 'OpenPOS', 'config.json'), 'fallback')
    }
  }

  return candidates
}

function resolveDesktopRuntimeConfigPath({ homeDir, userDataPath, platform = process.platform, fileExists = () => false } = {}) {
  const candidates = getDesktopRuntimeConfigCandidates({ homeDir, userDataPath, platform })

  for (const candidate of candidates) {
    if (fileExists(candidate.path)) {
      return {
        ...candidate,
        exists: true,
      }
    }
  }

  const preferredCandidate = candidates[0]
  if (!preferredCandidate) {
    return {
      path: '',
      source: 'userData',
      exists: false,
    }
  }

  return {
    ...preferredCandidate,
    exists: false,
  }
}

function resolveDesktopConnectionConfig({
  runtimeConfig = {},
  runtimeConfigSource = 'userData',
  configPath = '',
  processEnv = process.env,
  envConfig = {},
  defaultApiUrl,
  connectionRemote = {},
  requireApiSetup = false,
} = {}) {
  const remoteUrl = normalizeString(connectionRemote.url)
  const remoteAuthToken = normalizeString(connectionRemote.authToken)
  const runtimeApiUrl = normalizeString(runtimeConfig.apiUrl)
  const apiUrl =
    runtimeApiUrl ||
    (requireApiSetup
      ? ''
      : normalizeString(processEnv.VITE_API_URL) ||
        normalizeString(envConfig.VITE_API_URL) ||
        normalizeString(defaultApiUrl))
  const apiSource = runtimeApiUrl
    ? runtimeConfigSource
    : requireApiSetup
      ? runtimeConfigSource
      : normalizeString(processEnv.VITE_API_URL)
        ? 'env'
        : normalizeString(envConfig.VITE_API_URL) || normalizeString(defaultApiUrl)
          ? 'bundled'
          : runtimeConfigSource
  return {
    remote: {
      url: remoteUrl,
      authToken: remoteAuthToken,
      configured: Boolean(remoteUrl && (remoteAuthToken || remoteUrl.startsWith('file:'))),
    },
    api: {
      url: apiUrl,
      configured: Boolean(apiUrl),
      source: apiSource,
      configPath: normalizeString(configPath) || '',
    },
  }
}

function createPublicConnectionConfig(connectionConfig) {
  return {
    remoteConfigured: Boolean(connectionConfig?.remote?.configured),
    apiConfigured: Boolean(connectionConfig?.api?.configured),
  }
}

function normalizeDesktopApiUrl(value) {
  const url = normalizeString(value)
  if (!url) {
    throw new Error('API URL is required')
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('API URL is invalid')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('API URL must start with http:// or https://')
  }

  return url.replace(/\/+$/, '')
}

function desktopFirstRunNeedsApiSetup({ hasConnection, emergencyKitConfirmed, apiConfigured } = {}) {
  return Boolean(hasConnection && emergencyKitConfirmed && !apiConfigured)
}

function writeDesktopRuntimeConfig(configPath, updates = {}) {
  const targetPath = normalizeString(configPath)
  if (!targetPath) {
    throw new Error('Config path is required')
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })

  let current = {}
  try {
    const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      current = parsed
    }
  } catch {
    current = {}
  }

  const next = { ...current }
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue
    next[key] = value
  }

  fs.writeFileSync(targetPath, `${JSON.stringify(next, null, 2)}\n`)
  return next
}

function resetDesktopRuntimeConfig(configPath) {
  const targetPath = normalizeString(configPath)
  if (!targetPath) {
    throw new Error('Config path is required')
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, '{}\n')
  return {}
}

module.exports = {
  createPublicConnectionConfig,
  desktopFirstRunNeedsApiSetup,
  getDesktopRuntimeConfigCandidates,
  normalizeDesktopApiUrl,
  resolveDesktopRuntimeConfigPath,
  resolveDesktopConnectionConfig,
  writeDesktopRuntimeConfig,
  resetDesktopRuntimeConfig,
}
