/**
 * runtime-config.ts — Load Turso credentials from a user config file
 *
 * Allows users to configure Turso credentials at runtime via a config file
 * (~/.config/openpos/config.json) after installing the pre-built AppImage.
 * This eliminates the need to rebuild the app for each deployment.
 *
 * Priority: build-time env vars > runtime config file
 */

import { isTauri } from './platform'

export interface RuntimeConfig {
  tursoDatabaseUrl?: string
  tursoAuthToken?: string
}

let cachedConfig: RuntimeConfig | null | undefined

/**
 * Get the config file path for the current platform.
 * Returns ~/.config/openpos/config.json on all platforms.
 */
async function getConfigPath(): Promise<string | null> {
  if (!isTauri) return null

  try {
    // Dynamic import — only loaded in Tauri context
    const { homeDir, join } = await import('@tauri-apps/api/path')
    const home = await homeDir()
    return await join(home, '.config', 'openpos', 'config.json')
  } catch (error) {
    console.warn('[RuntimeConfig] Failed to get config path:', error)
    return null
  }
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

  if (!isTauri) {
    cachedConfig = null
    return null
  }

  const configPath = await getConfigPath()
  if (!configPath) {
    cachedConfig = null
    return null
  }

  try {
    // Dynamic import — only loaded in Tauri context
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const content = await readTextFile(configPath)
    const config = JSON.parse(content) as RuntimeConfig

    // Validate the config has at least one Turso field
    if (config.tursoDatabaseUrl || config.tursoAuthToken) {
      console.log('[RuntimeConfig] Loaded config from', configPath)
      cachedConfig = config
      return config
    }

    console.warn('[RuntimeConfig] Config file missing Turso fields')
    cachedConfig = null
    return null
  } catch (error) {
    // File doesn't exist or can't be parsed — this is expected on fresh installs
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (!errorMessage.includes('not found') && !errorMessage.includes('No such file')) {
      console.warn('[RuntimeConfig] Failed to load config:', error)
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
