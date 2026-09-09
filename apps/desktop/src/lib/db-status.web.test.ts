import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiConfigured, apiReachable, connectionMode, connectionStatus, lastApiError } from './db'
import { startDbStatusMonitor, stopDbStatusMonitor } from './db-status'

vi.mock('./api-config', () => ({
  getApiUrl: async () => 'https://api.test/api/db-status',
}))

const realFetch = globalThis.fetch

function webSnapshot() {
  return {
    status: 'online',
    mode: 'api',
    remoteConfigured: true,
    lastCheckedAt: '2026-03-21T10:00:00.000Z',
  }
}

describe('web db status monitor', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
  const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

  beforeEach(() => {
    warnSpy.mockClear()
    setIntervalSpy.mockClear()
    clearIntervalSpy.mockClear()
    connectionStatus.value = 'syncing'
  })

  afterEach(() => {
    stopDbStatusMonitor()
    globalThis.fetch = realFetch
  })

  it('applies the web snapshot on start', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(webSnapshot()), { status: 200 }))

    startDbStatusMonitor(1000)

    await vi.waitFor(() => expect(connectionStatus.value).toBe('online'))
    expect(connectionMode.value).toBe('api')
    expect(apiReachable.value).toBe(true)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('reuses a single timer across repeated starts', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(webSnapshot()), { status: 200 }))

    startDbStatusMonitor(1000)
    startDbStatusMonitor(1000)

    await vi.waitFor(() => expect(connectionStatus.value).toBe('online'))
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('marks the api unreachable when the status request fails', async () => {
    globalThis.fetch = vi.fn(async () => new Response('oops', { status: 500 }))

    startDbStatusMonitor(1000)

    await vi.waitFor(() => expect(connectionStatus.value).toBe('error'))
    expect(connectionMode.value).toBe('api')
    expect(apiConfigured.value).toBe(true)
    expect(apiReachable.value).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('records Error failures from the web status fetch', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down')
    })

    startDbStatusMonitor(1000)

    await vi.waitFor(() => expect(connectionStatus.value).toBe('error'))
    expect(lastApiError.value).toBe('network down')
  })

  it('records non-Error failures from the web status fetch', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw 'kaput'
    })

    startDbStatusMonitor(1000)

    await vi.waitFor(() => expect(connectionStatus.value).toBe('error'))
    expect(lastApiError.value).toBe('kaput')
  })

  it('clears the timer on stop and tolerates repeated stops', () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(webSnapshot()), { status: 200 }))

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
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(webSnapshot()), { status: 200 }))

      startDbStatusMonitor()
      await vi.advanceTimersByTimeAsync(30_000)
      await vi.advanceTimersByTimeAsync(30_000)

      expect(globalThis.fetch).toHaveBeenCalledTimes(3)
    } finally {
      stopDbStatusMonitor()
      vi.useRealTimers()
    }
  })
})
