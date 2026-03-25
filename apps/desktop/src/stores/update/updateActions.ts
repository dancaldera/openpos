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

function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(Number)
  const [lMaj, lMin, lPatch] = parse(latest)
  const [cMaj, cMin, cPatch] = parse(current)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPatch > cPatch
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

      updateAvailable.value = false
      updateVersion.value = null
      return false
    } catch (error) {
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
