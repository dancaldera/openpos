import { isTauri } from '../../lib/platform'
import {
  downloadError,
  isChecking,
  isDownloading,
  lastCheckTime,
  updateAvailable,
  updateDownloadProgress,
  updateReadyToInstall,
  updateVersion,
} from './updateStore'

// ---------------------------------------------------------------------------
// Tauri updater plugin types — loaded dynamically at runtime (Tauri only).
// We never statically import @tauri-apps/plugin-updater so the web bundle
// stays free of any Tauri-specific code.
// ---------------------------------------------------------------------------

/** Tauri Update type interface */
interface TauriUpdate {
  version: string
  downloadAndInstall: (
    onEvent?: (progress: TauriDownloadEvent) => void,
    options?: { headers?: HeadersInit; timeout?: number },
  ) => Promise<void>
}

/** Tauri download event type */
type TauriDownloadEvent =
  | {
      event: 'Started'
      data: {
        contentLength?: number
      }
    }
  | {
      event: 'Progress'
      data: {
        chunkLength: number
      }
    }
  | {
      event: 'Finished'
    }

/** Dynamically load the Tauri updater check function. Only call this inside Tauri. */
async function checkForUpdateTauri(): Promise<TauriUpdate | null> {
  const mod = await import('@tauri-apps/plugin-updater')
  return mod.check()
}

/** Dynamically load the Tauri process relaunch function. Only call this inside Tauri. */
async function relaunchTauri(): Promise<void> {
  const mod = await import('@tauri-apps/plugin-process')
  return mod.relaunch()
}

/**
 * Update actions for the auto-update system.
 * Provides methods to check for updates, download, and install them.
 */
export const updateActions = {
  /**
   * Check if an update is available.
   * Returns true if an update was found, false otherwise.
   */
  async checkForUpdate(): Promise<boolean> {
    // Skip in web mode
    if (!isTauri) {
      console.log('[UpdateActions] Skipping update check in web mode')
      return false
    }

    isChecking.value = true
    downloadError.value = null

    try {
      const update = await checkForUpdateTauri()

      lastCheckTime.value = Date.now()

      if (update) {
        updateAvailable.value = true
        updateVersion.value = update.version
        console.log(`[UpdateActions] Update available: ${update.version}`)
        return true
      } else {
        updateAvailable.value = false
        updateVersion.value = null
        console.log('[UpdateActions] No update available')
        return false
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check for updates'
      downloadError.value = errorMessage
      console.error('[UpdateActions] Update check failed:', errorMessage)
      return false
    } finally {
      isChecking.value = false
    }
  },

  /**
   * Download the update with progress tracking.
   * Returns true if download completed successfully.
   */
  async downloadAndInstall(onProgress?: (progress: number) => void): Promise<boolean> {
    // Skip in web mode
    if (!isTauri) {
      console.log('[UpdateActions] Skipping download in web mode')
      return false
    }

    isDownloading.value = true
    downloadError.value = null
    updateDownloadProgress.value = 0

    try {
      const update = await checkForUpdateTauri()

      if (!update) {
        downloadError.value = 'No update available'
        return false
      }

      let downloaded = 0
      let contentLength = 0

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0
            console.log(`[UpdateActions] Download started, size: ${contentLength} bytes`)
            break
          case 'Progress': {
            downloaded += event.data.chunkLength
            const progress = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0
            updateDownloadProgress.value = progress
            onProgress?.(progress)
            break
          }
          case 'Finished':
            console.log('[UpdateActions] Download finished')
            updateReadyToInstall.value = true
            break
        }
      })

      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to download update'
      downloadError.value = errorMessage
      console.error('[UpdateActions] Download failed:', errorMessage)
      return false
    } finally {
      isDownloading.value = false
    }
  },

  /**
   * Restart the app to apply the downloaded update.
   */
  async installAndRelaunch(): Promise<void> {
    // Skip in web mode
    if (!isTauri) {
      console.log('[UpdateActions] Cannot restart in web mode')
      return
    }

    try {
      console.log('[UpdateActions] Restarting app to apply update...')
      await relaunchTauri()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to restart app'
      downloadError.value = errorMessage
      console.error('[UpdateActions] Restart failed:', errorMessage)
    }
  },

  /**
   * Dismiss the current update notification.
   * User can be reminded later.
   */
  dismissUpdate(): void {
    updateAvailable.value = false
  },

  /**
   * Clear any error state.
   */
  clearError(): void {
    downloadError.value = null
  },
}
