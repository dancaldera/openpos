import type { DesktopRuntimeConfigSummary } from './desktop'

let cachedApiConfig: DesktopRuntimeConfigSummary | null = null

const DEFAULT_CONFIG_SOURCE = 'bundled'

export function resolveApiBaseUrl(
  config?: { apiUrl?: string } | null,
  fallbackApiUrl: string = import.meta.env.VITE_API_URL || '',
): string {
  const runtimeApiUrl = typeof config?.apiUrl === 'string' ? config.apiUrl.trim() : ''
  const bundledApiUrl = fallbackApiUrl.trim()
  return runtimeApiUrl || bundledApiUrl
}

export function resetApiUrlCacheForTests(): void {
  cachedApiConfig = null
}

function buildFallbackDesktopConfig(): DesktopRuntimeConfigSummary {
  return {
    apiUrl: resolveApiBaseUrl(null),
    configPath: '',
    configSource: DEFAULT_CONFIG_SOURCE,
    legacyConfigPath: '',
    userDataConfigPath: '',
  }
}

export async function getDesktopApiConfig(): Promise<DesktopRuntimeConfigSummary> {
  if (cachedApiConfig === null) {
    // Check if running in Electron with desktop API available
    if (typeof window !== 'undefined' && window.openposDesktop?.getConfig) {
      const config = await window.openposDesktop.getConfig().catch(() => null)
      cachedApiConfig = config
        ? {
            apiUrl: resolveApiBaseUrl(config),
            configPath: config.configPath || '',
            configSource: config.configSource || DEFAULT_CONFIG_SOURCE,
            legacyConfigPath: config.legacyConfigPath || '',
            userDataConfigPath: config.userDataConfigPath || '',
          }
        : buildFallbackDesktopConfig()
    } else {
      // Fallback to build-time env var (development or web builds)
      cachedApiConfig = buildFallbackDesktopConfig()
    }
  }

  return cachedApiConfig
}

export async function getApiBaseUrl(): Promise<string> {
  const config = await getDesktopApiConfig()
  return config.apiUrl || ''
}

export async function getApiUrl(path: string): Promise<string> {
  const apiBaseUrl = await getApiBaseUrl()
  if (apiBaseUrl) {
    return `${apiBaseUrl}${path}`
  }
  return path
}
