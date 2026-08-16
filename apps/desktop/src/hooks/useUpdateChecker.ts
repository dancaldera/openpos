import { updateActions } from '../stores/update/updateActions'
import {
  downloadError,
  hasUpdate,
  isChecking,
  isDownloading,
  isInstalling,
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
  isInstalling: boolean
  isChecking: boolean
  isUpdating: boolean
  error: string | null
  readyToInstall: boolean
  lastCheckTime: number

  // Actions
  checkForUpdate: () => Promise<boolean>
  downloadAndInstall: () => Promise<boolean>
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
    isInstalling: isInstalling.value,
    isChecking: isChecking.value,
    isUpdating: isUpdating.value,
    error: downloadError.value,
    readyToInstall: updateReadyToInstall.value,
    lastCheckTime: lastCheckTime.value,

    // Actions
    checkForUpdate: updateActions.checkForUpdate.bind(updateActions),
    downloadAndInstall: updateActions.downloadAndInstall.bind(updateActions),
    dismissUpdate: updateActions.dismissUpdate,
    clearError: updateActions.clearError,
  }
}
