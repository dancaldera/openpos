import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectionMode, connectionStatus, lastSyncError } from './db'
import { startDbStatusMonitor, stopDbStatusMonitor } from './db-status'

const { getStatus } = vi.hoisted(() => ({
  getStatus: vi.fn(async () => ({
    status: 'online',
    isSyncing: false,
    mode: 'mirror',
    remoteConfigured: true,
    pendingWrites: 0,
    erroredWrites: 0,
    conflictedWrites: 0,
  })),
}))

vi.mock('./platform', () => ({
  isDesktop: true,
  isElectron: true,
  isWeb: false,
}))

vi.mock('./desktop', () => ({
  requireDesktopApi: () => ({ connectivity: { getStatus } }),
}))

describe('desktop db status monitor', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
  const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

  beforeEach(() => {
    warnSpy.mockClear()
    setIntervalSpy.mockClear()
    clearIntervalSpy.mockClear()
    getStatus.mockClear()
    connectionStatus.value = 'offline'
    lastSyncError.value = null
  })

  afterEach(() => {
    stopDbStatusMonitor()
  })

  it('applies the desktop snapshot on start', async () => {
    startDbStatusMonitor(1000)

    await vi.waitFor(() => expect(getStatus).toHaveBeenCalled())
    await vi.waitFor(() => expect(connectionStatus.value).toBe('online'))
    expect(connectionMode.value).toBe('mirror')
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('reuses a single timer across repeated starts', async () => {
    startDbStatusMonitor(1000)
    startDbStatusMonitor(1000)

    await vi.waitFor(() => expect(getStatus).toHaveBeenCalled())
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('records Error failures from the desktop status fetch', async () => {
    getStatus.mockRejectedValueOnce(new Error('ipc broken'))

    startDbStatusMonitor(1000)

    await vi.waitFor(() => expect(connectionStatus.value).toBe('error'))
    expect(connectionMode.value).toBe('mirror')
    expect(lastSyncError.value).toBe('ipc broken')
    expect(warnSpy).toHaveBeenCalled()
  })

  it('records non-Error failures from the desktop status fetch', async () => {
    getStatus.mockRejectedValueOnce('kaput')

    startDbStatusMonitor(1000)

    await vi.waitFor(() => expect(connectionStatus.value).toBe('error'))
    expect(lastSyncError.value).toBe('kaput')
  })

  it('clears the timer on stop and tolerates repeated stops', () => {
    stopDbStatusMonitor()
    expect(clearIntervalSpy).not.toHaveBeenCalled()

    startDbStatusMonitor(1000)
    stopDbStatusMonitor()
    stopDbStatusMonitor()

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('polls on the default interval', async () => {
    vi.useFakeTimers()
    try {
      startDbStatusMonitor()
      await vi.advanceTimersByTimeAsync(30_000)
      await vi.advanceTimersByTimeAsync(30_000)

      expect(getStatus).toHaveBeenCalledTimes(3)
    } finally {
      stopDbStatusMonitor()
      vi.useRealTimers()
    }
  })
})
