import { describe, expect, it, mock } from 'bun:test'

mock.module('./icons', () => ({
  SpinnerIcon: () => null,
}))

const { getUpdateBadgeViewModel } = await import('./UpdateBadge')

const labels = {
  updates: 'Updates',
  checking: 'Checking...',
  checkForUpdates: 'Check for updates',
  appUpdate: 'App Update',
  checkForNewerRelease: 'Check for a newer release',
  newVersionAvailable: 'New version available',
  automaticInstallUnavailable: 'Automatic install is available only for supported Linux release packages',
  downloadUpdate: 'Download update',
  installAndRestart: 'Install & Restart',
  downloading: 'Downloading...',
  installing: 'Installing update...',
  readyToInstall: 'Ready to install! Click to restart.',
  downloadedAsset: 'Downloaded file',
  status: 'Status',
  installed: 'Installed',
  latest: 'Latest',
  lastChecked: 'Last checked',
  releaseNotes: 'Release notes',
  error: 'Error',
  viewRelease: 'View release',
}

describe('getUpdateBadgeViewModel', () => {
  it('returns the idle badge state when no update is available', () => {
    const viewModel = getUpdateBadgeViewModel({
      available: false,
      checking: false,
      checkedAt: 0,
      downloadProgress: 0,
      downloading: false,
      error: null,
      installedVersion: null,
      installing: false,
      latestVersion: null,
      readyToInstall: false,
      releaseNotes: null,
      releaseUrl: null,
      updateAssetName: null,
      updateAssetUrl: null,
      labels,
    })

    expect(viewModel.primaryLabel).toBe('Updates')
    expect(viewModel.headline).toBe('Check for a newer release')
    expect(viewModel.installedVersionLabel).toBe('…')
    expect(viewModel.lastCheckedLabel).toBeNull()
    expect(viewModel.releaseNotesPreview).toBeNull()
    expect(viewModel.releaseUrl).toBe('https://github.com/dancaldera/openpos/releases/latest')
    expect(viewModel.checkingLabel).toBe('Check for updates')
    expect(viewModel.canAutoInstall).toBe(false)
  })

  it('returns the update-available state with a truncated release note preview', () => {
    const longNotes = 'A'.repeat(220)
    const viewModel = getUpdateBadgeViewModel({
      available: true,
      checking: false,
      checkedAt: Date.UTC(2026, 2, 26, 12, 0, 0),
      downloadProgress: 0,
      downloading: false,
      error: null,
      installedVersion: '0.3.1',
      installing: false,
      latestVersion: '0.3.2',
      readyToInstall: false,
      releaseNotes: longNotes,
      releaseUrl: 'https://github.com/dancaldera/openpos/releases/tag/v0.3.2',
      updateAssetName: 'openpos-0.3.2-x86_64.AppImage',
      updateAssetUrl: 'https://github.com/dancaldera/openpos/releases/download/v0.3.2/openpos.AppImage',
      labels,
    })

    expect(viewModel.primaryLabel).toBe('v0.3.2')
    expect(viewModel.headline).toBe('New version available')
    expect(viewModel.installedVersionLabel).toBe('0.3.1')
    expect(viewModel.latestVersionLabel).toBe('0.3.2')
    expect(viewModel.lastCheckedLabel).toBeTruthy()
    expect(viewModel.releaseNotesPreview).toBe(longNotes.slice(0, 200))
    expect(viewModel.releaseUrl).toBe('https://github.com/dancaldera/openpos/releases/tag/v0.3.2')
    expect(viewModel.canAutoInstall).toBe(true)
    expect(viewModel.actionLabel).toBe('Download update')
  })

  it('returns the downloading state with progress in the badge label', () => {
    const viewModel = getUpdateBadgeViewModel({
      available: true,
      checking: false,
      checkedAt: 0,
      downloadProgress: 64,
      downloading: true,
      error: null,
      installedVersion: '0.3.1',
      installing: false,
      latestVersion: '0.3.2',
      readyToInstall: false,
      releaseNotes: null,
      releaseUrl: null,
      updateAssetName: 'openpos-0.3.2-x86_64.AppImage',
      updateAssetUrl: 'https://example.com/openpos.AppImage',
      labels,
    })

    expect(viewModel.primaryLabel).toBe('64%')
    expect(viewModel.actionLabel).toBe('Downloading... 64%')
    expect(viewModel.statusLabel).toBe('Downloading... 64%')
    expect(viewModel.actionDisabled).toBe(true)
  })

  it('returns the ready-to-install state and preserves visible errors', () => {
    const viewModel = getUpdateBadgeViewModel({
      available: true,
      checking: false,
      checkedAt: 0,
      downloadProgress: 100,
      downloading: false,
      error: 'pkexec denied the action',
      installedVersion: '0.3.1',
      installing: false,
      latestVersion: '0.3.2',
      readyToInstall: true,
      releaseNotes: null,
      releaseUrl: null,
      updateAssetName: 'openpos-0.3.2-x86_64.AppImage',
      updateAssetUrl: 'https://example.com/openpos.AppImage',
      labels,
    })

    expect(viewModel.actionLabel).toBe('Install & Restart')
    expect(viewModel.statusLabel).toBe('Ready to install! Click to restart.')
    expect(viewModel.downloadedAssetLabel).toBe('openpos-0.3.2-x86_64.AppImage')
    expect(viewModel.error).toBe('pkexec denied the action')
  })

  it('falls back to release-view mode when no auto-install asset is available', () => {
    const viewModel = getUpdateBadgeViewModel({
      available: true,
      checking: false,
      checkedAt: 0,
      downloadProgress: 0,
      downloading: false,
      error: null,
      installedVersion: '0.3.1',
      installing: false,
      latestVersion: '0.3.2',
      readyToInstall: false,
      releaseNotes: null,
      releaseUrl: null,
      updateAssetName: null,
      updateAssetUrl: null,
      labels,
    })

    expect(viewModel.headline).toBe('Automatic install is available only for supported Linux release packages')
    expect(viewModel.canAutoInstall).toBe(false)
    expect(viewModel.showViewRelease).toBe(true)
  })
})
