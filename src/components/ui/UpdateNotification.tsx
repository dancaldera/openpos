import { useSignal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import { useTranslation } from '../../hooks/useTranslation'
import { useUpdateChecker } from '../../hooks/useUpdateChecker'
import { isTauri } from '../../lib/platform'
import { updateService } from '../../services/update-service'

/**
 * Update notification badge and dialog component.
 * Shows a pulsing badge in the bottom-left corner when an update is available.
 * Clicking opens a dialog with download progress and install options.
 */
export function UpdateNotification() {
  const { t } = useTranslation()
  const {
    hasUpdate,
    updateVersion,
    downloadProgress,
    isDownloading,
    isChecking,
    error,
    readyToInstall,
    downloadAndInstall,
    installAndRelaunch,
    dismissUpdate,
    clearError,
  } = useUpdateChecker()

  const dialogOpen = useSignal(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Start background update checking on mount (Tauri only)
  useEffect(() => {
    if (!isTauri) return
    updateService.start()
    return () => updateService.stop()
  }, [])

  // Close dialog when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        dialogOpen.value = false
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Don't render anything in web mode or when no update
  if (!isTauri || !hasUpdate) {
    return null
  }

  const handleDownload = async () => {
    await downloadAndInstall()
  }

  const handleInstall = async () => {
    dialogOpen.value = false
    await installAndRelaunch()
  }

  const handleRemindLater = () => {
    dialogOpen.value = false
    dismissUpdate()
  }

  return (
    <div ref={wrapperRef} class="fixed bottom-4 left-4 z-50">
      {/* Badge */}
      <button
        type="button"
        onClick={() => {
          dialogOpen.value = !dialogOpen.value
          clearError()
        }}
        class="flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-gray-900/90 backdrop-blur-sm shadow-lg cursor-pointer select-none transition-all hover:opacity-90 active:scale-95"
        title={t('update.available')}
      >
        <span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
        <span class="text-xs font-medium text-blue-400">{t('update.available')}</span>
      </button>

      {/* Dialog */}
      {dialogOpen.value && (
        <div class="absolute bottom-12 left-0 w-72 rounded-lg border border-blue-500/30 bg-gray-900/95 backdrop-blur-sm shadow-xl text-sm text-gray-300 overflow-hidden">
          {/* Header */}
          <div class="px-4 py-3 border-b border-white/10">
            <p class="font-semibold text-white">{t('update.title')}</p>
            <p class="text-gray-400 mt-0.5 text-xs">
              {t('update.newVersionAvailable', { version: updateVersion ?? 'unknown' })}
            </p>
          </div>

          {/* Content */}
          <div class="px-4 py-3 space-y-3">
            {/* Progress bar when downloading */}
            {isDownloading && (
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-xs">
                  <span>{t('update.downloading')}</span>
                  <span class="text-blue-400">{downloadProgress}%</span>
                </div>
                <div class="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div class="h-full bg-blue-500 transition-all duration-300" style={`width: ${downloadProgress}%`} />
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div class="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{error}</div>
            )}

            {/* Checking indicator */}
            {isChecking && (
              <div class="flex items-center gap-2 text-xs text-gray-400">
                <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" role="img" aria-label="Loading">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('update.checking')}
              </div>
            )}

            {/* Ready to install message */}
            {readyToInstall && !isDownloading && (
              <div class="px-3 py-2 rounded bg-green-500/10 border border-green-500/30 text-green-400 text-xs">
                {t('update.readyToInstall')}
              </div>
            )}
          </div>

          {/* Actions */}
          <div class="px-4 py-3 border-t border-white/10 flex gap-2">
            {readyToInstall ? (
              <button
                type="button"
                onClick={handleInstall}
                class="flex-1 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors"
              >
                {t('update.installAndRestart')}
              </button>
            ) : isDownloading ? (
              <button
                type="button"
                disabled
                class="flex-1 px-3 py-1.5 rounded bg-gray-700 text-gray-400 text-xs font-medium cursor-not-allowed"
              >
                {t('update.downloading')}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownload}
                disabled={isChecking}
                class="flex-1 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 text-white text-xs font-medium transition-colors disabled:cursor-not-allowed"
              >
                {t('update.downloadNow')}
              </button>
            )}
            <button
              type="button"
              onClick={handleRemindLater}
              disabled={isDownloading}
              class="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 text-xs font-medium transition-colors disabled:cursor-not-allowed"
            >
              {t('update.remindLater')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
