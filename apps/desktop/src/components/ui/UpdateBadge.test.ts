import { describe, expect, it } from 'bun:test'
import { getUpdateBadgeViewModel } from './UpdateBadge'

describe('getUpdateBadgeViewModel', () => {
  it('returns the idle badge state when no update is available', () => {
    const viewModel = getUpdateBadgeViewModel({
      available: false,
      checking: false,
      checkedAt: 0,
      error: null,
      installedVersion: null,
      latestVersion: null,
      releaseNotes: null,
      releaseUrl: null,
    })

    expect(viewModel.primaryLabel).toBe('Updates')
    expect(viewModel.headline).toBe('Check for a newer release')
    expect(viewModel.installedVersionLabel).toBe('…')
    expect(viewModel.lastCheckedLabel).toBeNull()
    expect(viewModel.releaseNotesPreview).toBeNull()
    expect(viewModel.releaseUrl).toBe('https://github.com/dancaldera/OpenPOS/releases/latest')
    expect(viewModel.checkingLabel).toBe('Check for updates')
  })

  it('returns the update-available state with a truncated release note preview', () => {
    const longNotes = 'A'.repeat(220)
    const viewModel = getUpdateBadgeViewModel({
      available: true,
      checking: false,
      checkedAt: Date.UTC(2026, 2, 26, 12, 0, 0),
      error: null,
      installedVersion: '0.3.1',
      latestVersion: '0.3.2',
      releaseNotes: longNotes,
      releaseUrl: 'https://github.com/dancaldera/OpenPOS/releases/tag/v0.3.2',
    })

    expect(viewModel.primaryLabel).toBe('v0.3.2')
    expect(viewModel.headline).toBe('New version available')
    expect(viewModel.installedVersionLabel).toBe('0.3.1')
    expect(viewModel.latestVersionLabel).toBe('0.3.2')
    expect(viewModel.lastCheckedLabel).toBeTruthy()
    expect(viewModel.releaseNotesPreview).toBe(longNotes.slice(0, 200))
    expect(viewModel.releaseUrl).toBe('https://github.com/dancaldera/OpenPOS/releases/tag/v0.3.2')
  })

  it('returns the checking state and preserves visible errors', () => {
    const viewModel = getUpdateBadgeViewModel({
      available: false,
      checking: true,
      checkedAt: 0,
      error: 'GitHub API responded with 503',
      installedVersion: '0.3.2',
      latestVersion: null,
      releaseNotes: null,
      releaseUrl: null,
    })

    expect(viewModel.checkingLabel).toBe('Checking…')
    expect(viewModel.error).toBe('GitHub API responded with 503')
    expect(viewModel.primaryLabel).toBe('Updates')
  })
})
