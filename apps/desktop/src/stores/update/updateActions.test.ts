import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  updateAssetSha256,
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
  updateFormat: 'appimage' | 'deb' | 'mac-zip' | null
} = {
  version: '0.3.1',
  platform: 'linux',
  arch: 'x64',
  updateFormat: 'appimage',
}

const {
  getInfo,
  openReleasePage,
  downloadAppImageUpdate,
  downloadDebUpdate,
  downloadMacZipUpdate,
  installDownloadedAppImage,
  installDownloadedDeb,
  installDownloadedMacZip,
  restartFromInstalledAppImage,
  restartFromInstalledDeb,
  restartFromUpdatedMacApp,
  relaunch,
  onStatusChange,
} = vi.hoisted(() => ({
  getInfo: vi.fn(async () => desktopInfo),
  openReleasePage: vi.fn(async () => {}),
  downloadAppImageUpdate: vi.fn(async () => ({ filePath: '/tmp/openpos-0.3.2.AppImage' })),
  downloadDebUpdate: vi.fn(async () => ({ filePath: '/tmp/openpos-0.3.2.deb' })),
  downloadMacZipUpdate: vi.fn(async () => ({ filePath: '/tmp/openpos-arm64.zip' })),
  installDownloadedAppImage: vi.fn(async () => {}),
  installDownloadedDeb: vi.fn(async () => {}),
  installDownloadedMacZip: vi.fn(async () => {}),
  restartFromInstalledAppImage: vi.fn(async () => {}),
  restartFromInstalledDeb: vi.fn(async () => {}),
  restartFromUpdatedMacApp: vi.fn(async () => {}),
  relaunch: vi.fn(async () => {}),
  onStatusChange: vi.fn(() => () => {}),
}))

vi.mock('../../lib/desktop', () => ({
  getDesktopApi: () => ({
    getInfo,
    updates: {
      openReleasePage,
      downloadAppImageUpdate,
      downloadDebUpdate,
      downloadMacZipUpdate,
      installDownloadedAppImage,
      installDownloadedDeb,
      installDownloadedMacZip,
      restartFromInstalledAppImage,
      restartFromInstalledDeb,
      restartFromUpdatedMacApp,
      relaunch,
      onStatusChange,
    },
  }),
}))

const { isNewerVersion, pickAppImageAsset, pickDebAsset, pickMacZipAsset, updateActions } = await import(
  './updateActions'
)

function manifestResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

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
        { name: 'openpos-0.3.2-arm64.AppImage', url: 'https://example.com/arm64' },
        { name: 'openpos-0.3.2-x86_64.AppImage', url: 'https://example.com/x64' },
      ],
      'x64',
    )

    expect(asset?.url).toBe('https://example.com/x64')
  })

  it('returns the only AppImage when arch-specific naming is absent', () => {
    const asset = pickAppImageAsset([{ name: 'openpos-0.3.2.AppImage', url: 'https://example.com/openpos' }], 'x64')

    expect(asset?.name).toBe('openpos-0.3.2.AppImage')
  })
})

describe('pickDebAsset', () => {
  it('selects the matching Debian asset for x64', () => {
    const asset = pickDebAsset(
      [
        { name: 'openpos-0.3.2-arm64.deb', url: 'https://example.com/arm64' },
        { name: 'openpos-0.3.2-amd64.deb', url: 'https://example.com/amd64' },
      ],
      'x64',
    )

    expect(asset?.url).toBe('https://example.com/amd64')
  })

  it('selects debian-style underscore artifact names', () => {
    const asset = pickDebAsset(
      [
        { name: 'openpos_arm64.deb', url: 'https://example.com/arm64' },
        { name: 'openpos_amd64.deb', url: 'https://example.com/amd64' },
      ],
      'x64',
    )

    expect(asset?.name).toBe('openpos_amd64.deb')
  })
})

describe('pickMacZipAsset', () => {
  it('selects the matching mac zip asset for arm64 and ignores other formats', () => {
    const asset = pickMacZipAsset(
      [
        { name: 'openpos-arm64.dmg', url: 'https://example.com/dmg' },
        { name: 'openpos-x86_64.AppImage', url: 'https://example.com/appimage' },
        { name: 'openpos-arm64.zip', url: 'https://example.com/zip' },
      ],
      'arm64',
    )

    expect(asset?.url).toBe('https://example.com/zip')
  })
})

describe('updateActions.checkForUpdate', () => {
  beforeEach(() => {
    desktopInfo = {
      version: '0.3.1',
      platform: 'linux',
      arch: 'x64',
      updateFormat: 'appimage',
    }
    getInfo.mockClear()
    openReleasePage.mockClear()
    downloadAppImageUpdate.mockClear()
    downloadDebUpdate.mockClear()
    downloadMacZipUpdate.mockClear()
    installDownloadedAppImage.mockClear()
    installDownloadedDeb.mockClear()
    installDownloadedMacZip.mockClear()
    restartFromInstalledAppImage.mockClear()
    restartFromInstalledDeb.mockClear()
    restartFromUpdatedMacApp.mockClear()
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
    updateAssetSha256.value = null
    updateAssetUrl.value = null
    updateAvailable.value = false
    updateDownloadProgress.value = 0
    updateReadyToInstall.value = false
    updateReleaseNotes.value = null
    updateReleaseUrl.value = null
    updateVersion.value = null
  })

  it('stores release metadata and AppImage asset when a newer version exists', async () => {
    globalThis.fetch = vi.fn(async () =>
      manifestResponse({
        format: 'openpos-release-manifest',
        version: '0.3.2',
        notes: 'Release notes for 0.3.2',
        assets: [
          {
            name: 'openpos-0.3.2-x86_64.AppImage',
            url: 'https://releases.openpos.xyz/releases/v0.3.2/openpos-x86_64.AppImage',
            sha256: 'abc123',
          },
        ],
      }),
    ) as unknown as typeof fetch

    const result = await updateActions.checkForUpdate()

    expect(result).toBe(true)
    expect(getInfo).toHaveBeenCalledTimes(1)
    expect(updateAvailable.value).toBe(true)
    expect(updateVersion.value).toBe('0.3.2')
    expect(updateReleaseNotes.value).toBe('Release notes for 0.3.2')
    expect(updateAssetFormat.value).toBe('appimage')
    expect(updateAssetName.value).toBe('openpos-0.3.2-x86_64.AppImage')
    expect(updateAssetUrl.value).toBe('https://releases.openpos.xyz/releases/v0.3.2/openpos-x86_64.AppImage')
    expect(updateAssetSha256.value).toBe('abc123')
    expect(lastCheckTime.value).toBeGreaterThan(0)
    expect(downloadError.value).toBeNull()
    expect(isChecking.value).toBe(false)
  })

  it('keeps the release visible but disables auto-install when no AppImage asset exists', async () => {
    globalThis.fetch = vi.fn(async () =>
      manifestResponse({
        format: 'openpos-release-manifest',
        version: '0.3.2',
        notes: 'Release notes for 0.3.2',
        assets: [],
      }),
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
      updateFormat: 'deb',
    }
    globalThis.fetch = vi.fn(async () =>
      manifestResponse({
        format: 'openpos-release-manifest',
        version: '0.3.2',
        notes: 'Release notes for 0.3.2',
        assets: [
          {
            name: 'openpos-0.3.2-x86_64.AppImage',
            url: 'https://releases.openpos.xyz/releases/v0.3.2/openpos-x86_64.AppImage',
            sha256: 'abc123',
          },
          {
            name: 'openpos-0.3.2-amd64.deb',
            url: 'https://releases.openpos.xyz/releases/v0.3.2/openpos_amd64.deb',
            sha256: 'def456',
          },
        ],
      }),
    ) as unknown as typeof fetch

    const result = await updateActions.checkForUpdate()

    expect(result).toBe(true)
    expect(updateAssetFormat.value).toBe('deb')
    expect(updateAssetName.value).toBe('openpos-0.3.2-amd64.deb')
    expect(updateAssetUrl.value).toBe('https://releases.openpos.xyz/releases/v0.3.2/openpos_amd64.deb')
    expect(updateAssetSha256.value).toBe('def456')
  })

  it('stores release metadata and mac zip asset on macOS', async () => {
    desktopInfo = {
      version: '0.3.1',
      platform: 'darwin',
      arch: 'arm64',
      updateFormat: 'mac-zip',
    }
    globalThis.fetch = vi.fn(async () =>
      manifestResponse({
        format: 'openpos-release-manifest',
        version: '0.3.2',
        notes: 'Release notes for 0.3.2',
        assets: [
          {
            name: 'openpos-arm64.dmg',
            url: 'https://releases.openpos.xyz/releases/v0.3.2/openpos-arm64.dmg',
            sha256: 'aaa111',
          },
          {
            name: 'openpos-arm64.zip',
            url: 'https://releases.openpos.xyz/releases/v0.3.2/openpos-arm64.zip',
            sha256: 'bbb222',
          },
        ],
      }),
    ) as unknown as typeof fetch

    const result = await updateActions.checkForUpdate()

    expect(result).toBe(true)
    expect(updateAssetFormat.value).toBe('mac-zip')
    expect(updateAssetName.value).toBe('openpos-arm64.zip')
    expect(updateAssetUrl.value).toBe('https://releases.openpos.xyz/releases/v0.3.2/openpos-arm64.zip')
  })

  it('disables auto-install when the update format is unsupported', async () => {
    desktopInfo = {
      version: '0.3.1',
      platform: 'darwin',
      arch: 'arm64',
      updateFormat: null,
    }
    globalThis.fetch = vi.fn(async () =>
      manifestResponse({
        format: 'openpos-release-manifest',
        version: '0.3.2',
        notes: 'Release notes for 0.3.2',
        assets: [
          {
            name: 'openpos-arm64.zip',
            url: 'https://releases.openpos.xyz/releases/v0.3.2/openpos-arm64.zip',
            sha256: 'bbb222',
          },
        ],
      }),
    ) as unknown as typeof fetch

    const result = await updateActions.checkForUpdate()

    expect(result).toBe(true)
    expect(updateAvailable.value).toBe(true)
    expect(updateAssetFormat.value).toBeNull()
    expect(updateAssetName.value).toBeNull()
    expect(updateAssetUrl.value).toBeNull()
  })

  it('keeps the release visible but disables auto-install when no Debian asset exists', async () => {
    desktopInfo = {
      version: '0.3.1',
      platform: 'linux',
      arch: 'x64',
      updateFormat: 'deb',
    }
    globalThis.fetch = vi.fn(async () =>
      manifestResponse({
        format: 'openpos-release-manifest',
        version: '0.3.2',
        notes: 'Release notes for 0.3.2',
        assets: [
          {
            name: 'openpos-0.3.2-x86_64.AppImage',
            url: 'https://releases.openpos.xyz/releases/v0.3.2/openpos-x86_64.AppImage',
            sha256: 'abc123',
          },
        ],
      }),
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
    updateReleaseUrl.value = 'https://releases.openpos.xyz/releases/latest.json'
    updateReleaseNotes.value = 'Old notes'
    updateAssetFormat.value = 'appimage'
    updateAssetName.value = 'old.AppImage'
    updateAssetUrl.value = 'https://example.com/old.AppImage'

    globalThis.fetch = vi.fn(async () =>
      manifestResponse({
        format: 'openpos-release-manifest',
        version: '0.3.1',
        notes: 'Already installed',
      }),
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

  it('surfaces manifest errors and clears stale release metadata', async () => {
    updateAvailable.value = true
    updateVersion.value = '0.3.9'
    updateReleaseUrl.value = 'https://releases.openpos.xyz/releases/latest.json'
    updateReleaseNotes.value = 'Old notes'
    updateAssetFormat.value = 'appimage'

    globalThis.fetch = vi.fn(async () => new Response('rate limited', { status: 503 })) as unknown as typeof fetch

    const result = await updateActions.checkForUpdate()

    expect(result).toBe(false)
    expect(updateAvailable.value).toBe(false)
    expect(updateVersion.value).toBeNull()
    expect(updateReleaseUrl.value).toBeNull()
    expect(updateReleaseNotes.value).toBeNull()
    expect(downloadError.value).toBe('Update manifest responded with 503')
    expect(isChecking.value).toBe(false)
  })
})

describe('updateActions.downloadAndInstall', () => {
  beforeEach(() => {
    downloadAppImageUpdate.mockClear()
    downloadDebUpdate.mockClear()
    downloadMacZipUpdate.mockClear()
    installDownloadedAppImage.mockClear()
    installDownloadedDeb.mockClear()
    installDownloadedMacZip.mockClear()
    restartFromInstalledAppImage.mockClear()
    restartFromInstalledDeb.mockClear()
    restartFromUpdatedMacApp.mockClear()
    relaunch.mockClear()

    downloadError.value = null
    downloadedUpdateFormat.value = null
    downloadedUpdatePath.value = null
    isDownloading.value = false
    isInstalling.value = false
    updateAssetUrl.value = 'https://example.com/openpos-0.3.2.AppImage'
    updateAssetSha256.value = 'abc123'
    updateVersion.value = '0.3.2'
    updateAssetFormat.value = 'appimage'
    updateReadyToInstall.value = false
  })

  it('downloads the update with sha256 verification when it is not ready yet', async () => {
    const result = await updateActions.downloadAndInstall()

    expect(result).toBe(true)
    expect(downloadAppImageUpdate).toHaveBeenCalledWith('https://example.com/openpos-0.3.2.AppImage', '0.3.2', 'abc123')
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
    expect(downloadDebUpdate).toHaveBeenCalledWith('https://example.com/openpos-0.3.2.deb', '0.3.2', 'abc123')
    expect(downloadedUpdatePath.value).toBe('/tmp/openpos-0.3.2.deb')
    expect(downloadedUpdateFormat.value).toBe('deb')
  })

  it('installs a Debian package update and restarts from the installed binary', async () => {
    downloadedUpdatePath.value = '/tmp/openpos-0.3.2.deb'
    downloadedUpdateFormat.value = 'deb'
    updateReadyToInstall.value = true

    const result = await updateActions.downloadAndInstall()

    expect(result).toBe(true)
    expect(installDownloadedDeb).toHaveBeenCalledWith('/tmp/openpos-0.3.2.deb')
    expect(restartFromInstalledDeb).toHaveBeenCalledTimes(1)
    expect(relaunch).not.toHaveBeenCalled()
  })

  it('downloads a mac zip update when selected', async () => {
    updateAssetFormat.value = 'mac-zip'
    updateAssetUrl.value = 'https://example.com/openpos-arm64.zip'

    const result = await updateActions.downloadAndInstall()

    expect(result).toBe(true)
    expect(downloadMacZipUpdate).toHaveBeenCalledWith('https://example.com/openpos-arm64.zip', '0.3.2', 'abc123')
    expect(downloadedUpdatePath.value).toBe('/tmp/openpos-arm64.zip')
    expect(downloadedUpdateFormat.value).toBe('mac-zip')
  })

  it('installs a mac zip update and restarts the app', async () => {
    downloadedUpdatePath.value = '/tmp/openpos-arm64.zip'
    downloadedUpdateFormat.value = 'mac-zip'
    updateReadyToInstall.value = true

    const result = await updateActions.downloadAndInstall()

    expect(result).toBe(true)
    expect(installDownloadedMacZip).toHaveBeenCalledWith('/tmp/openpos-arm64.zip')
    expect(restartFromUpdatedMacApp).toHaveBeenCalledTimes(1)
  })
})
