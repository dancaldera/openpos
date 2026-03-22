import { updateActions } from '../stores/update/updateActions'
import {
  downloadError,
  hasUpdate,
  isChecking,
  isDownloading,
  isUpdating,
  lastCheckTime,
  updateAvailable,
  updateDownloadProgress,
  updateReadyToInstall,
  updateVersion,
} from '../stores/update/updateStore'

interface UseUpdateCheckerReturn {
  // Reactive state
  hasUpdate: boolean
  updateAvailable: boolean
  updateVersion: string | null
  downloadProgress: number
  isDownloading: boolean
  isChecking: boolean
  isUpdating: boolean
  error: string | null
  readyToInstall: boolean
  lastCheckTime: number

  // Actions
  checkForUpdate: () => Promise<boolean>
  downloadAndInstall: (onProgress?: (progress: number) => void) => Promise<boolean>
  installAndRelaunch: () => Promise<void>
  dismissUpdate: () => void
  clearError: () => void
}

/**
 * Hook for accessing update state and actions in components.
 * Provides reactive state from Preact signals and bound actions.
 */
export function useUpdateChecker(): UseUpdateCheckerReturn {
  return {
    // State from signals (reactive)
    hasUpdate: hasUpdate.value,
    updateAvailable: updateAvailable.value,
    updateVersion: updateVersion.value,
    downloadProgress: updateDownloadProgress.value,
    isDownloading: isDownloading.value,
    isChecking: isChecking.value,
    isUpdating: isUpdating.value,
    error: downloadError.value,
    readyToInstall: updateReadyToInstall.value,
    lastCheckTime: lastCheckTime.value,

    // Actions
    checkForUpdate: updateActions.checkForUpdate,
    downloadAndInstall: updateActions.downloadAndInstall,
    installAndRelaunch: updateActions.installAndRelaunch,
    dismissUpdate: updateActions.dismissUpdate,
    clearError: updateActions.clearError,
  }
}
