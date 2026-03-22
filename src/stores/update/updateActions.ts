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
    isChecking.value = false
    updateAvailable.value = false
    updateVersion.value = null
    lastCheckTime.value = Date.now()
    downloadError.value = null
    return false
  },

  /**
   * Download the update with progress tracking.
   * Returns true if download completed successfully.
   */
  async downloadAndInstall(onProgress?: (progress: number) => void): Promise<boolean> {
    isDownloading.value = false
    updateDownloadProgress.value = 0
    updateReadyToInstall.value = false
    downloadError.value = 'Desktop auto-updates are disabled in the Electron migration'
    onProgress?.(0)
    return false
  },

  /**
   * Restart the app to apply the downloaded update.
   */
  async installAndRelaunch(): Promise<void> {
    downloadError.value = 'Desktop auto-updates are disabled in the Electron migration'
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
