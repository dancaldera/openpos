import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopUpdateStatusEvent } from '../../lib/desktop'
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
  downloadAppImageUpdate,
  downloadDebUpdate,
  downloadMacZipUpdate,
  installDownloadedAppImage,
  installDownloadedDeb,
  installDownloadedMacZip,
  restartFromInstalledAppImage,
  restartFromInstalledDeb,
  restartFromUpdatedMacApp,
  onStatusChange,
} = vi.hoisted(() => ({
  getInfo: vi.fn(async () => desktopInfo),
  downloadAppImageUpdate: vi.fn(async () => ({ filePath: '/tmp/openpos-0.3.2.AppImage' })),
  downloadDebUpdate: vi.fn(async () => ({ filePath: '/tmp/openpos-0.3.2.deb' })),
  downloadMacZipUpdate: vi.fn(async () => ({ filePath: '/tmp/openpos-arm64.zip' })),
  installDownloadedAppImage: vi.fn(async () => {}),
  installDownloadedDeb: vi.fn(async () => {}),
  installDownloadedMacZip: vi.fn(async () => {}),
  restartFromInstalledAppImage: vi.fn(async () => {}),
  restartFromInstalledDeb: vi.fn(async () => {}),
  restartFromUpdatedMacApp: vi.fn(async () => {}),
  onStatusChange: vi.fn((_listener: (event: DesktopUpdateStatusEvent) => void): (() => void) => () => {}),
}))

vi.mock('../../lib/desktop', () => ({
  getDesktopApi: () => ({
    getInfo,
    updates: {
      downloadAppImageUpdate,
      downloadDebUpdate,
      downloadMacZipUpdate,
      installDownloadedAppImage,
      installDownloadedDeb,
      installDownloadedMacZip,
      restartFromInstalledAppImage,
      restartFromInstalledDeb,
      restartFromUpdatedMacApp,
      onStatusChange,
    },
  }),
}))

const { updateActions } = await import('./updateActions')

function manifestResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

function newerManifest() {
  return {
    format: 'openpos-release-manifest',
    version: 'v0.3.2',
    notes: 'notes',
    assets: [{ name: 'openpos-0.3.2-x86_64.AppImage', url: 'https://example.com/x64', sha256: 'abc' }],
  }
}

function resetSignals() {
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
}

describe('update status events', () => {
  let emit: (event: DesktopUpdateStatusEvent) => void = () => {}

  beforeEach(async () => {
    desktopInfo = { version: '0.3.1', platform: 'linux', arch: 'x64', updateFormat: 'appimage' }
    resetSignals()
    globalThis.fetch = vi.fn(async () => manifestResponse(newerManifest())) as unknown as typeof fetch

    await updateActions.checkForUpdate()
    const handler = onStatusChange.mock.calls[0]?.[0] as (event: DesktopUpdateStatusEvent) => void
    if (!handler) throw new Error('update status subscription missing')
    emit = handler
    resetSignals()
    updateAssetFormat.value = 'appimage'
  })

  it('tracks download progress and keeps the last value without updates', () => {
    emit({ phase: 'downloading', progress: 42 })

    expect(isDownloading.value).toBe(true)
    expect(isInstalling.value).toBe(false)
    expect(updateReadyToInstall.value).toBe(false)
    expect(updateDownloadProgress.value).toBe(42)

    emit({ phase: 'downloading' })

    expect(updateDownloadProgress.value).toBe(42)
  })

  it('marks the update ready once downloaded', () => {
    emit({ phase: 'downloaded', filePath: '/tmp/openpos.AppImage' })

    expect(isDownloading.value).toBe(false)
    expect(updateReadyToInstall.value).toBe(true)
    expect(updateDownloadProgress.value).toBe(100)
    expect(downloadedUpdatePath.value).toBe('/tmp/openpos.AppImage')
    expect(downloadedUpdateFormat.value).toBe('appimage')
  })

  it('keeps the previous path when the event carries none', () => {
    downloadedUpdatePath.value = '/tmp/previous.AppImage'

    emit({ phase: 'downloaded' })

    expect(downloadedUpdatePath.value).toBe('/tmp/previous.AppImage')
  })

  it('tracks installation', () => {
    emit({ phase: 'installing' })

    expect(isDownloading.value).toBe(false)
    expect(isInstalling.value).toBe(true)
  })

  it('records update failures with and without a message', () => {
    emit({ phase: 'error', message: 'disk full' })

    expect(downloadError.value).toBe('disk full')
    expect(isDownloading.value).toBe(false)
    expect(isInstalling.value).toBe(false)

    emit({ phase: 'error' })

    expect(downloadError.value).toBe('Update failed')
  })
})

describe('updateActions edge paths', () => {
  beforeEach(() => {
    desktopInfo = { version: '0.3.1', platform: 'linux', arch: 'x64', updateFormat: 'appimage' }
    downloadAppImageUpdate.mockClear()
    installDownloadedAppImage.mockClear()
    resetSignals()
  })

  it('skips the check while one is already running', async () => {
    isChecking.value = true

    await expect(updateActions.checkForUpdate()).resolves.toBe(false)

    isChecking.value = false
  })

  it('surfaces network failures from the manifest fetch', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('offline')
    }) as unknown as typeof fetch

    await expect(updateActions.checkForUpdate()).resolves.toBe(false)

    expect(updateAvailable.value).toBe(false)
    expect(downloadError.value).toBe('offline')
    expect(isChecking.value).toBe(false)
  })

  it('rejects manifests with an unknown format', async () => {
    globalThis.fetch = vi.fn(async () => manifestResponse({ format: 'other', version: '9.9.9' }))

    await expect(updateActions.checkForUpdate()).resolves.toBe(false)

    expect(downloadError.value).toBe('Unsupported update manifest format')
  })

  it('clears metadata when the manifest carries no version', async () => {
    updateAvailable.value = true
    globalThis.fetch = vi.fn(async () => manifestResponse({ format: 'openpos-release-manifest' }))

    await expect(updateActions.checkForUpdate()).resolves.toBe(false)

    expect(updateAvailable.value).toBe(false)
    expect(updateVersion.value).toBeNull()
  })

  it('defaults missing release notes to null', async () => {
    globalThis.fetch = vi.fn(async () =>
      manifestResponse({
        format: 'openpos-release-manifest',
        version: '0.3.2',
        assets: [{ name: 'openpos-0.3.2-x86_64.AppImage', url: 'https://example.com/x64' }],
      }),
    )

    await expect(updateActions.checkForUpdate()).resolves.toBe(true)

    expect(updateAvailable.value).toBe(true)
    expect(updateReleaseNotes.value).toBeNull()
  })

  it('records non-Error manifest failures', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw 'kaput'
    }) as unknown as typeof fetch

    await expect(updateActions.checkForUpdate()).resolves.toBe(false)

    expect(downloadError.value).toBe('kaput')
  })

  it('refuses downloads while busy or misconfigured', async () => {
    isDownloading.value = true
    await expect(updateActions.downloadUpdate()).resolves.toBe(false)
    isDownloading.value = false

    isInstalling.value = true
    await expect(updateActions.downloadUpdate()).resolves.toBe(false)
    isInstalling.value = false

    await expect(updateActions.downloadUpdate()).resolves.toBe(false)
  })

  it('records download failures', async () => {
    updateAssetUrl.value = 'https://example.com/x64'
    updateAssetSha256.value = 'abc'
    updateAssetFormat.value = 'appimage'
    updateVersion.value = '0.3.2'
    downloadAppImageUpdate.mockRejectedValueOnce(new Error('disk full'))

    await expect(updateActions.downloadUpdate()).resolves.toBe(false)

    expect(isDownloading.value).toBe(false)
    expect(updateReadyToInstall.value).toBe(false)
    expect(downloadError.value).toBe('disk full')
  })

  it('records non-Error download failures', async () => {
    updateAssetUrl.value = 'https://example.com/x64'
    updateAssetFormat.value = 'appimage'
    updateVersion.value = '0.3.2'
    downloadAppImageUpdate.mockRejectedValueOnce('kaput')

    await expect(updateActions.downloadUpdate()).resolves.toBe(false)

    expect(downloadError.value).toBe('kaput')
  })

  it('refuses installs while busy or misconfigured', async () => {
    isInstalling.value = true
    await expect(updateActions.installAndRestart()).resolves.toBe(false)
    isInstalling.value = false

    isDownloading.value = true
    await expect(updateActions.installAndRestart()).resolves.toBe(false)
    isDownloading.value = false

    await expect(updateActions.installAndRestart()).resolves.toBe(false)
  })

  it('records install failures', async () => {
    downloadedUpdatePath.value = '/tmp/openpos-0.3.2.AppImage'
    downloadedUpdateFormat.value = 'appimage'
    installDownloadedAppImage.mockRejectedValueOnce(new Error('noexec'))

    await expect(updateActions.installAndRestart()).resolves.toBe(false)

    expect(isInstalling.value).toBe(false)
    expect(downloadError.value).toBe('noexec')
  })

  it('records non-Error install failures', async () => {
    downloadedUpdatePath.value = '/tmp/openpos-0.3.2.AppImage'
    downloadedUpdateFormat.value = 'appimage'
    installDownloadedAppImage.mockRejectedValueOnce('kaput')

    await expect(updateActions.installAndRestart()).resolves.toBe(false)

    expect(downloadError.value).toBe('kaput')
  })

  it('dismisses releases and clears errors', () => {
    updateAvailable.value = true
    downloadError.value = 'stale'

    updateActions.dismissUpdate()
    updateActions.clearError()

    expect(updateAvailable.value).toBe(false)
    expect(downloadError.value).toBeNull()
  })
})
