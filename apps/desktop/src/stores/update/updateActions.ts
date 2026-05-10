import { type DesktopUpdateStatusEvent, getDesktopApi, type LinuxUpdateFormat } from '../../lib/desktop'
import {
  downloadError,
  downloadedUpdateFormat,
  downloadedUpdatePath,
  isChecking,
  isDownloading,
  isInstalling,
  lastCheckTime,
  type UpdateAssetFormat,
  updateAssetFormat,
  updateAssetName,
  updateAssetUrl,
  updateAvailable,
  updateDownloadProgress,
  updateReadyToInstall,
  updateReleaseNotes,
  updateReleaseUrl,
  updateVersion,
} from './updateStore'

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/dancaldera/OpenPOS/releases/latest'
const GITHUB_RELEASES_PAGE = 'https://github.com/dancaldera/OpenPOS/releases/latest'

interface GitHubReleaseAsset {
  name?: string
  browser_download_url?: string
}

interface GitHubLatestRelease {
  tag_name?: string
  html_url?: string
  body?: string
  assets?: GitHubReleaseAsset[]
}

let updateStatusUnsubscribe: (() => void) | null = null

function parseVersion(version: string): [number, number, number] | null {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return null
  }

  const [major, minor, patch] = version.split('.').map((part) => Number.parseInt(part, 10))
  if ([major, minor, patch].some((part) => Number.isNaN(part))) {
    return null
  }

  return [major, minor, patch]
}

export function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = parseVersion(latest)
  const currentParts = parseVersion(current)

  if (!latestParts || !currentParts) {
    return false
  }

  const [lMaj, lMin, lPatch] = latestParts
  const [cMaj, cMin, cPatch] = currentParts
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPatch > cPatch
}

function clearInstallState(): void {
  updateAssetFormat.value = null
  updateAssetName.value = null
  updateAssetUrl.value = null
  downloadedUpdateFormat.value = null
  downloadedUpdatePath.value = null
  updateDownloadProgress.value = 0
  isDownloading.value = false
  isInstalling.value = false
  updateReadyToInstall.value = false
}

function clearUpdateMetadata(): void {
  updateAvailable.value = false
  updateVersion.value = null
  updateReleaseUrl.value = null
  updateReleaseNotes.value = null
  clearInstallState()
}

function normalizeArchToken(arch: string): string[] {
  if (arch === 'arm64') {
    return ['arm64', 'aarch64']
  }

  if (arch === 'x64') {
    return ['x86_64', 'amd64', 'x64']
  }

  return [arch]
}

function pickAssetByExtension(
  assets: GitHubReleaseAsset[] = [],
  arch: string,
  extension: string,
): GitHubReleaseAsset | null {
  const matchingAssets = assets.filter(
    (asset) =>
      typeof asset.name === 'string' &&
      asset.name.toLowerCase().endsWith(extension) &&
      typeof asset.browser_download_url === 'string',
  )

  if (matchingAssets.length === 0) {
    return null
  }

  const archTokens = normalizeArchToken(arch)
  const archMatch = matchingAssets.find((asset) =>
    archTokens.some((token) => asset.name?.toLowerCase().includes(token)),
  )
  if (archMatch) {
    return archMatch
  }

  return matchingAssets.length === 1 ? matchingAssets[0] : null
}

export function pickAppImageAsset(assets: GitHubReleaseAsset[] = [], arch: string): GitHubReleaseAsset | null {
  return pickAssetByExtension(assets, arch, '.appimage')
}

export function pickDebAsset(assets: GitHubReleaseAsset[] = [], arch: string): GitHubReleaseAsset | null {
  return pickAssetByExtension(assets, arch, '.deb')
}

export function pickUpdateAsset(
  assets: GitHubReleaseAsset[] = [],
  arch: string,
  linuxUpdateFormat: LinuxUpdateFormat,
): { asset: GitHubReleaseAsset | null; format: UpdateAssetFormat | null } {
  if (linuxUpdateFormat === 'deb') {
    return { asset: pickDebAsset(assets, arch), format: 'deb' }
  }

  if (linuxUpdateFormat === 'appimage') {
    return { asset: pickAppImageAsset(assets, arch), format: 'appimage' }
  }

  return { asset: null, format: null }
}

function handleUpdateStatusEvent(event: DesktopUpdateStatusEvent): void {
  switch (event.phase) {
    case 'downloading':
      isDownloading.value = true
      isInstalling.value = false
      updateReadyToInstall.value = false
      updateDownloadProgress.value = typeof event.progress === 'number' ? event.progress : updateDownloadProgress.value
      break
    case 'downloaded':
      isDownloading.value = false
      isInstalling.value = false
      updateReadyToInstall.value = true
      updateDownloadProgress.value = 100
      downloadedUpdatePath.value = event.filePath ?? downloadedUpdatePath.value
      downloadedUpdateFormat.value = updateAssetFormat.value
      break
    case 'installing':
      isDownloading.value = false
      isInstalling.value = true
      break
    case 'error':
      isDownloading.value = false
      isInstalling.value = false
      downloadError.value = event.message ?? 'Update failed'
      break
  }
}

function ensureUpdateStatusSubscription(): void {
  if (updateStatusUnsubscribe) {
    return
  }

  const api = getDesktopApi()
  if (!api?.updates?.onStatusChange) {
    return
  }

  updateStatusUnsubscribe = api.updates.onStatusChange(handleUpdateStatusEvent)
}

if (typeof window !== 'undefined') {
  ensureUpdateStatusSubscription()
}

export const updateActions = {
  async checkForUpdate(): Promise<boolean> {
    if (isChecking.value) return false

    ensureUpdateStatusSubscription()
    isChecking.value = true
    downloadError.value = null

    try {
      const api = getDesktopApi()
      if (!api) return false

      const { version: currentVersion, platform, arch, githubToken, linuxUpdateFormat } = await api.getInfo()

      const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' }
      if (githubToken) {
        headers.Authorization = `Bearer ${githubToken}`
      }

      const response = await fetch(GITHUB_RELEASES_URL, {
        headers,
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        throw new Error(`GitHub API responded with ${response.status}`)
      }

      const release = (await response.json()) as GitHubLatestRelease
      const latestTag = release.tag_name ?? ''
      const latestVersion = latestTag.replace(/^v/, '')

      lastCheckTime.value = Date.now()

      if (latestVersion && isNewerVersion(latestVersion, currentVersion)) {
        const { asset: updateAsset, format } =
          platform === 'linux'
            ? pickUpdateAsset(release.assets, arch, linuxUpdateFormat)
            : { asset: null, format: null }

        updateVersion.value = latestVersion
        updateAvailable.value = true
        updateReleaseUrl.value = release.html_url ?? GITHUB_RELEASES_PAGE
        updateReleaseNotes.value = release.body ?? null
        clearInstallState()
        updateAssetFormat.value = updateAsset ? format : null
        updateAssetName.value = updateAsset?.name ?? null
        updateAssetUrl.value = updateAsset?.browser_download_url ?? null
        return true
      }

      clearUpdateMetadata()
      return false
    } catch (error) {
      clearUpdateMetadata()
      downloadError.value = error instanceof Error ? error.message : String(error)
      return false
    } finally {
      isChecking.value = false
    }
  },

  async downloadUpdate(): Promise<boolean> {
    if (isDownloading.value || isInstalling.value) {
      return false
    }

    ensureUpdateStatusSubscription()

    const api = getDesktopApi()
    const downloadUrl = updateAssetUrl.value
    const format = updateAssetFormat.value
    const version = updateVersion.value
    if (!api?.updates || !downloadUrl || !version || !format) {
      return false
    }

    downloadError.value = null
    updateDownloadProgress.value = 0
    isDownloading.value = true
    updateReadyToInstall.value = false

    try {
      const { filePath } =
        format === 'deb'
          ? await api.updates.downloadDebUpdate(downloadUrl, version)
          : await api.updates.downloadAppImageUpdate(downloadUrl, version)
      downloadedUpdatePath.value = filePath
      downloadedUpdateFormat.value = format
      updateReadyToInstall.value = true
      updateDownloadProgress.value = 100
      return true
    } catch (error) {
      isDownloading.value = false
      updateReadyToInstall.value = false
      downloadError.value = error instanceof Error ? error.message : String(error)
      return false
    }
  },

  async installAndRestart(): Promise<boolean> {
    if (isInstalling.value || isDownloading.value) {
      return false
    }

    const api = getDesktopApi()
    const tempPath = downloadedUpdatePath.value
    const format = downloadedUpdateFormat.value
    if (!api?.updates || !tempPath || !format) {
      return false
    }

    downloadError.value = null
    isInstalling.value = true

    try {
      if (format === 'deb') {
        await api.updates.installDownloadedDeb(tempPath)
        await api.updates.relaunch()
      } else {
        await api.updates.installDownloadedAppImage(tempPath)
        await api.updates.restartFromInstalledAppImage()
      }
      return true
    } catch (error) {
      isInstalling.value = false
      downloadError.value = error instanceof Error ? error.message : String(error)
      return false
    }
  },

  async downloadAndInstall(): Promise<boolean> {
    if (updateReadyToInstall.value && downloadedUpdatePath.value) {
      return this.installAndRestart()
    }

    return this.downloadUpdate()
  },

  dismissUpdate(): void {
    updateAvailable.value = false
  },

  clearError(): void {
    downloadError.value = null
  },
}
