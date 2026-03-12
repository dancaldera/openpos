/**
 * Centralized logging utility for OpenPOS.
 * Provides consistent error logging with context and formatting.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

interface LogEntry {
  level: LogLevel
  context: string
  message: string
  timestamp: string
  data?: unknown
}

class Logger {
  private isDevelopment = true // In production, set this to false
  private logs: LogEntry[] = []

  /**
   * Log an error message.
   */
  error(context: string, error: unknown, data?: unknown): void {
    this.log('error', context, this.extractErrorMessage(error), data)
  }

  /**
   * Log a warning message.
   */
  warn(context: string, message: string, data?: unknown): void {
    this.log('warn', context, message, data)
  }

  /**
   * Log an info message.
   */
  info(context: string, message: string, data?: unknown): void {
    this.log('info', context, message, data)
  }

  /**
   * Log a debug message (only in development).
   */
  debug(context: string, message: string, data?: unknown): void {
    if (this.isDevelopment) {
      this.log('debug', context, message, data)
    }
  }

  /**
   * Core logging method.
   */
  private log(level: LogLevel, context: string, message: string, data?: unknown): void {
    const entry: LogEntry = {
      level,
      context,
      message,
      timestamp: new Date().toISOString(),
      data,
    }

    // Store log entry (for potential export/debugging)
    this.logs.push(entry)

    // Limit log storage to prevent memory issues
    if (this.logs.length > 1000) {
      this.logs.shift()
    }

    // Console output with formatting
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${context}]`

    switch (level) {
      case 'error':
        console.error(prefix, message, data || '')
        break
      case 'warn':
        console.warn(prefix, message, data || '')
        break
      case 'info':
        console.info(prefix, message, data || '')
        break
      case 'debug':
        console.debug(prefix, message, data || '')
        break
    }
  }

  /**
   * Extract error message from various error types.
   */
  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }
    if (typeof error === 'string') {
      return error
    }
    return 'An unknown error occurred'
  }

  /**
   * Get all stored logs (for debugging/export).
   */
  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  /**
   * Clear stored logs.
   */
  clearLogs(): void {
    this.logs = []
  }

  /**
   * Export logs as JSON string.
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2)
  }
}

// Singleton instance
export const logger = new Logger()

/**
 * Convenience function for error logging.
 * Replaces console.error('Get [entity] error:', error)
 */
export function logError(context: string, error: unknown): void {
  logger.error(context, error)
}

/**
 * Convenience function for service error logging.
 * Standardizes the pattern: 'Get customers error:', 'Create product error:', etc.
 */
export function logServiceError(operation: string, entity: string, error: unknown): void {
  logger.error(`${operation} ${entity}`, error)
}
