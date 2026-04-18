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
} = {}) {
  const remoteUrl =
    normalizeString(runtimeConfig.tursoDatabaseUrl) ||
    normalizeString(processEnv.TURSO_DATABASE_URL) ||
    normalizeString(envConfig.TURSO_DATABASE_URL)
  const remoteAuthToken =
    normalizeString(runtimeConfig.tursoAuthToken) ||
    normalizeString(processEnv.TURSO_AUTH_TOKEN) ||
    normalizeString(envConfig.TURSO_AUTH_TOKEN)
  const apiUrl =
    normalizeString(runtimeConfig.apiUrl) ||
    normalizeString(processEnv.VITE_API_URL) ||
    normalizeString(envConfig.VITE_API_URL) ||
    normalizeString(defaultApiUrl)
  const apiSource = normalizeString(runtimeConfig.apiUrl)
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
      configured: Boolean(remoteUrl && remoteAuthToken),
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

module.exports = {
  createPublicConnectionConfig,
  getDesktopRuntimeConfigCandidates,
  resolveDesktopRuntimeConfigPath,
  resolveDesktopConnectionConfig,
}
