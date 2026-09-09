import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { checkForUpdate } = vi.hoisted(() => ({
  checkForUpdate: vi.fn(async () => true),
}))

vi.mock('../stores/update/updateActions', () => ({
  updateActions: { checkForUpdate },
}))

const { updateService } = await import('./update-service')

describe('UpdateService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    checkForUpdate.mockReset()
    checkForUpdate.mockResolvedValue(true)
    updateService.stop()
  })

  afterEach(() => {
    updateService.stop()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts timers and runs the initial check after the startup delay', async () => {
    updateService.start({ checkIntervalMs: 60_000, startupDelayMs: 1_000, checkOnStartup: true })

    expect(updateService.isActive()).toBe(true)
    expect(checkForUpdate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)

    expect(checkForUpdate).toHaveBeenCalledTimes(1)
  })

  it('logs when start is called while already running', () => {
    updateService.start({ checkOnStartup: false })
    updateService.start()

    expect(updateService.isActive()).toBe(true)
    expect(checkForUpdate).not.toHaveBeenCalled()
  })

  it('skips the startup timer when checkOnStartup is false but still polls', async () => {
    updateService.start({ checkIntervalMs: 5_000, startupDelayMs: 1_000, checkOnStartup: false })

    await vi.advanceTimersByTimeAsync(1_000)

    expect(checkForUpdate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(4_000)

    expect(checkForUpdate).toHaveBeenCalledTimes(1)
  })

  it('reports initial check failures without stopping the service', async () => {
    checkForUpdate.mockRejectedValueOnce(new Error('offline'))

    updateService.start({ checkIntervalMs: 60_000, startupDelayMs: 500, checkOnStartup: true })

    await vi.advanceTimersByTimeAsync(500)

    expect(checkForUpdate).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith('[UpdateService] Initial check failed:', expect.any(Error))
    expect(updateService.isActive()).toBe(true)
  })

  it('reports periodic check failures without stopping the service', async () => {
    checkForUpdate.mockRejectedValueOnce(new Error('offline'))

    updateService.start({ checkIntervalMs: 2_000, startupDelayMs: 60_000, checkOnStartup: true })

    await vi.advanceTimersByTimeAsync(2_000)

    expect(checkForUpdate).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith('[UpdateService] Periodic check failed:', expect.any(Error))
    expect(updateService.isActive()).toBe(true)
  })

  it('stops timers and can start again afterwards', async () => {
    updateService.start({ checkIntervalMs: 1_000, startupDelayMs: 1_000, checkOnStartup: true })
    updateService.stop()

    expect(updateService.isActive()).toBe(false)

    await vi.advanceTimersByTimeAsync(10_000)

    expect(checkForUpdate).not.toHaveBeenCalled()

    updateService.start({ checkIntervalMs: 1_000, startupDelayMs: 2_000, checkOnStartup: true })

    expect(updateService.isActive()).toBe(true)

    await vi.advanceTimersByTimeAsync(1_000)

    expect(checkForUpdate).toHaveBeenCalledTimes(1)
  })

  it('stopping an idle service is a no-op', () => {
    expect(updateService.isActive()).toBe(false)
    updateService.stop()
    expect(updateService.isActive()).toBe(false)
  })

  it('forceCheck delegates to updateActions', async () => {
    checkForUpdate.mockResolvedValueOnce(false)

    await expect(updateService.forceCheck()).resolves.toBe(false)
    expect(checkForUpdate).toHaveBeenCalledTimes(1)
  })

  it('configure restarts the timers when running', async () => {
    updateService.start({ checkIntervalMs: 60_000, startupDelayMs: 60_000, checkOnStartup: true })
    updateService.configure({ checkIntervalMs: 1_000 })

    expect(updateService.isActive()).toBe(true)

    await vi.advanceTimersByTimeAsync(30_000)

    expect(checkForUpdate).toHaveBeenCalledTimes(1)
  })

  it('configure only merges config when stopped', async () => {
    updateService.configure({ checkIntervalMs: 1_000 })

    expect(updateService.isActive()).toBe(false)

    await vi.advanceTimersByTimeAsync(5_000)

    expect(checkForUpdate).not.toHaveBeenCalled()

    updateService.start()

    await vi.advanceTimersByTimeAsync(30_000)

    expect(checkForUpdate).toHaveBeenCalledTimes(1)
  })
})
