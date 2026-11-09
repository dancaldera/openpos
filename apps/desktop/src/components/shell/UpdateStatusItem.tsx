import type { DropdownMenuItemData } from '@astryxdesign/core/DropdownMenu'
import { MoreMenu } from '@astryxdesign/core/MoreMenu'
import { SideNavItem } from '@astryxdesign/core/SideNav'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { signal } from '@preact/signals-react'
import { CircleArrowUp } from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { getDesktopApi } from '../../lib/desktop'
import { isDesktop } from '../../lib/platform'
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

const FALLBACK_RELEASE_URL = 'https://releases.pos.softmelody.dev'

const currentAppInfo = signal<{ version: string; platform: string; arch: string } | null>(null)

if (isDesktop) {
  getDesktopApi()
    ?.getInfo()
    .then(({ version, platform, arch }) => {
      currentAppInfo.value = { version, platform, arch }
    })
    .catch(() => {})
}

export interface UpdateLabels {
  updates: string
  checking: string
  checkForUpdates: string
  checkForNewerRelease: string
  newVersionAvailable: string
  automaticInstallUnavailable: string
  downloadUpdate: string
  installAndRestart: string
  downloading: string
  installing: string
  readyToInstall: string
}

export interface UpdateViewModelInput {
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
  labels: UpdateLabels
}

/** Pure description of what the update item should show for the current update state. */
export function getUpdateViewModel({
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
}: UpdateViewModelInput) {
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
    headline,
    installedVersionLabel: installedVersion ?? '-',
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
    /** Whether there is anything worth surfacing outside of an explicit check. */
    hasActivity: available || readyToInstall || downloading || installing,
    isBusy: checking || downloading || installing,
  }
}

export type UpdateViewModel = ReturnType<typeof getUpdateViewModel>

/** Reads the update signals and exposes the view model plus its actions. */
export function useUpdateStatus() {
  const { t } = useTranslation()
  const readyToInstall = updateReadyToInstall.value
  const viewModel = getUpdateViewModel({
    available: updateAvailable.value,
    checking: isChecking.value,
    checkedAt: lastCheckTime.value,
    downloadProgress: updateDownloadProgress.value,
    downloading: isDownloading.value,
    error: downloadError.value,
    installedVersion: currentAppInfo.value?.version ?? null,
    installing: isInstalling.value,
    latestVersion: updateVersion.value,
    readyToInstall,
    releaseNotes: updateReleaseNotes.value,
    releaseUrl: updateReleaseUrl.value,
    updateAssetName: updateAssetName.value,
    updateAssetUrl: updateAssetUrl.value,
    labels: {
      updates: t('update.updates'),
      checking: t('update.checking'),
      checkForUpdates: t('update.checkForUpdates'),
      checkForNewerRelease: t('update.checkForNewerRelease'),
      newVersionAvailable: t('update.newVersionAvailableShort'),
      automaticInstallUnavailable: t('update.automaticInstallUnavailable'),
      downloadUpdate: t('update.downloadUpdate'),
      installAndRestart: t('update.installAndRestart'),
      downloading: t('update.downloading'),
      installing: t('update.installing'),
      readyToInstall: t('update.readyToInstall'),
    },
  })

  return {
    viewModel,
    readyToInstall,
    downloadProgress: updateDownloadProgress.value,
    checkForUpdate: () => updateActions.checkForUpdate(),
    runPrimaryAction: async () => {
      if (readyToInstall) {
        await updateActions.installAndRestart()
        return
      }
      await updateActions.downloadUpdate()
    },
    viewRelease: async () => {
      await getDesktopApi()?.updates.openReleasePage(viewModel.releaseUrl)
    },
  }
}

/**
 * Sidebar footer row for desktop app updates. Hidden until an update is
 * available or in progress; details and actions live in its menu.
 */
export function UpdateStatusItem() {
  const { t } = useTranslation()
  const { viewModel, readyToInstall, checkForUpdate, runPrimaryAction, viewRelease } = useUpdateStatus()

  if (!isDesktop || !viewModel.hasActivity) return null

  const info = (label: string, value: string, id: string): DropdownMenuItemData => ({
    id,
    label,
    endContent: value,
  })

  const details: DropdownMenuItemData[] = [
    info(t('update.installedLabel'), viewModel.installedVersionLabel, 'installed'),
  ]
  if (viewModel.latestVersionLabel) details.push(info(t('update.latestLabel'), viewModel.latestVersionLabel, 'latest'))
  if (viewModel.lastCheckedLabel)
    details.push(info(t('update.lastCheckedLabel'), viewModel.lastCheckedLabel, 'checked'))
  if (viewModel.statusLabel)
    details.push({ id: 'status', label: t('update.statusLabel'), description: viewModel.statusLabel })
  if (viewModel.downloadedAssetLabel) {
    details.push({ id: 'asset', label: t('update.downloadedAsset'), description: viewModel.downloadedAssetLabel })
  }
  if (viewModel.releaseNotesPreview) {
    details.push({ id: 'notes', label: t('update.releaseNotesLabel'), description: viewModel.releaseNotesPreview })
  }
  if (viewModel.error) details.push({ id: 'error', label: t('update.errorLabel'), description: viewModel.error })

  const actions: DropdownMenuItemData[] = []
  if (viewModel.canAutoInstall) {
    actions.push({
      id: 'install',
      label: viewModel.actionLabel,
      isDisabled: viewModel.actionDisabled,
      onClick: () => void runPrimaryAction(),
    })
  }
  if (viewModel.showViewRelease) {
    actions.push({ id: 'release', label: t('update.viewRelease'), onClick: () => void viewRelease() })
  }
  actions.push({
    id: 'check',
    label: viewModel.checkingLabel,
    isDisabled: viewModel.actionDisabled,
    onClick: () => void checkForUpdate(),
  })

  const itemLabel = readyToInstall
    ? t('update.restartToUpdate')
    : viewModel.isBusy && viewModel.statusLabel
      ? viewModel.statusLabel
      : t('update.updateAvailable')

  return (
    <SideNavItem
      label={itemLabel}
      icon={CircleArrowUp}
      endContent={
        viewModel.latestVersionLabel && !viewModel.isBusy ? (
          <Text type="supporting" hasTabularNumbers>
            {viewModel.primaryLabel}
          </Text>
        ) : (
          <StatusDot variant="accent" label={viewModel.headline} isPulsing={viewModel.isBusy} />
        )
      }
      actions={
        <MoreMenu
          size="sm"
          label={t('update.appUpdate')}
          placement="above"
          items={[
            { type: 'section', id: 'details', title: viewModel.headline, items: details },
            { type: 'divider' },
            { type: 'section', id: 'actions', items: actions },
          ]}
        />
      }
    />
  )
}
