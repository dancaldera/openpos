// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'

const { checkForUpdateMock, downloadUpdateMock, installAndRestartMock, openReleasePageMock } = vi.hoisted(() => ({
  checkForUpdateMock: vi.fn(async () => true),
  downloadUpdateMock: vi.fn(async () => true),
  installAndRestartMock: vi.fn(async () => true),
  openReleasePageMock: vi.fn(async () => {}),
}))

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../lib/platform', () => ({
  isDesktop: true,
}))

vi.mock('../../lib/desktop', () => ({
  getDesktopApi: () => ({
    getInfo: async () => ({ version: '1.0.0', platform: 'linux', arch: 'x64' }),
    updates: { openReleasePage: openReleasePageMock },
  }),
}))

vi.mock('../../stores/update/updateActions', () => ({
  updateActions: {
    checkForUpdate: checkForUpdateMock,
    downloadUpdate: downloadUpdateMock,
    installAndRestart: installAndRestartMock,
  },
}))

const { UpdateBadge } = await import('./UpdateBadge')
const {
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
} = await import('../../stores/update/updateStore')
const { openFullSizeDialogCount } = await import('../../stores/ui/dialogStore')
const { sidebarCollapsed } = await import('../../stores/ui/sidebarStore')

function resetSignals() {
  downloadError.value = null
  isChecking.value = false
  isDownloading.value = false
  isInstalling.value = false
  lastCheckTime.value = 0
  updateAssetName.value = null
  updateAssetUrl.value = null
  updateAvailable.value = false
  updateDownloadProgress.value = 0
  updateReadyToInstall.value = false
  updateReleaseNotes.value = null
  updateReleaseUrl.value = null
  updateVersion.value = null
  openFullSizeDialogCount.value = 0
}

afterEach(() => {
  cleanup()
  resetSignals()
  checkForUpdateMock.mockClear()
  downloadUpdateMock.mockClear()
  installAndRestartMock.mockClear()
  openReleasePageMock.mockClear()
})

function openPopover() {
  // While the popover is closed the badge is the only button on screen.
  fireEvent.click(screen.getAllByRole('button')[0])
}

describe('UpdateBadge', () => {
  it('toggles the popover and checks for updates', async () => {
    render(<UpdateBadge />)
    expect(screen.queryByText('update.checkForUpdates')).toBeNull()

    openPopover()
    expect(screen.getByText('update.checkForUpdates')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'update.checkForUpdates' }))
    await vi.waitFor(() => expect(checkForUpdateMock).toHaveBeenCalled())

    // Backdrop click closes the popover
    const backdrop = document.querySelector('.fixed.inset-0.-z-10')
    fireEvent.click(backdrop as Element)
    expect(screen.queryByText('update.checkForUpdates')).toBeNull()
  })

  it('downloads an available update and opens the release page', async () => {
    updateAvailable.value = true
    updateVersion.value = '1.1.0'
    updateAssetUrl.value = 'https://example.com/openpos.AppImage'
    updateAssetName.value = 'openpos.AppImage'
    render(<UpdateBadge />)

    openPopover()
    fireEvent.click(screen.getByRole('button', { name: 'update.downloadUpdate' }))
    await vi.waitFor(() => expect(downloadUpdateMock).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'update.viewRelease ↗' }))
    await vi.waitFor(() => expect(openReleasePageMock).toHaveBeenCalled())
  })

  it('installs when ready and shows release details', async () => {
    updateAvailable.value = true
    updateVersion.value = '1.1.0'
    updateAssetUrl.value = 'https://example.com/openpos.AppImage'
    updateAssetName.value = 'openpos.AppImage'
    updateReadyToInstall.value = true
    updateReleaseNotes.value = 'Fixes'
    downloadError.value = 'boom'
    lastCheckTime.value = Date.now()
    updateDownloadProgress.value = 100
    isDownloading.value = false
    render(<UpdateBadge />)

    openPopover()
    expect(screen.getByText('Fixes')).toBeDefined()
    expect(screen.getByText('boom')).toBeDefined()
    expect(screen.getByText('openpos.AppImage')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'update.installAndRestart' }))
    await vi.waitFor(() => expect(installAndRestartMock).toHaveBeenCalled())
  })

  it('shows spinners while checking, downloading, or installing', () => {
    isChecking.value = true
    const { unmount } = render(<UpdateBadge />)
    expect(document.querySelector('.animate-spin')).toBeDefined()
    unmount()
    cleanup()

    isChecking.value = false
    isDownloading.value = true
    updateDownloadProgress.value = 10
    const second = render(<UpdateBadge />)
    expect(document.querySelector('.animate-spin')).toBeDefined()
    second.unmount()
    cleanup()

    isDownloading.value = false
    isInstalling.value = true
    render(<UpdateBadge />)
    expect(document.querySelector('.animate-spin')).toBeDefined()
  })

  it('renders collapsed and expanded sidebar placements', () => {
    sidebarCollapsed.value = true
    const { unmount } = render(<UpdateBadge placement="sidebar" />)
    expect(screen.getByRole('button', { name: 'update.appUpdate' })).toBeDefined()
    unmount()
    cleanup()

    const expanded = render(<UpdateBadge placement="sidebar" collapsed={false} />)
    expect(screen.getByText('update.updates')).toBeDefined()
    openPopover()
    expect(screen.getByText('update.checkForNewerRelease')).toBeDefined()
    expanded.unmount()
  })

  it('closes the popover on outside clicks', () => {
    render(<UpdateBadge />)
    openPopover()
    expect(screen.getByText('update.checkForUpdates')).toBeDefined()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('update.checkForUpdates')).toBeNull()
  })

  it('shows the latest version without an update available', () => {
    updateAvailable.value = false
    updateVersion.value = '0.9.0'
    render(<UpdateBadge />)
    openPopover()
    expect(screen.getByText('0.9.0')).toBeDefined()
  })

  it('spins inside the popover while busy', () => {
    updateAvailable.value = true
    updateVersion.value = '1.1.0'
    updateAssetUrl.value = 'https://example.com/openpos.AppImage'
    isChecking.value = true
    isDownloading.value = true
    updateDownloadProgress.value = 5
    isInstalling.value = true
    render(<UpdateBadge />)
    openPopover()
    expect(document.querySelectorAll('.animate-spin').length).toBeGreaterThan(0)
  })

  it('pads the sidebar badge on mac', () => {
    const desktop = window as unknown as { __OPENPOS_DESKTOP__?: { platform: string } }
    const previous = desktop.__OPENPOS_DESKTOP__
    desktop.__OPENPOS_DESKTOP__ = { platform: 'darwin' }
    try {
      const { container } = render(<UpdateBadge placement="sidebar" />)
      expect(container.innerHTML).toContain('pl-[13px]')
    } finally {
      if (previous === undefined) {
        delete desktop.__OPENPOS_DESKTOP__
      } else {
        desktop.__OPENPOS_DESKTOP__ = previous
      }
    }
  })

  it('renders nothing while a full-size dialog is open', () => {
    openFullSizeDialogCount.value = 1
    const { container } = render(<UpdateBadge />)
    expect(container.innerHTML).toBe('')
  })
})
