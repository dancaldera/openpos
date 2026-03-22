import { type DesktopDbConnectionConfig, requireDesktopApi } from './desktop'
import { isDesktop } from './platform'

let cachedConfig: DesktopDbConnectionConfig | null = null

export async function loadDesktopDbConnectionConfig(forceRefresh = false): Promise<DesktopDbConnectionConfig> {
  if (!isDesktop) {
    return { configured: false }
  }

  if (cachedConfig && !forceRefresh) {
    return cachedConfig
  }

  const config = await requireDesktopApi().getDbConnectionConfig()
  cachedConfig = config
  return config
}

export function clearDesktopDbConnectionConfigCache(): void {
  cachedConfig = null
}
