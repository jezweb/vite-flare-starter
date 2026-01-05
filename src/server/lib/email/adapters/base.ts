/**
 * Email Provider Base Interface
 *
 * Defines the contract that all email provider adapters must implement.
 * This enables seamless switching between providers.
 */

import type {
  ProviderAlias,
  NormalizedSendOptions,
  SendResult,
  BatchSendResult,
  SendTemplateOptions,
  EmailClientConfig,
} from '../types'

/**
 * Base interface for email provider adapters
 *
 * All provider adapters must implement this interface to ensure
 * consistent behavior across different email services.
 */
export interface EmailProvider {
  /** Provider identifier */
  readonly alias: ProviderAlias

  /**
   * Send a single email
   *
   * @param options - Normalized send options
   * @returns Send result with message ID if successful
   */
  send(options: NormalizedSendOptions): Promise<SendResult>

  /**
   * Send emails in batch (optional - not all providers support this)
   *
   * @param recipients - Array of send options for each recipient
   * @returns Batch result with success/failure counts
   */
  sendBatch?(recipients: NormalizedSendOptions[]): Promise<BatchSendResult>

  /**
   * Send using a provider-hosted template (optional)
   *
   * @param options - Template send options
   * @returns Send result
   */
  sendTemplate?(options: SendTemplateOptions): Promise<SendResult>

  /**
   * Validate provider configuration/credentials
   *
   * @returns True if the provider is properly configured
   */
  validate(): Promise<boolean>

  /**
   * Get provider-specific debug info
   */
  getDebugInfo?(): Record<string, unknown>
}

/**
 * Base class with shared utilities for provider adapters
 */
export abstract class BaseEmailProvider implements EmailProvider {
  abstract readonly alias: ProviderAlias
  protected config: EmailClientConfig
  protected debug: boolean

  constructor(config: EmailClientConfig) {
    this.config = config
    this.debug = config.debug ?? false
  }

  abstract send(options: NormalizedSendOptions): Promise<SendResult>
  abstract validate(): Promise<boolean>

  /**
   * Log debug message if debug mode is enabled
   */
  protected log(message: string, data?: unknown): void {
    if (this.debug) {
      console.log(`[Email:${this.alias}] ${message}`, data ?? '')
    }
  }

  /**
   * Log error (always)
   */
  protected logError(message: string, error?: unknown): void {
    console.error(`[Email:${this.alias}] ${message}`, error ?? '')
  }

  /**
   * Create a successful send result
   */
  protected successResult(
    messageId: string,
    durationMs: number,
    rawResponse?: unknown
  ): SendResult {
    return {
      success: true,
      messageId,
      provider: this.alias,
      durationMs,
      rawResponse: this.debug ? rawResponse : undefined,
    }
  }

  /**
   * Create a failed send result
   */
  protected failedResult(
    error: string,
    durationMs: number,
    options?: { errorCode?: string; rawResponse?: unknown }
  ): SendResult {
    return {
      success: false,
      error,
      errorCode: options?.errorCode,
      provider: this.alias,
      durationMs,
      rawResponse: this.debug ? options?.rawResponse : undefined,
    }
  }

  /**
   * Format email address for API (e.g., "Name <email@example.com>")
   */
  protected formatEmailAddress(addr: { email: string; name?: string }): string {
    if (addr.name) {
      return `${addr.name} <${addr.email}>`
    }
    return addr.email
  }

  /**
   * Get default debug info
   */
  getDebugInfo(): Record<string, unknown> {
    return {
      provider: this.alias,
      fromEmail: this.config.fromEmail,
      fromName: this.config.fromName,
      debug: this.debug,
    }
  }
}

/**
 * Factory type for creating provider adapters
 */
export type EmailProviderFactory = (config: EmailClientConfig) => EmailProvider
