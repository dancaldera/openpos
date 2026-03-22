function normalizeString(value) {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function resolveDesktopConnectionConfig({
  runtimeConfig = {},
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

  return {
    remote: {
      url: remoteUrl,
      authToken: remoteAuthToken,
      configured: Boolean(remoteUrl && remoteAuthToken),
    },
    api: {
      url: apiUrl,
      configured: Boolean(apiUrl),
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
  resolveDesktopConnectionConfig,
}
