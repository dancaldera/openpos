import { beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  downloadError,
  downloadedUpdateFormat,
  downloadedUpdatePath,
  isChecking,
  isDownloading,
  isInstalling,
  lastCheckTime,
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

let desktopInfo: {
  version: string
  platform: string
  arch: string
  linuxUpdateFormat: 'appimage' | 'deb' | null
  githubToken: string | null
} = {
  version: '0.3.1',
  platform: 'linux',
  arch: 'x64',
  linuxUpdateFormat: 'appimage',
  githubToken: null,
}

const getInfo = mock(async () => desktopInfo)
const openReleasePage = mock(async () => {})
const downloadAppImageUpdate = mock(async () => ({ filePath: '/tmp/openpos-0.3.2.AppImage' }))
const downloadDebUpdate = mock(async () => ({ filePath: '/tmp/openpos-0.3.2.deb' }))
const installDownloadedAppImage = mock(async () => {})
const installDownloadedDeb = mock(async () => {})
const restartFromInstalledAppImage = mock(async () => {})
const relaunch = mock(async () => {})
const onStatusChange = mock(() => () => {})

mock.module('../../lib/desktop', () => ({
  getDesktopApi: () => ({
    getInfo,
    updates: {
      openReleasePage,
      downloadAppImageUpdate,
      downloadDebUpdate,
      installDownloadedAppImage,
      installDownloadedDeb,
      restartFromInstalledAppImage,
      relaunch,
      onStatusChange,
    },
  }),
}))

const { isNewerVersion, pickAppImageAsset, pickDebAsset, updateActions } = await import('./updateActions')

describe('isNewerVersion', () => {
  it('detects newer semantic versions', () => {
    expect(isNewerVersion('1.2.4', '1.2.3')).toBe(true)
    expect(isNewerVersion('1.3.0', '1.2.9')).toBe(true)
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true)
  })

  it('returns false for equal, older, or invalid versions', () => {
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false)
    expect(isNewerVersion('1.2.2', '1.2.3')).toBe(false)
    expect(isNewerVersion('invalid', '1.2.3')).toBe(false)
    expect(isNewerVersion('1.2', '1.2.3')).toBe(false)
  })
})

describe('pickAppImageAsset', () => {
  it('selects the matching linux asset for x64', () => {
    const asset = pickAppImageAsset(
      [
        { name: 'openpos-0.3.2-arm64.AppImage', browser_download_url: 'https://example.com/arm64' },
        { name: 'openpos-0.3.2-x86_64.AppImage', browser_download_url: 'https://example.com/x64' },
      ],
      'x64',
    )

    expect(asset?.browser_download_url).toBe('https://example.com/x64')
  })

  it('returns the only AppImage when arch-specific naming is absent', () => {
    const asset = pickAppImageAsset(
      [{ name: 'openpos-0.3.2.AppImage', browser_download_url: 'https://example.com/openpos' }],
      'x64',
    )

    expect(asset?.name).toBe('openpos-0.3.2.AppImage')
  })
})

describe('pickDebAsset', () => {
  it('selects the matching Debian asset for x64', () => {
    const asset = pickDebAsset(
      [
        { name: 'openpos-0.3.2-arm64.deb', browser_download_url: 'https://example.com/arm64' },
        { name: 'openpos-0.3.2-amd64.deb', browser_download_url: 'https://example.com/amd64' },
      ],
      'x64',
    )

    expect(asset?.browser_download_url).toBe('https://example.com/amd64')
  })
})

describe('updateActions.checkForUpdate', () => {
  beforeEach(() => {
    desktopInfo = {
      version: '0.3.1',
      platform: 'linux',
      arch: 'x64',
      linuxUpdateFormat: 'appimage',
      githubToken: null,
    }
    getInfo.mockClear()
    openReleasePage.mockClear()
    downloadAppImageUpdate.mockClear()
    downloadDebUpdate.mockClear()
    installDownloadedAppImage.mockClear()
    installDownloadedDeb.mockClear()
    restartFromInstalledAppImage.mockClear()
    relaunch.mockClear()
    onStatusChange.mockClear()

    downloadError.value = null
    downloadedUpdateFormat.value = null
    downloadedUpdatePath.value = null
    isChecking.value = false
    isDownloading.value = false
    isInstalling.value = false
    lastCheckTime.value = 0
    updateAssetFormat.value = null
    updateAssetName.value = null
    updateAssetUrl.value = null
    updateAvailable.value = false
    updateDownloadProgress.value = 0
    updateReadyToInstall.value = false
    updateReleaseNotes.value = null
    updateReleaseUrl.value = null
    updateVersion.value = null
  })

  it('stores release metadata and AppImage asset when a newer version exists', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            tag_name: 'v0.3.2',
            html_url: 'https://github.com/dancaldera/OpenPOS/releases/tag/v0.3.2',
            body: 'Release notes for 0.3.2',
            assets: [
              {
                name: 'openpos-0.3.2-x86_64.AppImage',
                browser_download_url: 'https://github.com/dancaldera/OpenPOS/releases/download/v0.3.2/openpos.AppImage',
              },
            ],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch

    const result = await updateActions.checkForUpdate()

    expect(result).toBe(true)
    expect(getInfo).toHaveBeenCalledTimes(1)
    expect(updateAvailable.value).toBe(true)
    expect(updateVersion.value).toBe('0.3.2')
    expect(updateReleaseUrl.value).toBe('https://github.com/dancaldera/OpenPOS/releases/tag/v0.3.2')
    expect(updateReleaseNotes.value).toBe('Release notes for 0.3.2')
    expect(updateAssetFormat.value).toBe('appimage')
    expect(updateAssetName.value).toBe('openpos-0.3.2-x86_64.AppImage')
    expect(updateAssetUrl.value).toBe('https://github.com/dancaldera/OpenPOS/releases/download/v0.3.2/openpos.AppImage')
    expect(lastCheckTime.value).toBeGreaterThan(0)
    expect(downloadError.value).toBeNull()
    expect(isChecking.value).toBe(false)
  })

  it('keeps the release visible but disables auto-install when no AppImage asset exists', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            tag_name: 'v0.3.2',
            html_url: 'https://github.com/dancaldera/OpenPOS/releases/tag/v0.3.2',
            body: 'Release notes for 0.3.2',
            assets: [],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch

    const result = await updateActions.checkForUpdate()

    expect(result).toBe(true)
    expect(updateAvailable.value).toBe(true)
    expect(updateAssetName.value).toBeNull()
    expect(updateAssetUrl.value).toBeNull()
  })

  it('stores release metadata and Debian package asset on Debian-family systems', async () => {
    desktopInfo = {
      version: '0.3.1',
      platform: 'linux',
      arch: 'x64',
      linuxUpdateFormat: 'deb',
      githubToken: null,
    }
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            tag_name: 'v0.3.2',
            html_url: 'https://github.com/dancaldera/OpenPOS/releases/tag/v0.3.2',
            body: 'Release notes for 0.3.2',
            assets: [
              {
                name: 'openpos-0.3.2-x86_64.AppImage',
                browser_download_url: 'https://github.com/dancaldera/OpenPOS/releases/download/v0.3.2/openpos.AppImage',
              },
              {
                name: 'openpos-0.3.2-amd64.deb',
                browser_download_url: 'https://github.com/dancaldera/OpenPOS/releases/download/v0.3.2/openpos.deb',
              },
            ],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch

    const result = await updateActions.checkForUpdate()

    expect(result).toBe(true)
    expect(updateAssetFormat.value).toBe('deb')
    expect(updateAssetName.value).toBe('openpos-0.3.2-amd64.deb')
    expect(updateAssetUrl.value).toBe('https://github.com/dancaldera/OpenPOS/releases/download/v0.3.2/openpos.deb')
  })

  it('keeps the release visible but disables auto-install when no Debian asset exists', async () => {
    desktopInfo = {
      version: '0.3.1',
      platform: 'linux',
      arch: 'x64',
      linuxUpdateFormat: 'deb',
      githubToken: null,
    }
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            tag_name: 'v0.3.2',
            html_url: 'https://github.com/dancaldera/OpenPOS/releases/tag/v0.3.2',
            body: 'Release notes for 0.3.2',
            assets: [
              {
                name: 'openpos-0.3.2-x86_64.AppImage',
                browser_download_url: 'https://github.com/dancaldera/OpenPOS/releases/download/v0.3.2/openpos.AppImage',
              },
            ],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch

    const result = await updateActions.checkForUpdate()

    expect(result).toBe(true)
    expect(updateAvailable.value).toBe(true)
    expect(updateAssetFormat.value).toBeNull()
    expect(updateAssetName.value).toBeNull()
    expect(updateAssetUrl.value).toBeNull()
  })

  it('clears stale release metadata when the installed version is current', async () => {
    updateAvailable.value = true
    updateVersion.value = '0.3.9'
    updateReleaseUrl.value = 'https://github.com/dancaldera/OpenPOS/releases/tag/v0.3.9'
    updateReleaseNotes.value = 'Old notes'
    updateAssetFormat.value = 'appimage'
    updateAssetName.value = 'old.AppImage'
    updateAssetUrl.value = 'https://example.com/old.AppImage'

    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            tag_name: 'v0.3.1',
            html_url: 'https://github.com/dancaldera/OpenPOS/releases/tag/v0.3.1',
            body: 'Already installed',
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch

    const result = await updateActions.checkForUpdate()

    expect(result).toBe(false)
    expect(updateAvailable.value).toBe(false)
    expect(updateVersion.value).toBeNull()
    expect(updateReleaseUrl.value).toBeNull()
    expect(updateReleaseNotes.value).toBeNull()
    expect(updateAssetFormat.value).toBeNull()
    expect(updateAssetName.value).toBeNull()
    expect(updateAssetUrl.value).toBeNull()
    expect(downloadError.value).toBeNull()
  })

  it('surfaces API errors and clears stale release metadata', async () => {
    updateAvailable.value = true
    updateVersion.value = '0.3.9'
    updateReleaseUrl.value = 'https://github.com/dancaldera/OpenPOS/releases/tag/v0.3.9'
    updateReleaseNotes.value = 'Old notes'
    updateAssetFormat.value = 'appimage'

    globalThis.fetch = mock(async () => new Response('rate limited', { status: 503 })) as unknown as typeof fetch

    const result = await updateActions.checkForUpdate()

    expect(result).toBe(false)
    expect(updateAvailable.value).toBe(false)
    expect(updateVersion.value).toBeNull()
    expect(updateReleaseUrl.value).toBeNull()
    expect(updateReleaseNotes.value).toBeNull()
    expect(downloadError.value).toBe('GitHub API responded with 503')
    expect(isChecking.value).toBe(false)
  })
})

describe('updateActions.downloadAndInstall', () => {
  beforeEach(() => {
    downloadAppImageUpdate.mockClear()
    downloadDebUpdate.mockClear()
    installDownloadedAppImage.mockClear()
    installDownloadedDeb.mockClear()
    restartFromInstalledAppImage.mockClear()
    relaunch.mockClear()

    downloadError.value = null
    downloadedUpdateFormat.value = null
    downloadedUpdatePath.value = null
    isDownloading.value = false
    isInstalling.value = false
    updateAssetUrl.value = 'https://example.com/openpos-0.3.2.AppImage'
    updateVersion.value = '0.3.2'
    updateAssetFormat.value = 'appimage'
    updateReadyToInstall.value = false
  })

  it('downloads the update when it is not ready yet', async () => {
    const result = await updateActions.downloadAndInstall()

    expect(result).toBe(true)
    expect(downloadAppImageUpdate).toHaveBeenCalledWith('https://example.com/openpos-0.3.2.AppImage', '0.3.2')
    expect(downloadedUpdatePath.value).toBe('/tmp/openpos-0.3.2.AppImage')
    expect(downloadedUpdateFormat.value).toBe('appimage')
    expect(updateReadyToInstall.value).toBe(true)
  })

  it('installs and restarts once the AppImage has been downloaded', async () => {
    downloadedUpdatePath.value = '/tmp/openpos-0.3.2.AppImage'
    downloadedUpdateFormat.value = 'appimage'
    updateReadyToInstall.value = true

    const result = await updateActions.downloadAndInstall()

    expect(result).toBe(true)
    expect(installDownloadedAppImage).toHaveBeenCalledWith('/tmp/openpos-0.3.2.AppImage')
    expect(restartFromInstalledAppImage).toHaveBeenCalledTimes(1)
  })

  it('downloads a Debian package update when selected', async () => {
    updateAssetFormat.value = 'deb'
    updateAssetUrl.value = 'https://example.com/openpos-0.3.2.deb'

    const result = await updateActions.downloadAndInstall()

    expect(result).toBe(true)
    expect(downloadDebUpdate).toHaveBeenCalledWith('https://example.com/openpos-0.3.2.deb', '0.3.2')
    expect(downloadedUpdatePath.value).toBe('/tmp/openpos-0.3.2.deb')
    expect(downloadedUpdateFormat.value).toBe('deb')
  })

  it('installs a Debian package update and relaunches', async () => {
    downloadedUpdatePath.value = '/tmp/openpos-0.3.2.deb'
    downloadedUpdateFormat.value = 'deb'
    updateReadyToInstall.value = true

    const result = await updateActions.downloadAndInstall()

    expect(result).toBe(true)
    expect(installDownloadedDeb).toHaveBeenCalledWith('/tmp/openpos-0.3.2.deb')
    expect(relaunch).toHaveBeenCalledTimes(1)
  })
})
