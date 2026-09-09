import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  downloadError,
  downloadedUpdateFormat,
  downloadedUpdatePath,
  isChecking,
  isDownloading,
  isInstalling,
  updateAssetFormat,
  updateAssetUrl,
  updateAvailable,
  updateDownloadProgress,
  updateReadyToInstall,
  updateVersion,
} from './updateStore'

vi.mock('../../lib/desktop', () => ({
  getDesktopApi: () => null,
}))

const { updateActions } = await import('./updateActions')

describe('updateActions without a desktop api', () => {
  beforeEach(() => {
    downloadError.value = null
    downloadedUpdateFormat.value = null
    downloadedUpdatePath.value = null
    isChecking.value = false
    isDownloading.value = false
    isInstalling.value = false
    updateAssetFormat.value = null
    updateAssetUrl.value = null
    updateAvailable.value = false
    updateDownloadProgress.value = 0
    updateReadyToInstall.value = false
    updateVersion.value = null
  })

  it('aborts the check without desktop info', async () => {
    await expect(updateActions.checkForUpdate()).resolves.toBe(false)

    expect(isChecking.value).toBe(false)
  })

  it('aborts downloads without desktop support', async () => {
    updateAssetUrl.value = 'https://example.com/x64'
    updateAssetFormat.value = 'appimage'
    updateVersion.value = '0.3.2'

    await expect(updateActions.downloadUpdate()).resolves.toBe(false)
  })

  it('aborts installs without desktop support', async () => {
    downloadedUpdatePath.value = '/tmp/openpos.AppImage'
    downloadedUpdateFormat.value = 'appimage'

    await expect(updateActions.installAndRestart()).resolves.toBe(false)
  })

  it('aborts deb downloads without desktop support', async () => {
    updateAssetUrl.value = 'https://example.com/amd64.deb'
    updateAssetFormat.value = 'deb'
    updateVersion.value = '0.3.2'

    await expect(updateActions.downloadAndInstall()).resolves.toBe(false)
  })
})
