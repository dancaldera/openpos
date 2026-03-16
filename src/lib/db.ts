import Database from '@tauri-apps/plugin-sql'
import { connect, type Connection as TursoClient } from '@tursodatabase/serverless'

export type DbClient = TursoClient | Database

export interface DbClientResult {
  client: DbClient
  isRemote: boolean
}

class DbManager {
  private static instance: DbManager
  private tursoClient: TursoClient | null = null
  private localDb: Database | null = null
  private isOnline: boolean = true
  private connectionTested: boolean = false
  private lastOnlineCheck: number = 0
  private readonly ONLINE_CHECK_INTERVAL = 30000 // 30 seconds

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
            console.log('[DbManager] Connected to Turso (remote)')
          }

          return { client: this.tursoClient, isRemote: true }
        } catch (error) {
          console.warn('[DbManager] Turso connection failed, falling back to local SQLite:', error)
          this.isOnline = false
          this.lastOnlineCheck = Date.now()
        }
      }
    }

    // Fallback to local SQLite
    if (!this.localDb) {
      try {
        this.localDb = await Database.load('sqlite:postpos.db')
        console.log('[DbManager] Connected to local SQLite (offline mode)')
      } catch (error) {
        console.error('[DbManager] Failed to load local database:', error)
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
    this.isOnline = true
    this.connectionTested = false
    this.lastOnlineCheck = 0

    try {
      const { isRemote } = await this.getClient()
      return isRemote
    } catch {
      return false
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
