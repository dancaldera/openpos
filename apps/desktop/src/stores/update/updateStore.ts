import { computed, signal } from '@preact/signals'

/**
 * Update state signals for the auto-update system.
 * These signals track update availability, download progress, and errors.
 */

export const updateAvailable = signal(false)
export const updateVersion = signal<string | null>(null)
export const updateAssetName = signal<string | null>(null)
export const updateAssetUrl = signal<string | null>(null)
export const downloadedUpdatePath = signal<string | null>(null)
export const updateDownloadProgress = signal(0)
export const isDownloading = signal(false)
export const isInstalling = signal(false)
export const isChecking = signal(false)
export const downloadError = signal<string | null>(null)
export const lastCheckTime = signal(0)
export const updateReadyToInstall = signal(false)
export const updateReleaseUrl = signal<string | null>(null)
export const updateReleaseNotes = signal<string | null>(null)

/**
 * Computed: True when an update is available and has a version
 */
export const hasUpdate = computed(() => updateAvailable.value && updateVersion.value !== null)

/**
 * Computed: True when any update operation is in progress
 */
export const isUpdating = computed(() => isChecking.value || isDownloading.value || isInstalling.value)
