/**
 * Workers AI Module - Error Handling
 *
 * Custom error types and retry logic for AI operations.
 */

import type { ModelId } from './types'

/**
 * Error codes for AI operations
 */
export enum AIErrorCode {
  /** Model not found in registry */
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  /** Rate limit exceeded */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Request timed out */
  TIMEOUT = 'TIMEOUT',
  /** Invalid response from model */
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  /** Failed to parse JSON from response */
  JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
  /** Zod validation failed */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** Network or connection error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for AI operations
 */
export class AIError extends Error {
  public readonly code: AIErrorCode
  public readonly model: ModelId | string
  public readonly cause?: Error

  constructor(
    message: string,
    code: AIErrorCode,
    model: ModelId | string,
    cause?: Error
  ) {
    super(message)
    this.name = 'AIError'
    this.code = code
    this.model = model
    this.cause = cause

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AIError)
    }
  }

  /**
   * Create a string representation for logging
   */
  toString(): string {
    return `AIError [${this.code}] (model: ${this.model}): ${this.message}`
  }

  /**
   * Convert to a plain object for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      model: this.model,
      message: this.message,
      cause: this.cause?.message,
    }
  }
}

/**
 * Type guard to check if an error is an AIError
 */
export function isAIError(error: unknown): error is AIError {
  return error instanceof AIError
}

/**
 * Extract error message from various error formats
 * Workers AI errors can come in different formats:
 * - Standard Error: { message: string }
 * - API Error: { error: string } or { error: { message: string, code: number } }
 * - Cloudflare Error: { errors: [{ message: string, code: number }] }
 * - InternalError thrown by Workers AI binding
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

  // Object-based errors
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

    // Nested error object: { error: { message: string, code: number } }
    if (err['error'] && typeof err['error'] === 'object') {
      const nestedErr = err['error'] as Record<string, unknown>
      if (typeof nestedErr['message'] === 'string') {
        const code = nestedErr['code'] ? ` (code: ${nestedErr['code']})` : ''
        return `${nestedErr['message']}${code}`
      }
    }

    // Cloudflare API format: { errors: [{ message, code }] }
    if (Array.isArray(err['errors']) && err['errors'].length > 0) {
      const firstError = err['errors'][0] as Record<string, unknown>
      if (typeof firstError?.['message'] === 'string') {
        const code = firstError['code'] ? ` (code: ${firstError['code']})` : ''
        return `${firstError['message']}${code}`
      }
    }

    // Workers AI InternalError: { name: string, message: string }
    if (typeof err['name'] === 'string' && typeof err['message'] === 'string') {
      return `${err['name']}: ${err['message']}`
    }

    // Fallback to JSON stringification
    try {
      const jsonStr = JSON.stringify(error)
      // If it's just "{}" return something more helpful
      return jsonStr === '{}' ? 'Empty error object' : jsonStr
    } catch {
      return '[Non-serializable error object]'
    }
  }

  return String(error) || 'Unknown error'
}

/**
 * Create an AIError from an unknown error
 * Workers AI error codes reference:
 * - 5007: No such model
 * - 5004: Invalid data
 * - 5016: Model agreement not accepted
 * - 3036: Rate limit (daily free allocation exceeded)
 * - 3040: Out of capacity
 * - 3007/3008: Timeout/Aborted
 */
export function wrapError(
  error: unknown,
  model: ModelId | string,
  context?: string
): AIError {
  if (isAIError(error)) {
    return error
  }

  const errorMessage = extractErrorMessage(error)
  const message = context ? `${context}: ${errorMessage}` : errorMessage
  const originalError = error instanceof Error ? error : new Error(errorMessage)

  // Try to categorize the error based on message content and known patterns
  const lowerMessage = message.toLowerCase()

  // Rate limiting patterns
  if (
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('429') ||
    lowerMessage.includes('3036') ||
    lowerMessage.includes('daily free allocation') ||
    lowerMessage.includes('out of capacity') ||
    lowerMessage.includes('3040')
  ) {
    return new AIError(message, AIErrorCode.RATE_LIMITED, model, originalError)
  }

  // Timeout patterns
  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out') ||
    lowerMessage.includes('3007') ||
    lowerMessage.includes('aborted') ||
    lowerMessage.includes('3008')
  ) {
    return new AIError(message, AIErrorCode.TIMEOUT, model, originalError)
  }

  // Network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
    return new AIError(message, AIErrorCode.NETWORK_ERROR, model, originalError)
  }

  // Model not found
  if (
    lowerMessage.includes('no such model') ||
    lowerMessage.includes('5007') ||
    lowerMessage.includes('model not found')
  ) {
    return new AIError(message, AIErrorCode.MODEL_NOT_FOUND, model, originalError)
  }

  // Invalid response/data
  if (
    lowerMessage.includes('invalid data') ||
    lowerMessage.includes('5004') ||
    lowerMessage.includes('invalid input')
  ) {
    return new AIError(message, AIErrorCode.INVALID_RESPONSE, model, originalError)
  }

  return new AIError(message, AIErrorCode.UNKNOWN, model, originalError)
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
  retryOn?: AIErrorCode[]
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  retries: 2,
  baseDelay: 1000,
  maxDelay: 10000,
  retryOn: [AIErrorCode.RATE_LIMITED, AIErrorCode.TIMEOUT, AIErrorCode.NETWORK_ERROR],
}

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  model: ModelId | string,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options }
  let lastError: AIError | undefined

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = wrapError(error, model, `Attempt ${attempt + 1}`)

      // Check if we should retry
      const shouldRetry =
        attempt < opts.retries && opts.retryOn.includes(lastError.code)

      if (!shouldRetry) {
        throw lastError
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt) + Math.random() * 100,
        opts.maxDelay
      )

      console.log(
        `[AI] Retry ${attempt + 1}/${opts.retries} for ${model} after ${delay}ms: ${lastError.code}`
      )

      await sleep(delay)
    }
  }

  // This should never happen, but TypeScript needs it
  throw lastError || new AIError('Unknown error', AIErrorCode.UNKNOWN, model)
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
