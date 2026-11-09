// @vitest-environment happy-dom

import { SideNav, SideNavSection } from '@astryxdesign/core/SideNav'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  platform: { isDesktop: true },
  checkForUpdate: vi.fn(async () => true),
  downloadUpdate: vi.fn(async () => true),
  installAndRestart: vi.fn(async () => true),
  openReleasePage: vi.fn(async () => {}),
}))

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => (params ? `${key} ${JSON.stringify(params)}` : key),
  }),
}))
vi.mock('../../lib/platform', () => ({
  get isDesktop() {
    return mocks.platform.isDesktop
  },
}))
vi.mock('../../lib/desktop', () => ({
  getDesktopApi: () => ({
    getInfo: async () => ({ version: '1.0.0', platform: 'linux', arch: 'x64' }),
    updates: { openReleasePage: mocks.openReleasePage },
  }),
}))
vi.mock('../../stores/update/updateActions', () => ({
  updateActions: {
    checkForUpdate: mocks.checkForUpdate,
    downloadUpdate: mocks.downloadUpdate,
    installAndRestart: mocks.installAndRestart,
  },
}))

const { UpdateStatusItem, getUpdateViewModel } = await import('./UpdateStatusItem')
const { AccessUpdateNotice } = await import('../access/AccessScreen')
const store = await import('../../stores/update/updateStore')

const labels = {
  updates: 'Updates',
  checking: 'Checking...',
  checkForUpdates: 'Check for updates',
  checkForNewerRelease: 'Check for a newer release',
  newVersionAvailable: 'New version available',
  automaticInstallUnavailable: 'Automatic install is available only for supported Linux release packages',
  downloadUpdate: 'Download update',
  installAndRestart: 'Install and restart',
  downloading: 'Downloading...',
  installing: 'Installing update...',
  readyToInstall: 'Ready to install',
}

const idle = {
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
}

const available = {
  ...idle,
  available: true,
  installedVersion: '0.3.1',
  latestVersion: '0.3.2',
  updateAssetName: 'openpos-0.3.2-x86_64.AppImage',
  updateAssetUrl: 'https://example.com/openpos.AppImage',
}

function resetSignals() {
  store.downloadError.value = null
  store.isChecking.value = false
  store.isDownloading.value = false
  store.isInstalling.value = false
  store.lastCheckTime.value = 0
  store.updateAssetName.value = null
  store.updateAssetUrl.value = null
  store.updateAvailable.value = false
  store.updateDownloadProgress.value = 0
  store.updateReadyToInstall.value = false
  store.updateReleaseNotes.value = null
  store.updateReleaseUrl.value = null
  store.updateVersion.value = null
}

function renderItem() {
  return render(
    <SideNav aria-label="nav">
      <SideNavSection title="footer" isHeaderHidden>
        <UpdateStatusItem />
      </SideNavSection>
    </SideNav>,
  )
}

function makeAvailable() {
  store.updateAvailable.value = true
  store.updateVersion.value = '1.1.0'
  store.updateAssetUrl.value = 'https://example.com/openpos.AppImage'
  store.updateAssetName.value = 'openpos.AppImage'
}

afterEach(() => {
  cleanup()
  resetSignals()
  mocks.platform.isDesktop = true
  vi.clearAllMocks()
})

describe('getUpdateViewModel', () => {
  it('returns the idle state when no update is available', () => {
    const vm = getUpdateViewModel(idle)
    expect(vm.hasActivity).toBe(false)
    expect(vm.primaryLabel).toBe('Updates')
    expect(vm.headline).toBe('Check for a newer release')
    expect(vm.installedVersionLabel).toBe('-')
    expect(vm.lastCheckedLabel).toBeNull()
    expect(vm.releaseNotesPreview).toBeNull()
    expect(vm.releaseUrl).toBe('https://releases.pos.softmelody.dev')
    expect(vm.checkingLabel).toBe('Check for updates')
    expect(vm.canAutoInstall).toBe(false)
  })

  it('returns the update-available state with a truncated release note preview', () => {
    const longNotes = 'A'.repeat(220)
    const vm = getUpdateViewModel({
      ...available,
      checkedAt: Date.UTC(2026, 2, 26, 12, 0, 0),
      releaseNotes: longNotes,
      releaseUrl: 'https://releases.pos.softmelody.dev/releases/v0.3.2',
    })
    expect(vm.hasActivity).toBe(true)
    expect(vm.primaryLabel).toBe('v0.3.2')
    expect(vm.headline).toBe('New version available')
    expect(vm.installedVersionLabel).toBe('0.3.1')
    expect(vm.latestVersionLabel).toBe('0.3.2')
    expect(vm.lastCheckedLabel).toBeTruthy()
    expect(vm.releaseNotesPreview).toBe(longNotes.slice(0, 200))
    expect(vm.releaseUrl).toBe('https://releases.pos.softmelody.dev/releases/v0.3.2')
    expect(vm.canAutoInstall).toBe(true)
    expect(vm.actionLabel).toBe('Download update')
  })

  it('returns the downloading state with progress', () => {
    const vm = getUpdateViewModel({ ...available, downloading: true, downloadProgress: 64 })
    expect(vm.primaryLabel).toBe('64%')
    expect(vm.actionLabel).toBe('Downloading... 64%')
    expect(vm.statusLabel).toBe('Downloading... 64%')
    expect(vm.actionDisabled).toBe(true)
    expect(vm.isBusy).toBe(true)
  })

  it('returns the downloading state before progress starts', () => {
    const vm = getUpdateViewModel({ ...available, downloading: true })
    expect(vm.primaryLabel).toBe('Downloading...')
    expect(vm.actionLabel).toBe('Downloading...')
    expect(vm.statusLabel).toBe('Downloading...')
  })

  it('returns the ready-to-install state and keeps visible errors', () => {
    const vm = getUpdateViewModel({ ...available, readyToInstall: true, downloadProgress: 100, error: 'pkexec denied' })
    expect(vm.actionLabel).toBe('Install and restart')
    expect(vm.statusLabel).toBe('Ready to install')
    expect(vm.downloadedAssetLabel).toBe('openpos-0.3.2-x86_64.AppImage')
    expect(vm.error).toBe('pkexec denied')
  })

  it('returns the installing state', () => {
    const vm = getUpdateViewModel({ ...available, installing: true })
    expect(vm.actionLabel).toBe('Installing update...')
    expect(vm.actionDisabled).toBe(true)
  })

  it('keeps the default label when the version is unknown', () => {
    const vm = getUpdateViewModel({ ...available, latestVersion: null, checking: true })
    expect(vm.primaryLabel).toBe('Updates')
    expect(vm.checkingLabel).toBe('Checking...')
    expect(vm.actionDisabled).toBe(true)
  })

  it('falls back to release-view mode when no auto-install asset is available', () => {
    const vm = getUpdateViewModel({ ...available, updateAssetUrl: null, updateAssetName: null })
    expect(vm.headline).toBe('Automatic install is available only for supported Linux release packages')
    expect(vm.canAutoInstall).toBe(false)
    expect(vm.showViewRelease).toBe(true)
  })
})

describe('UpdateStatusItem', () => {
  it('renders nothing without an update', () => {
    renderItem()
    expect(screen.queryByText('update.updateAvailable')).toBeNull()
    expect(screen.queryByRole('button', { name: 'update.appUpdate' })).toBeNull()
  })

  it('renders nothing on the web', () => {
    mocks.platform.isDesktop = false
    makeAvailable()
    renderItem()
    expect(screen.queryByText('update.updateAvailable')).toBeNull()
  })

  it('shows an available update and runs its menu actions', async () => {
    makeAvailable()
    store.updateReleaseNotes.value = 'Faster checkout'
    store.lastCheckTime.value = Date.now()
    renderItem()

    expect(screen.getByText('update.updateAvailable')).toBeTruthy()
    expect(screen.getByText('v1.1.0')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'update.appUpdate' }))
    expect(screen.getByText('Faster checkout')).toBeTruthy()
    expect(screen.getByText('update.latestLabel')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
    fireEvent.click(screen.getByRole('menuitem', { name: /update\.downloadUpdate/ }))
    await waitFor(() => expect(mocks.downloadUpdate).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'update.appUpdate' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /update\.viewRelease/ }))
    await waitFor(() => expect(mocks.openReleasePage).toHaveBeenCalledWith('https://releases.pos.softmelody.dev'))

    fireEvent.click(screen.getByRole('button', { name: 'update.appUpdate' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /update\.checkForUpdates/ }))
    await waitFor(() => expect(mocks.checkForUpdate).toHaveBeenCalled())
  })

  it('installs and restarts once the download is ready', async () => {
    makeAvailable()
    store.updateReadyToInstall.value = true
    store.downloadError.value = 'boom'
    renderItem()

    expect(screen.getByText('update.restartToUpdate')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'update.appUpdate' }))
    expect(screen.getByText('boom')).toBeTruthy()
    expect(screen.getByText('openpos.AppImage')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: /update\.installAndRestart/ }))
    await waitFor(() => expect(mocks.installAndRestart).toHaveBeenCalled())
  })

  it('shows download progress as the label', () => {
    makeAvailable()
    store.isDownloading.value = true
    store.updateDownloadProgress.value = 40
    renderItem()
    expect(screen.getAllByText('update.downloading 40%').length).toBeGreaterThan(0)
  })
})

describe('AccessUpdateNotice', () => {
  it('renders nothing without an update', () => {
    render(<AccessUpdateNotice />)
    expect(document.body.textContent).toBe('')
  })

  it('offers the download on startup screens', async () => {
    makeAvailable()
    render(<AccessUpdateNotice />)
    expect(screen.getByText('update.newVersionAvailable {"version":"1.1.0"}')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'update.downloadUpdate' }))
    await waitFor(() => expect(mocks.downloadUpdate).toHaveBeenCalled())
  })

  it('links to the release when it cannot install automatically', async () => {
    makeAvailable()
    store.updateAssetUrl.value = null
    render(<AccessUpdateNotice />)
    fireEvent.click(screen.getByRole('button', { name: 'update.viewRelease' }))
    await waitFor(() => expect(mocks.openReleasePage).toHaveBeenCalled())
  })
})
