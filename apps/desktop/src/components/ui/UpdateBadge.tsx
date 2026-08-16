/** @jsxImportSource preact */
import { signal, useSignal } from '@preact/signals'
import { useRef } from 'preact/hooks'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useTranslation } from '../../hooks/useTranslation'
import { getDesktopApi } from '../../lib/desktop'
import { isDesktop } from '../../lib/platform'
import { openFullSizeDialogCount } from '../../stores/ui/dialogStore'
import { updateActions } from '../../stores/update/updateActions'
import {
  downloadError,
  isChecking,
  isDownloading,
  isInstalling,
  lastCheckTime,
  updateAssetName,
  updateAssetUrl,
  updateAvailable,
  updateDownloadProgress,
  updateReadyToInstall,
  updateReleaseNotes,
  updateReleaseUrl,
  updateVersion,
} from '../../stores/update/updateStore'
import { SpinnerIcon } from './icons'

const currentAppInfo = signal<{
  version: string
  platform: string
  arch: string
} | null>(null)

const FALLBACK_RELEASE_URL = 'https://github.com/dancaldera/openpos/releases/latest'

if (isDesktop) {
  getDesktopApi()
    ?.getInfo()
    .then(({ version, platform, arch }) => {
      currentAppInfo.value = { version, platform, arch }
    })
    .catch(() => {})
}

interface UpdateBadgeLabels {
  updates: string
  checking: string
  checkForUpdates: string
  appUpdate: string
  checkForNewerRelease: string
  newVersionAvailable: string
  automaticInstallUnavailable: string
  downloadUpdate: string
  installAndRestart: string
  downloading: string
  installing: string
  readyToInstall: string
  downloadedAsset: string
  status: string
  installed: string
  latest: string
  lastChecked: string
  releaseNotes: string
  error: string
  viewRelease: string
}

export interface UpdateBadgeViewModelInput {
  available: boolean
  checking: boolean
  checkedAt: number
  downloadProgress: number
  downloading: boolean
  error: string | null
  installedVersion: string | null
  installing: boolean
  latestVersion: string | null
  readyToInstall: boolean
  releaseNotes: string | null
  releaseUrl: string | null
  updateAssetName: string | null
  updateAssetUrl: string | null
  labels: UpdateBadgeLabels
}

export function getUpdateBadgeViewModel({
  available,
  checking,
  checkedAt,
  downloadProgress,
  downloading,
  error,
  installedVersion,
  installing,
  latestVersion,
  readyToInstall,
  releaseNotes,
  releaseUrl,
  updateAssetName: assetName,
  updateAssetUrl: assetUrl,
  labels,
}: UpdateBadgeViewModelInput) {
  const canAutoInstall = available && Boolean(assetUrl)
  const progressLabel =
    downloading && downloadProgress > 0
      ? `${labels.downloading} ${downloadProgress}%`
      : downloading
        ? labels.downloading
        : null

  let headline = available ? labels.newVersionAvailable : labels.checkForNewerRelease
  if (available && !canAutoInstall) {
    headline = labels.automaticInstallUnavailable
  }

  let primaryLabel = labels.updates
  if (downloading) {
    primaryLabel = downloadProgress > 0 ? `${downloadProgress}%` : labels.downloading
  } else if (available && latestVersion) {
    primaryLabel = `v${latestVersion}`
  }

  let actionLabel = labels.downloadUpdate
  if (readyToInstall) {
    actionLabel = labels.installAndRestart
  } else if (installing) {
    actionLabel = labels.installing
  } else if (downloading) {
    actionLabel = progressLabel ?? labels.downloading
  }

  return {
    borderClass: 'border-fog-border',
    iconColorClass: available ? 'text-void' : 'text-graphite',
    headline,
    installedVersionLabel: installedVersion ?? '…',
    primaryLabel,
    latestVersionLabel: latestVersion,
    lastCheckedLabel: checkedAt > 0 ? new Date(checkedAt).toLocaleTimeString() : null,
    releaseNotesPreview: releaseNotes ? releaseNotes.slice(0, 200) : null,
    releaseUrl: releaseUrl ?? FALLBACK_RELEASE_URL,
    checkingLabel: checking ? labels.checking : labels.checkForUpdates,
    error,
    canAutoInstall,
    actionLabel,
    actionDisabled: checking || downloading || installing,
    showViewRelease: available,
    statusLabel: readyToInstall ? labels.readyToInstall : progressLabel,
    downloadedAssetLabel: readyToInstall ? assetName : null,
  }
}

function RocketIcon({ class: className }: { class?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="1.5"
      stroke="currentColor"
      class={className}
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"
      />
    </svg>
  )
}

export function UpdateBadge() {
  if (!isDesktop) return null

  const { t } = useTranslation()
  const labels: UpdateBadgeLabels = {
    updates: t('update.updates'),
    checking: t('update.checking'),
    checkForUpdates: t('update.checkForUpdates'),
    appUpdate: t('update.appUpdate'),
    checkForNewerRelease: t('update.checkForNewerRelease'),
    newVersionAvailable: t('update.newVersionAvailableShort'),
    automaticInstallUnavailable: t('update.automaticInstallUnavailable'),
    downloadUpdate: t('update.downloadUpdate'),
    installAndRestart: t('update.installAndRestart'),
    downloading: t('update.downloading'),
    installing: t('update.installing'),
    readyToInstall: t('update.readyToInstall'),
    downloadedAsset: t('update.downloadedAsset'),
    status: t('update.statusLabel'),
    installed: t('update.installedLabel'),
    latest: t('update.latestLabel'),
    lastChecked: t('update.lastCheckedLabel'),
    releaseNotes: t('update.releaseNotesLabel'),
    error: t('update.errorLabel'),
    viewRelease: t('update.viewRelease'),
  }

  const popoverOpen = useSignal(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const appInfo = currentAppInfo.value
  const installedVersion = appInfo?.version ?? null

  useClickOutside(wrapperRef, () => {
    popoverOpen.value = false
  })

  const checking = isChecking.value
  const available = updateAvailable.value
  const latestVersion = updateVersion.value
  const releaseUrl = updateReleaseUrl.value
  const releaseNotes = updateReleaseNotes.value
  const assetName = updateAssetName.value
  const assetUrl = updateAssetUrl.value
  const error = downloadError.value
  const checkedAt = lastCheckTime.value
  const downloading = isDownloading.value
  const installing = isInstalling.value
  const readyToInstall = updateReadyToInstall.value
  const downloadProgress = updateDownloadProgress.value

  const viewModel = getUpdateBadgeViewModel({
    available,
    checking,
    checkedAt,
    downloadProgress,
    downloading,
    error,
    installedVersion,
    installing,
    latestVersion,
    readyToInstall,
    releaseNotes,
    releaseUrl,
    updateAssetName: assetName,
    updateAssetUrl: assetUrl,
    labels,
  })

  async function handleViewRelease() {
    await getDesktopApi()?.updates.openReleasePage(viewModel.releaseUrl)
  }

  async function handleInstallAction() {
    if (readyToInstall) {
      await updateActions.installAndRestart()
      return
    }

    await updateActions.downloadUpdate()
  }

  if (openFullSizeDialogCount.value > 0) {
    popoverOpen.value = false
    return null
  }

  return (
    <div ref={wrapperRef} class="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
      {popoverOpen.value && (
        <div
          class={`mb-1 w-72 rounded-cards border ${viewModel.borderClass} bg-canvas shadow-sm text-xs text-graphite overflow-hidden`}
        >
          <div class="px-4 py-3 border-b border-fog-border">
            <p class="font-semibold text-void text-sm">{labels.appUpdate}</p>
            <p class="text-graphite mt-0.5">{viewModel.headline}</p>
          </div>

          <div class="px-4 py-3 space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-graphite">{labels.installed}</span>
              <span class="text-void">{viewModel.installedVersionLabel}</span>
            </div>

            {viewModel.latestVersionLabel && (
              <div class="flex items-center justify-between">
                <span class="text-graphite">{labels.latest}</span>
                <span class={available ? 'text-void font-medium' : 'text-void'}>{viewModel.latestVersionLabel}</span>
              </div>
            )}

            {viewModel.lastCheckedLabel && (
              <div class="flex items-center justify-between">
                <span class="text-graphite">{labels.lastChecked}</span>
                <span class="text-void">{viewModel.lastCheckedLabel}</span>
              </div>
            )}

            {viewModel.statusLabel && (
              <div class="space-y-1 pt-0.5">
                <span class="text-graphite">{labels.status}</span>
                <p class="text-void leading-relaxed">{viewModel.statusLabel}</p>
              </div>
            )}

            {viewModel.downloadedAssetLabel && (
              <div class="space-y-1 pt-0.5">
                <span class="text-graphite">{labels.downloadedAsset}</span>
                <p class="text-void leading-relaxed break-all">{viewModel.downloadedAssetLabel}</p>
              </div>
            )}

            {viewModel.releaseNotesPreview && (
              <div class="space-y-1 pt-0.5">
                <span class="text-graphite">{labels.releaseNotes}</span>
                <p class="text-void leading-relaxed line-clamp-3">{viewModel.releaseNotesPreview}</p>
              </div>
            )}

            {viewModel.error && (
              <div class="space-y-1 pt-0.5">
                <span class="text-graphite">{labels.error}</span>
                <p class="text-void leading-relaxed">{viewModel.error}</p>
              </div>
            )}
          </div>

          <div class="px-4 pb-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                void updateActions.checkForUpdate()
              }}
              disabled={checking || downloading || installing}
              class="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-buttons bg-chalk hover:bg-chalk text-void text-xs font-medium transition-colors disabled:opacity-50"
            >
              {checking && <SpinnerIcon class="w-3 h-3 animate-spin" />}
              {viewModel.checkingLabel}
            </button>

            {viewModel.canAutoInstall && (
              <button
                type="button"
                onClick={() => {
                  void handleInstallAction()
                }}
                disabled={viewModel.actionDisabled}
                class="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-buttons bg-void text-canvas text-xs font-medium transition-colors disabled:opacity-50"
              >
                {(downloading || installing) && <SpinnerIcon class="w-3 h-3 animate-spin" />}
                {viewModel.actionLabel}
              </button>
            )}

            {viewModel.showViewRelease && (
              <button
                type="button"
                onClick={() => {
                  void handleViewRelease()
                }}
                class="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-buttons bg-chalk text-void text-xs font-medium transition-colors"
              >
                {labels.viewRelease} ↗
              </button>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          popoverOpen.value = !popoverOpen.value
        }}
        class={`relative flex items-center gap-2 px-3 py-1.5 rounded-buttons border ${viewModel.borderClass} bg-canvas shadow-sm cursor-pointer select-none transition-opacity hover:opacity-90 active:scale-95`}
        title={labels.appUpdate}
      >
        {checking || downloading || installing ? (
          <SpinnerIcon class={`w-3 h-3 animate-spin ${viewModel.iconColorClass}`} />
        ) : (
          <span class="relative inline-flex">
            <RocketIcon class={`w-3 h-3 ${viewModel.iconColorClass}`} />
            {available && <span class="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-void" />}
          </span>
        )}
        <span class={`text-xs font-medium ${viewModel.iconColorClass}`}>{viewModel.primaryLabel}</span>
      </button>
    </div>
  )
}
