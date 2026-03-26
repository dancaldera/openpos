import { beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  downloadError,
  isChecking,
  lastCheckTime,
  updateAvailable,
  updateReleaseNotes,
  updateReleaseUrl,
  updateVersion,
} from './updateStore'

const getInfo = mock(async () => ({ version: '0.3.1' }))
const openReleasePage = mock(async () => {})

mock.module('../../lib/desktop', () => ({
  getDesktopApi: () => ({
    getInfo,
    updates: {
      openReleasePage,
    },
  }),
}))

const { isNewerVersion, updateActions } = await import('./updateActions')

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

describe('updateActions.checkForUpdate', () => {
  beforeEach(() => {
    getInfo.mockClear()
    openReleasePage.mockClear()
    downloadError.value = null
    isChecking.value = false
    lastCheckTime.value = 0
    updateAvailable.value = false
    updateReleaseNotes.value = null
    updateReleaseUrl.value = null
    updateVersion.value = null
  })

  it('stores release metadata when a newer version exists', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            tag_name: 'v0.3.2',
            html_url: 'https://github.com/dancaldera/OpenPOS/releases/tag/v0.3.2',
            body: 'Release notes for 0.3.2',
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
    expect(lastCheckTime.value).toBeGreaterThan(0)
    expect(downloadError.value).toBeNull()
    expect(isChecking.value).toBe(false)
  })

  it('clears stale release metadata when the installed version is current', async () => {
    updateAvailable.value = true
    updateVersion.value = '0.3.9'
    updateReleaseUrl.value = 'https://github.com/dancaldera/OpenPOS/releases/tag/v0.3.9'
    updateReleaseNotes.value = 'Old notes'

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
    expect(downloadError.value).toBeNull()
  })

  it('surfaces API errors and clears stale release metadata', async () => {
    updateAvailable.value = true
    updateVersion.value = '0.3.9'
    updateReleaseUrl.value = 'https://github.com/dancaldera/OpenPOS/releases/tag/v0.3.9'
    updateReleaseNotes.value = 'Old notes'

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
