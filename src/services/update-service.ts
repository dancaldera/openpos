import { isTauri } from '../lib/platform'
import { updateActions } from '../stores/update/updateActions'

/**
 * Configuration options for the update service.
 */
export interface UpdateServiceConfig {
  /** Interval between update checks in milliseconds (default: 24 hours) */
  checkIntervalMs: number
  /** Delay before first check on startup in milliseconds (default: 30 seconds) */
  startupDelayMs: number
  /** Whether to check on startup (default: true) */
  checkOnStartup: boolean
}

const DEFAULT_CONFIG: UpdateServiceConfig = {
  checkIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
  startupDelayMs: 30 * 1000, // 30 seconds
  checkOnStartup: true,
}

/**
 * Singleton service that manages background update checking.
 * Starts periodic checks and handles the update lifecycle.
 */
class UpdateService {
  private static instance: UpdateService
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private startupTimer: ReturnType<typeof setTimeout> | null = null
  private config: UpdateServiceConfig = DEFAULT_CONFIG
  private isRunning = false

  private constructor() {}

  static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService()
    }
    return UpdateService.instance
  }

  /**
   * Start the background update checker.
   * Performs an initial check after startup delay, then periodically.
   */
  start(customConfig?: Partial<UpdateServiceConfig>): void {
    // Skip in web mode
    if (!isTauri) {
      console.log('[UpdateService] Skipping in web mode')
      return
    }

    // Already running
    if (this.isRunning) {
      console.log('[UpdateService] Already running')
      return
    }

    this.config = { ...DEFAULT_CONFIG, ...customConfig }
    this.isRunning = true

    console.log('[UpdateService] Starting with config:', {
      checkInterval: `${this.config.checkIntervalMs / 1000 / 60 / 60}h`,
      startupDelay: `${this.config.startupDelayMs / 1000}s`,
    })

    // Initial check after startup delay
    if (this.config.checkOnStartup) {
      this.startupTimer = setTimeout(() => {
        updateActions.checkForUpdate().catch((err) => {
          console.error('[UpdateService] Initial check failed:', err)
        })
      }, this.config.startupDelayMs)
    }

    // Periodic checks
    this.checkTimer = setInterval(() => {
      updateActions.checkForUpdate().catch((err) => {
        console.error('[UpdateService] Periodic check failed:', err)
      })
    }, this.config.checkIntervalMs)
  }

  /**
   * Stop the background update checker.
   */
  stop(): void {
    if (this.startupTimer !== null) {
      clearTimeout(this.startupTimer)
      this.startupTimer = null
    }

    if (this.checkTimer !== null) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }

    this.isRunning = false
    console.log('[UpdateService] Stopped')
  }

  /**
   * Force an immediate update check, bypassing the interval.
   */
  async forceCheck(): Promise<boolean> {
    // Skip in web mode
    if (!isTauri) {
      console.log('[UpdateService] Skipping force check in web mode')
      return false
    }

    return updateActions.checkForUpdate()
  }

  /**
   * Update the configuration at runtime.
   * Restarts the timers if already running.
   */
  configure(newConfig: Partial<UpdateServiceConfig>): void {
    const wasRunning = this.isRunning

    if (wasRunning) {
      this.stop()
    }

    this.config = { ...this.config, ...newConfig }

    if (wasRunning) {
      this.start()
    }
  }

  /**
   * Check if the service is currently running.
   */
  isActive(): boolean {
    return this.isRunning
  }
}

export const updateService = UpdateService.getInstance()
