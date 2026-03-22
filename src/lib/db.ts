import { signal } from '@preact/signals'
import { connect, type Connection as TursoClient } from '@tursodatabase/serverless'
import { loadDesktopDbConnectionConfig } from './desktop-db-config'
import Database, { type LocalDatabaseClient } from './local-database'
import { isDesktop } from './platform'

export type DbClient = TursoClient | LocalDatabaseClient

export interface DbClientResult {
  client: DbClient
  isRemote: boolean
}

export type ConnectionStatus = 'remote' | 'local' | 'syncing' | 'error'
export type DbStatusMode = 'api' | 'sqlite' | 'turso'

export const connectionStatus = signal<ConnectionStatus>(isDesktop ? 'local' : 'syncing')
export const connectionMode = signal<DbStatusMode>(isDesktop ? 'sqlite' : 'api')
export const remoteConfigured = signal<boolean>(false)
export const lastConnectionAttempt = signal<number>(0)

/**
 * Number of writes queued in pending_sync_queue that have not yet been
 * replayed to Turso. Updated by the sync engine; components can read this
 * to show "N pending" in the DB status badge.
 */
export const pendingCount = signal<number>(0)

interface SetConnectionStateOptions {
  mode?: DbStatusMode
  remoteConfigured?: boolean
  lastCheckedAt?: number | null
  pendingWrites?: number
}

function resolveConnectionMode(status: ConnectionStatus, override?: DbStatusMode): DbStatusMode {
  if (override) return override
  if (!isDesktop) return 'api'
  return status === 'remote' || status === 'syncing' ? 'turso' : 'sqlite'
}

export function setConnectionState(status: ConnectionStatus, options: SetConnectionStateOptions = {}): void {
  connectionStatus.value = status
  connectionMode.value = resolveConnectionMode(status, options.mode)

  if (typeof options.remoteConfigured === 'boolean') {
    remoteConfigured.value = options.remoteConfigured
  }

  if (typeof options.pendingWrites === 'number') {
    pendingCount.value = options.pendingWrites
  }

  if (options.lastCheckedAt !== undefined) {
    lastConnectionAttempt.value = options.lastCheckedAt ?? 0
  }
}

class DbManager {
  private static instance: DbManager
  private tursoClient: TursoClient | null = null
  private localDb: LocalDatabaseClient | null = null
  private isOnline = true
  private connectionResolved = false
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  private healthCheckPromise: Promise<boolean> | null = null
  private consecutiveFailures = 0
  private nextRetryAt = 0
  private readonly BASE_HEALTH_CHECK_INTERVAL = 30_000
  private readonly MAX_RETRY_DELAY = 5 * 60_000

  private constructor() {}

  static getInstance(): DbManager {
    if (!DbManager.instance) {
      DbManager.instance = new DbManager()
    }
    return DbManager.instance
  }

  private async loadRemoteConfig(forceRefresh = false) {
    if (!isDesktop) {
      remoteConfigured.value = false
      return { configured: false } as const
    }

    const config = await loadDesktopDbConnectionConfig(forceRefresh)
    remoteConfigured.value = config.configured
    return config
  }

  private async getLocalDb(): Promise<LocalDatabaseClient> {
    if (!this.localDb) {
      this.localDb = await Database.load('sqlite:postpos.db')
      console.log('[DbManager] Connected to local desktop SQLite')
    }

    return this.localDb
  }

  async refreshPendingCount(): Promise<void> {
    if (!isDesktop) return

    try {
      const localDb = await this.getLocalDb()
      const rows = await localDb.select<Array<{ cnt: number }>>(
        'SELECT COUNT(*) AS cnt FROM pending_sync_queue WHERE synced_at IS NULL',
      )
      pendingCount.value = rows[0]?.cnt ?? 0
    } catch {
      pendingCount.value = 0
    }
  }

  private getRetryDelay(): number {
    const exponent = Math.max(this.consecutiveFailures - 1, 0)
    return Math.min(this.BASE_HEALTH_CHECK_INTERVAL * 2 ** exponent, this.MAX_RETRY_DELAY)
  }

  private async probeRemoteConnection(forceRefresh = false): Promise<boolean> {
    if (!isDesktop) return false

    if (this.healthCheckPromise) {
      return this.healthCheckPromise
    }

    this.healthCheckPromise = (async () => {
      const config = await this.loadRemoteConfig(forceRefresh)
      if (!config.configured || !config.url || !config.authToken) {
        this.isOnline = false
        this.connectionResolved = true
        this.consecutiveFailures = 0
        this.nextRetryAt = 0
        setConnectionState('local', { remoteConfigured: false })
        return false
      }

      const previousStatus = connectionStatus.peek()
      const shouldWaitForRetry =
        this.connectionResolved && !this.isOnline && Date.now() < this.nextRetryAt && !forceRefresh
      if (shouldWaitForRetry) {
        return false
      }

      const shouldShowInitialSync = !this.connectionResolved
      if (shouldShowInitialSync) {
        setConnectionState('syncing', { remoteConfigured: true })
      }

      try {
        if (!this.tursoClient) {
          this.tursoClient = connect({
            url: config.url,
            authToken: config.authToken,
          })
        }

        await this.tursoClient.execute('SELECT 1')
        this.isOnline = true
        this.connectionResolved = true
        this.consecutiveFailures = 0
        this.nextRetryAt = 0
        const shouldSyncOnReconnect =
          previousStatus !== 'remote' &&
          previousStatus !== 'syncing' &&
          this.connectionResolved &&
          !shouldShowInitialSync
        const checkedAt = Date.now()

        setConnectionState(shouldSyncOnReconnect ? 'syncing' : 'remote', {
          remoteConfigured: true,
          lastCheckedAt: checkedAt,
        })

        if (shouldSyncOnReconnect) {
          const { syncOnReconnect } = await import('./sync')
          await syncOnReconnect()
        }

        return true
      } catch (error) {
        console.warn('[DbManager] Turso health check failed, falling back to local SQLite:', error)
        this.isOnline = false
        this.connectionResolved = true
        this.consecutiveFailures += 1
        this.nextRetryAt = Date.now() + this.getRetryDelay()
        setConnectionState('local', {
          remoteConfigured: true,
          lastCheckedAt: Date.now(),
        })
        return false
      } finally {
        this.healthCheckPromise = null
      }
    })()

    return this.healthCheckPromise
  }

  /**
   * Get the appropriate database client (Turso or local SQLite)
   * Automatically falls back to local SQLite when Turso is unavailable.
   * On the web platform, always uses Turso — no local SQLite fallback.
   */
  async getClient(): Promise<DbClientResult> {
    let config:
      | Awaited<ReturnType<DbManager['loadRemoteConfig']>>
      | {
          configured: false
        }

    if (isDesktop) {
      config = await this.loadRemoteConfig()

      if (config.configured && !this.connectionResolved) {
        await this.probeRemoteConnection()
      }

      if (config.configured && this.isOnline) {
        if (!this.tursoClient && config.url && config.authToken) {
          this.tursoClient = connect({
            url: config.url,
            authToken: config.authToken,
          })
        }

        if (this.tursoClient) {
          return { client: this.tursoClient, isRemote: true }
        }
      }
    }

    if (!isDesktop) {
      setConnectionState('error', { mode: 'api' })
      throw new Error('[DbManager] No database connection: Turso is required in web mode')
    }

    try {
      const localDb = await this.getLocalDb()
      if (connectionStatus.peek() !== 'error') {
        setConnectionState('local', { remoteConfigured: remoteConfigured.peek() })
      }
      return { client: localDb, isRemote: false }
    } catch (error) {
      console.error('[DbManager] Failed to load local database:', error)
      setConnectionState('error', { remoteConfigured: remoteConfigured.peek() })
      throw new Error('Failed to connect to any database')
    }
  }

  isUsingRemote(): boolean {
    return this.isOnline && this.tursoClient !== null && connectionStatus.peek() === 'remote'
  }

  async reconnectToTurso(): Promise<boolean> {
    this.connectionResolved = false
    this.isOnline = true
    this.consecutiveFailures = 0
    this.nextRetryAt = 0
    return this.probeRemoteConnection(true)
  }

  startHealthCheck(intervalMs = this.BASE_HEALTH_CHECK_INTERVAL): void {
    if (!isDesktop) return

    void this.refreshPendingCount()
    void this.probeRemoteConnection().catch((error) => {
      console.error('[DbManager] Initial health check failed:', error)
    })

    if (this.healthCheckTimer !== null) return

    this.healthCheckTimer = setInterval(() => {
      void this.probeRemoteConnection().catch((error) => {
        console.error('[DbManager] Health check failed:', error)
      })
    }, intervalMs)
  }

  stopHealthCheck(): void {
    if (this.healthCheckTimer !== null) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  reset(): void {
    this.tursoClient = null
    this.localDb = null
    this.isOnline = true
    this.connectionResolved = false
    this.healthCheckPromise = null
    this.consecutiveFailures = 0
    this.nextRetryAt = 0
    remoteConfigured.value = false
    pendingCount.value = 0
    setConnectionState(isDesktop ? 'local' : 'syncing', {
      mode: isDesktop ? 'sqlite' : 'api',
      lastCheckedAt: null,
    })
  }

  async close(): Promise<void> {
    if (this.tursoClient) {
      this.tursoClient = null
    }
    if (this.localDb) {
      this.localDb = null
    }
    this.connectionResolved = false
  }
}

export const db = DbManager.getInstance()
