import { getDesktopApi } from '../../lib/desktop'
import {
  downloadError,
  isChecking,
  lastCheckTime,
  updateAvailable,
  updateReleaseNotes,
  updateReleaseUrl,
  updateVersion,
} from './updateStore'

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/dancaldera/OpenPOS/releases/latest'
const GITHUB_RELEASES_PAGE = 'https://github.com/dancaldera/OpenPOS/releases/latest'

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

function clearUpdateMetadata(): void {
  updateAvailable.value = false
  updateVersion.value = null
  updateReleaseUrl.value = null
  updateReleaseNotes.value = null
}

export const updateActions = {
  async checkForUpdate(): Promise<boolean> {
    if (isChecking.value) return false

    isChecking.value = true
    downloadError.value = null

    try {
      const api = getDesktopApi()
      if (!api) return false

      const { version: currentVersion } = await api.getInfo()

      const response = await fetch(GITHUB_RELEASES_URL, {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        throw new Error(`GitHub API responded with ${response.status}`)
      }

      const release = await response.json()
      const latestTag: string = release.tag_name ?? ''
      const latestVersion = latestTag.replace(/^v/, '')

      lastCheckTime.value = Date.now()

      if (latestVersion && isNewerVersion(latestVersion, currentVersion)) {
        updateVersion.value = latestVersion
        updateAvailable.value = true
        updateReleaseUrl.value = release.html_url ?? GITHUB_RELEASES_PAGE
        updateReleaseNotes.value = release.body ?? null
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

  async downloadAndInstall(): Promise<boolean> {
    const api = getDesktopApi()
    if (!api?.updates) return false
    const url = updateReleaseUrl.value ?? GITHUB_RELEASES_PAGE
    await api.updates.openReleasePage(url)
    return true
  },

  dismissUpdate(): void {
    updateAvailable.value = false
  },

  clearError(): void {
    downloadError.value = null
  },
}
