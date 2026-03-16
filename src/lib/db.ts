import { signal } from '@preact/signals'
import Database from '@tauri-apps/plugin-sql'
import { connect, type Connection as TursoClient } from '@tursodatabase/serverless'

export type DbClient = TursoClient | Database

export interface DbClientResult {
  client: DbClient
  isRemote: boolean
}

export type ConnectionStatus = 'remote' | 'local' | 'syncing' | 'error'

/**
 * Reactive signal that always reflects the current DB connection state.
 * Components can subscribe to this signal to re-render when the status changes.
 */
export const connectionStatus = signal<ConnectionStatus>('local')
export const lastConnectionAttempt = signal<number>(0)

/**
 * Number of writes queued in pending_sync_queue that have not yet been
 * replayed to Turso. Updated by the sync engine; components can read this
 * to show "N pending" in the DB status badge.
 */
export const pendingCount = signal<number>(0)

class DbManager {
  private static instance: DbManager
  private tursoClient: TursoClient | null = null
  private localDb: Database | null = null
  private isOnline: boolean = true
  private connectionTested: boolean = false
  private lastOnlineCheck: number = 0
  private readonly ONLINE_CHECK_INTERVAL = 30000 // 30 seconds
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null

  private constructor() {}

  static getInstance(): DbManager {
    if (!DbManager.instance) {
      DbManager.instance = new DbManager()
    }
    return DbManager.instance
  }

  /**
   * Get the appropriate database client (Turso or local SQLite)
   * Automatically falls back to local SQLite when Turso is unavailable
   */
  async getClient(): Promise<DbClientResult> {
    const tursoUrl = import.meta.env.VITE_TURSO_DATABASE_URL
    const tursoToken = import.meta.env.VITE_TURSO_AUTH_TOKEN

    // If Turso is configured, try to use it
    if (tursoUrl && tursoToken) {
      // Check if we should retry online connection
      const now = Date.now()
      if (!this.isOnline && now - this.lastOnlineCheck > this.ONLINE_CHECK_INTERVAL) {
        this.isOnline = true
        this.connectionTested = false
      }

      if (this.isOnline) {
        try {
          if (!this.tursoClient) {
            this.tursoClient = connect({
              url: tursoUrl,
              authToken: tursoToken,
            })
          }

          // Test connection if not tested yet
          if (!this.connectionTested) {
            await this.tursoClient.execute('SELECT 1')
            this.connectionTested = true
            lastConnectionAttempt.value = Date.now()
            connectionStatus.value = 'remote'
            console.log('[DbManager] Connected to Turso (remote)')
          }

          return { client: this.tursoClient, isRemote: true }
        } catch (error) {
          console.warn('[DbManager] Turso connection failed, falling back to local SQLite:', error)
          this.isOnline = false
          this.lastOnlineCheck = Date.now()
          lastConnectionAttempt.value = Date.now()
          connectionStatus.value = 'local'
        }
      }
    }

    // Fallback to local SQLite
    if (!this.localDb) {
      try {
        this.localDb = await Database.load('sqlite:postpos.db')
        lastConnectionAttempt.value = Date.now()
        connectionStatus.value = 'local'
        console.log('[DbManager] Connected to local SQLite (offline mode)')
      } catch (error) {
        console.error('[DbManager] Failed to load local database:', error)
        connectionStatus.value = 'error'
        throw new Error('Failed to connect to any database')
      }
    }

    return { client: this.localDb, isRemote: false }
  }

  /**
   * Check if currently using remote Turso connection
   */
  isUsingRemote(): boolean {
    return this.isOnline && this.tursoClient !== null
  }

  /**
   * Force reconnection attempt to Turso
   */
  async reconnectToTurso(): Promise<boolean> {
    connectionStatus.value = 'syncing'
    this.isOnline = true
    this.connectionTested = false
    this.lastOnlineCheck = 0

    try {
      const { isRemote } = await this.getClient()
      // connectionStatus is updated inside getClient()
      return isRemote
    } catch {
      connectionStatus.value = 'error'
      return false
    }
  }

  /**
   * Start a background health-check that pings Turso on a fixed interval.
   * Updates connectionStatus signal automatically.
   * No-op if Turso is not configured or a check is already running.
   */
  startHealthCheck(intervalMs = 15_000): void {
    const tursoUrl = import.meta.env.VITE_TURSO_DATABASE_URL
    const tursoToken = import.meta.env.VITE_TURSO_AUTH_TOKEN

    // Nothing to check if Turso is not configured
    if (!tursoUrl || !tursoToken) return
    // Already running
    if (this.healthCheckTimer !== null) return

    this.healthCheckTimer = setInterval(async () => {
      const wasOffline = connectionStatus.value === 'local' || connectionStatus.value === 'error'
      connectionStatus.value = 'syncing'
      try {
        // Always create a fresh client if needed and force a real probe
        if (!this.tursoClient) {
          this.tursoClient = connect({ url: tursoUrl, authToken: tursoToken })
        }
        await this.tursoClient.execute('SELECT 1')
        this.isOnline = true
        this.connectionTested = true
        lastConnectionAttempt.value = Date.now()

        if (wasOffline) {
          // Reconnection detected — trigger sync engine asynchronously.
          // Import is deferred to avoid a circular dependency at module load time.
          import('./sync').then(({ syncOnReconnect }) => {
            syncOnReconnect().catch((err: unknown) => console.error('[DbManager] syncOnReconnect failed:', err))
          })
        } else {
          connectionStatus.value = 'remote'
        }
      } catch {
        this.isOnline = false
        this.connectionTested = false
        this.lastOnlineCheck = Date.now()
        lastConnectionAttempt.value = Date.now()
        connectionStatus.value = 'local'
      }
    }, intervalMs)
  }

  /**
   * Stop the background health-check interval.
   */
  stopHealthCheck(): void {
    if (this.healthCheckTimer !== null) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  /**
   * Reset the manager (useful for testing or forced reconnection)
   */
  reset(): void {
    this.tursoClient = null
    this.localDb = null
    this.isOnline = true
    this.connectionTested = false
    this.lastOnlineCheck = 0
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.tursoClient) {
      // Turso client doesn't have a close method, it's stateless
      this.tursoClient = null
    }
    if (this.localDb) {
      // Tauri SQL plugin doesn't expose close, handled by the app lifecycle
      this.localDb = null
    }
    this.connectionTested = false
  }
}

export const db = DbManager.getInstance()
