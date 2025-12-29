/**
 * Structured JSON Logger
 *
 * Provides consistent JSON-formatted logging for Cloudflare Workers.
 * Designed for easy parsing by log aggregation tools.
 *
 * @example
 * logger.info('User logged in', { userId: '123', method: 'oauth' })
 * // {"level":"info","message":"User logged in","userId":"123","method":"oauth","ts":1234567890}
 *
 * logger.error('Database query failed', error, { query: 'SELECT...' })
 * // {"level":"error","message":"Database query failed","error":"connection timeout","stack":"...","query":"SELECT...","ts":1234567890}
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogMeta {
  [key: string]: unknown
}

interface LogEntry {
  level: LogLevel
  message: string
  ts: number
  error?: string
  stack?: string
  [key: string]: unknown
}

/**
 * Format a log entry as JSON string
 */
function formatLog(entry: LogEntry): string {
  return JSON.stringify(entry)
}

/**
 * Create a log entry with common fields
 */
function createEntry(level: LogLevel, message: string, meta?: LogMeta): LogEntry {
  return {
    level,
    message,
    ts: Date.now(),
    ...meta,
  }
}

export const logger = {
  /**
   * Debug level logging - for development and detailed tracing
   */
  debug(message: string, meta?: LogMeta): void {
    console.debug(formatLog(createEntry('debug', message, meta)))
  },

  /**
   * Info level logging - for normal operations
   */
  info(message: string, meta?: LogMeta): void {
    console.log(formatLog(createEntry('info', message, meta)))
  },

  /**
   * Warning level logging - for recoverable issues
   */
  warn(message: string, meta?: LogMeta): void {
    console.warn(formatLog(createEntry('warn', message, meta)))
  },

  /**
   * Error level logging - for failures and exceptions
   */
  error(message: string, error?: Error | unknown, meta?: LogMeta): void {
    const entry = createEntry('error', message, meta)

    if (error instanceof Error) {
      entry.error = error.message
      entry.stack = error.stack
    } else if (error !== undefined) {
      entry.error = String(error)
    }

    console.error(formatLog(entry))
  },

  /**
   * Log with request context - adds requestId, path, method
   */
  withRequest(
    requestId: string,
    path: string,
    method: string
  ): {
    debug: (message: string, meta?: LogMeta) => void
    info: (message: string, meta?: LogMeta) => void
    warn: (message: string, meta?: LogMeta) => void
    error: (message: string, error?: Error | unknown, meta?: LogMeta) => void
  } {
    const requestMeta = { requestId, path, method }

    return {
      debug: (message: string, meta?: LogMeta) =>
        logger.debug(message, { ...requestMeta, ...meta }),
      info: (message: string, meta?: LogMeta) =>
        logger.info(message, { ...requestMeta, ...meta }),
      warn: (message: string, meta?: LogMeta) =>
        logger.warn(message, { ...requestMeta, ...meta }),
      error: (message: string, error?: Error | unknown, meta?: LogMeta) =>
        logger.error(message, error, { ...requestMeta, ...meta }),
    }
  },

  /**
   * Log API request completion with timing
   */
  request(
    method: string,
    path: string,
    status: number,
    durationMs: number,
    meta?: LogMeta
  ): void {
    const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'

    const entry = createEntry(level, `${method} ${path} ${status}`, {
      method,
      path,
      status,
      durationMs,
      ...meta,
    })

    if (level === 'error') {
      console.error(formatLog(entry))
    } else if (level === 'warn') {
      console.warn(formatLog(entry))
    } else {
      console.log(formatLog(entry))
    }
  },
}

export default logger
