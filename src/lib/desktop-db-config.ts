import { isTauri } from './platform'

export interface DesktopDbConnectionConfig {
  url?: string
  authToken?: string
  configured: boolean
}

let cachedConfig: DesktopDbConnectionConfig | null = null

export async function loadDesktopDbConnectionConfig(forceRefresh = false): Promise<DesktopDbConnectionConfig> {
  if (!isTauri) {
    return { configured: false }
  }

  if (cachedConfig && !forceRefresh) {
    return cachedConfig
  }

  const { invoke } = await import('@tauri-apps/api/core')
  const config = await invoke<DesktopDbConnectionConfig>('get_db_connection_config')
  cachedConfig = config
  return config
}

export function clearDesktopDbConnectionConfigCache(): void {
  cachedConfig = null
}
