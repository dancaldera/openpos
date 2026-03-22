/**
 * runtime-config.ts — Load Turso credentials from a user config file
 *
 * Allows users to configure Turso credentials at runtime via a config file
 * in the app-specific config directory after installing the pre-built AppImage.
 * This eliminates the need to rebuild the app for each deployment.
 *
 * Priority: build-time env vars > runtime config file
 */

import { type RuntimeConfig, requireDesktopApi } from './desktop'
import { isDesktop } from './platform'

let cachedConfig: RuntimeConfig | null | undefined

/**
 * Get the config file path for the current platform.
 * Returns the app-specific config path ending in config.json.
 */
async function getConfigPath(): Promise<string | null> {
  if (!isDesktop) return null
  return 'userData/config.json'
}

/**
 * Load runtime configuration from the config file.
 * Results are cached after the first successful read.
 *
 * @returns RuntimeConfig or null if file doesn't exist or can't be read
 */
export async function loadRuntimeConfig(): Promise<RuntimeConfig | null> {
  // Return cached result if available
  if (cachedConfig !== undefined) {
    return cachedConfig
  }

  if (!isDesktop) {
    cachedConfig = null
    return null
  }

  const configPath = await getConfigPath()
  if (!configPath) {
    console.warn('[RuntimeConfig] AppConfig path is unavailable')
    cachedConfig = null
    return null
  }

  try {
    const config = await requireDesktopApi().getRuntimeConfig()

    // Validate the config has at least one Turso field
    if (config.tursoDatabaseUrl || config.tursoAuthToken) {
      console.log('[RuntimeConfig] Loaded config from', configPath)
      cachedConfig = config
      return config
    }

    console.warn('[RuntimeConfig] Config file is missing Turso fields:', configPath)
    cachedConfig = null
    return null
  } catch (error) {
    // File doesn't exist or can't be read — missing files are expected on fresh installs
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('not found') || errorMessage.includes('No such file')) {
      console.warn('[RuntimeConfig] Config file not found:', configPath)
    } else if (
      errorMessage.includes('denied') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('scope')
    ) {
      console.warn('[RuntimeConfig] Config file cannot be read due to filesystem permissions:', configPath, error)
    } else {
      console.warn('[RuntimeConfig] Failed to read config file:', configPath, error)
    }
    cachedConfig = null
    return null
  }
}

/**
 * Clear the cached config (useful for testing or forced reload)
 */
export function clearConfigCache(): void {
  cachedConfig = undefined
}
