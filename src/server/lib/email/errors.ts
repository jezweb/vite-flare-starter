/**
 * Email Module - Error Handling
 *
 * Custom error types and retry logic for email operations.
 */

import type { ProviderAlias } from './types'

/**
 * Error codes for email operations
 */
export enum EmailErrorCode {
  /** Provider not found or not configured */
  PROVIDER_NOT_FOUND = 'PROVIDER_NOT_FOUND',
  /** Provider not configured (missing API key, etc.) */
  PROVIDER_NOT_CONFIGURED = 'PROVIDER_NOT_CONFIGURED',
  /** Invalid email address format */
  INVALID_EMAIL = 'INVALID_EMAIL',
  /** Missing required fields (to, subject, content) */
  MISSING_REQUIRED = 'MISSING_REQUIRED',
  /** Rate limit exceeded */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Request timed out */
  TIMEOUT = 'TIMEOUT',
  /** Authentication failed (invalid API key) */
  AUTH_ERROR = 'AUTH_ERROR',
  /** Send operation failed */
  SEND_FAILED = 'SEND_FAILED',
  /** Template not found (for template-based sending) */
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  /** Attachment error (too large, invalid format, etc.) */
  ATTACHMENT_ERROR = 'ATTACHMENT_ERROR',
  /** Network or connection error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Provider returned an unexpected response */
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for email operations
 */
export class EmailError extends Error {
  public readonly code: EmailErrorCode
  public readonly provider: ProviderAlias | string
  public readonly cause?: Error
  public readonly statusCode?: number

  constructor(
    message: string,
    code: EmailErrorCode,
    provider: ProviderAlias | string,
    options?: {
      cause?: Error
      statusCode?: number
    }
  ) {
    super(message)
    this.name = 'EmailError'
    this.code = code
    this.provider = provider
    this.cause = options?.cause
    this.statusCode = options?.statusCode

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EmailError)
    }
  }

  /**
   * Create a string representation for logging
   */
  toString(): string {
    const status = this.statusCode ? ` [${this.statusCode}]` : ''
    return `EmailError [${this.code}]${status} (provider: ${this.provider}): ${this.message}`
  }

  /**
   * Convert to a plain object for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      provider: this.provider,
      message: this.message,
      statusCode: this.statusCode,
      cause: this.cause?.message,
    }
  }
}

/**
 * Type guard to check if an error is an EmailError
 */
export function isEmailError(error: unknown): error is EmailError {
  return error instanceof EmailError
}

/**
 * Extract error message from various error formats
 */
function extractErrorMessage(error: unknown): string {
  // Standard Error object
  if (error instanceof Error) {
    return error.message
  }

  // Plain string
  if (typeof error === 'string') {
    return error
  }

  // Object-based errors (common in API responses)
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>

    // Direct message property
    if (typeof err['message'] === 'string') {
      return err['message']
    }

    // Direct error string
    if (typeof err['error'] === 'string') {
      return err['error']
    }

    // Nested error object: { error: { message: string } }
    if (err['error'] && typeof err['error'] === 'object') {
      const nestedErr = err['error'] as Record<string, unknown>
      if (typeof nestedErr['message'] === 'string') {
        return nestedErr['message']
      }
    }

    // Array of errors: { errors: [{ message: string }] }
    if (Array.isArray(err['errors']) && err['errors'].length > 0) {
      const firstError = err['errors'][0] as Record<string, unknown>
      if (typeof firstError?.['message'] === 'string') {
        return firstError['message']
      }
    }

    // Fallback to JSON stringification
    try {
      const jsonStr = JSON.stringify(error)
      return jsonStr === '{}' ? 'Empty error object' : jsonStr
    } catch {
      return '[Non-serializable error object]'
    }
  }

  return String(error) || 'Unknown error'
}

/**
 * Extract HTTP status code from error if available
 */
function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>
    if (typeof err['status'] === 'number') return err['status']
    if (typeof err['statusCode'] === 'number') return err['statusCode']
    if (typeof err['code'] === 'number') return err['code']
  }
  return undefined
}

/**
 * Determine error code based on error message/status
 */
function categorizeError(message: string, statusCode?: number): EmailErrorCode {
  const lowerMessage = message.toLowerCase()

  // Rate limiting
  if (
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('too many requests') ||
    statusCode === 429
  ) {
    return EmailErrorCode.RATE_LIMITED
  }

  // Timeout
  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out') ||
    lowerMessage.includes('etimedout')
  ) {
    return EmailErrorCode.TIMEOUT
  }

  // Authentication
  if (
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('invalid api key') ||
    lowerMessage.includes('authentication') ||
    lowerMessage.includes('forbidden') ||
    statusCode === 401 ||
    statusCode === 403
  ) {
    return EmailErrorCode.AUTH_ERROR
  }

  // Invalid email
  if (
    lowerMessage.includes('invalid email') ||
    lowerMessage.includes('invalid recipient') ||
    lowerMessage.includes('malformed')
  ) {
    return EmailErrorCode.INVALID_EMAIL
  }

  // Network errors
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('enotfound') ||
    lowerMessage.includes('fetch failed')
  ) {
    return EmailErrorCode.NETWORK_ERROR
  }

  // Template not found
  if (
    lowerMessage.includes('template not found') ||
    lowerMessage.includes('template does not exist')
  ) {
    return EmailErrorCode.TEMPLATE_NOT_FOUND
  }

  // Attachment errors
  if (lowerMessage.includes('attachment') || lowerMessage.includes('file too large')) {
    return EmailErrorCode.ATTACHMENT_ERROR
  }

  return EmailErrorCode.UNKNOWN
}

/**
 * Create an EmailError from an unknown error
 */
export function wrapError(
  error: unknown,
  provider: ProviderAlias | string,
  context?: string
): EmailError {
  if (isEmailError(error)) {
    return error
  }

  const errorMessage = extractErrorMessage(error)
  const message = context ? `${context}: ${errorMessage}` : errorMessage
  const statusCode = extractStatusCode(error)
  const code = categorizeError(message, statusCode)
  const originalError = error instanceof Error ? error : new Error(errorMessage)

  return new EmailError(message, code, provider, {
    cause: originalError,
    statusCode,
  })
}

/**
 * Options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 2) */
  retries?: number
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelay?: number
  /** Maximum delay in ms (default: 10000) */
  maxDelay?: number
  /** Error codes that should trigger a retry */
  retryOn?: EmailErrorCode[]
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  retries: 2,
  baseDelay: 1000,
  maxDelay: 10000,
  retryOn: [EmailErrorCode.RATE_LIMITED, EmailErrorCode.TIMEOUT, EmailErrorCode.NETWORK_ERROR],
}

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  provider: ProviderAlias | string,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options }
  let lastError: EmailError | undefined

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = wrapError(error, provider, `Attempt ${attempt + 1}`)

      // Check if we should retry
      const shouldRetry = attempt < opts.retries && opts.retryOn.includes(lastError.code)

      if (!shouldRetry) {
        throw lastError
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt) + Math.random() * 100,
        opts.maxDelay
      )

      console.log(
        `[Email] Retry ${attempt + 1}/${opts.retries} for ${provider} after ${delay}ms: ${lastError.code}`
      )

      await sleep(delay)
    }
  }

  // This should never happen, but TypeScript needs it
  throw lastError || new EmailError('Unknown error', EmailErrorCode.UNKNOWN, provider)
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
