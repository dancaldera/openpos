import Database from '@tauri-apps/plugin-sql'

/**
 * Base class for all SQLite services.
 * Provides common database operations, error handling, and pagination logic.
 */
export abstract class BaseDatabaseService<TDbType, TEntity> {
  protected db: Database | null = null

  /**
   * Get or initialize the database connection.
   * All services share the same database file.
   */
  protected async getDatabase(): Promise<Database> {
    if (!this.db) {
      try {
        this.db = await Database.load('sqlite:postpos.db')
      } catch (error) {
        this.handleError('Database initialization error', error)
        throw new Error('Failed to connect to database')
      }
    }
    return this.db
  }

  /**
   * Convert database entity to application entity.
   * Must be implemented by each service.
   */
  protected abstract convertDbEntity(dbEntity: TDbType): TEntity

  /**
   * Log errors with consistent formatting.
   * Override this method to customize error logging.
   */
  protected handleError(context: string, error: unknown): void {
    console.error(`${context}:`, error)
  }

  /**
   * Common pagination response structure.
   */
  protected createPaginationResponse<T>(
    items: T[],
    totalCount: number,
    currentPage: number,
    limit: number,
  ): {
    items: T[]
    totalCount: number
    totalPages: number
    currentPage: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  } {
    const totalPages = Math.ceil(totalCount / limit)
    return {
      items,
      totalCount,
      totalPages,
      currentPage,
      hasNextPage: currentPage < totalPages,
      hasPreviousPage: currentPage > 1,
    }
  }

  /**
   * Execute a paginated query with consistent error handling.
   */
  protected async executePaginatedQuery<T>(
    tableName: string,
    page: number,
    limit: number,
    additionalConditions: string = '',
    orderBy: string = 'created_at DESC',
  ): Promise<{
    items: T[]
    totalCount: number
    totalPages: number
    currentPage: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }> {
    try {
      const db = await this.getDatabase()
      const offset = (page - 1) * limit

      // Build WHERE clause
      const whereClause = additionalConditions ? `WHERE ${additionalConditions}` : ''

      // Get total count
      const countResult = await db.select<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM ${tableName} ${whereClause}`,
      )
      const totalCount = countResult[0]?.count || 0

      // Get paginated items
      const items = await db.select<T[]>(
        `SELECT * FROM ${tableName} ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        [limit, offset],
      )

      return this.createPaginationResponse(items, totalCount, page, limit)
    } catch (error) {
      this.handleError(`Paginated query error for ${tableName}`, error)
      throw new Error(`Failed to fetch paginated ${tableName}`)
    }
  }

  /**
   * Simulate network delay for development/testing.
   * Remove this method in production if not needed.
   */
  protected async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}
