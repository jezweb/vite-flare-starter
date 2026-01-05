/**
 * Email Client
 *
 * A unified interface for sending emails through various providers.
 * Provides a consistent API regardless of the underlying email service.
 *
 * @example
 * import { createEmailClient } from '@/server/lib/email'
 *
 * // Create client from environment
 * const email = createEmailClient({
 *   provider: 'resend',
 *   apiKey: c.env.RESEND_API_KEY,
 *   fromEmail: c.env.EMAIL_FROM,
 *   fromName: 'My App',
 * })
 *
 * // Send email
 * const result = await email.send({
 *   to: 'user@example.com',
 *   subject: 'Welcome!',
 *   html: '<h1>Hello!</h1>',
 * })
 *
 * // Or from environment variables
 * const email = createEmailClientFromEnv(c.env)
 */

import type {
  ProviderAlias,
  SendOptions,
  SendResult,
  BatchSendResult,
  SendTemplateOptions,
  EmailClientConfig,
  EmailEnv,
} from './types'
import type { EmailProvider } from './adapters/base'
import { createResendProvider } from './adapters/resend'
import { createSendGridProvider } from './adapters/sendgrid'
import { createMailgunProvider } from './adapters/mailgun'
import { createSMTP2GoProvider } from './adapters/smtp2go'
import { createSMTPProvider } from './adapters/smtp'
import { EmailError, EmailErrorCode, withRetry } from './errors'
import { PROVIDER_REGISTRY, isValidProvider } from './providers'
import {
  normalizeSendOptions,
  validateEmailAddresses,
  buildConfigFromEnv,
  calculateRateLimitDelay,
  sleep,
} from './utils'

/**
 * Email client class for sending emails through various providers
 */
export class EmailClient {
  private provider: EmailProvider
  private config: EmailClientConfig
  private rateLimit: number

  constructor(config: EmailClientConfig) {
    this.config = config
    this.rateLimit = config.rateLimit || PROVIDER_REGISTRY[config.provider]?.defaultRateLimit || 10

    // Create the appropriate provider adapter
    this.provider = this.createProvider(config)
  }

  /**
   * Create the appropriate provider adapter
   */
  private createProvider(config: EmailClientConfig): EmailProvider {
    switch (config.provider) {
      case 'resend':
        return createResendProvider(config)
      case 'sendgrid':
        return createSendGridProvider(config)
      case 'mailgun':
        return createMailgunProvider(config)
      case 'smtp2go':
        return createSMTP2GoProvider(config)
      case 'smtp':
        return createSMTPProvider(config)
      default:
        throw new EmailError(
          `Unknown email provider: ${config.provider}`,
          EmailErrorCode.PROVIDER_NOT_FOUND,
          config.provider
        )
    }
  }

  /**
   * Send a single email
   *
   * @param options - Email send options
   * @returns Send result with success status and message ID
   *
   * @example
   * const result = await email.send({
   *   to: 'user@example.com',
   *   subject: 'Welcome!',
   *   html: '<h1>Hello!</h1>',
   *   text: 'Hello!',
   * })
   *
   * if (result.success) {
   *   console.log('Sent:', result.messageId)
   * } else {
   *   console.error('Failed:', result.error)
   * }
   */
  async send(options: SendOptions): Promise<SendResult> {
    try {
      // Normalize and validate options
      const normalized = normalizeSendOptions(options, this.config)
      validateEmailAddresses(normalized, this.config.provider)

      // Send with retry
      return await withRetry(() => this.provider.send(normalized), this.config.provider)
    } catch (error) {
      if (error instanceof EmailError) {
        return {
          success: false,
          error: error.message,
          errorCode: error.code,
          provider: this.config.provider,
          durationMs: 0,
        }
      }
      throw error
    }
  }

  /**
   * Send emails in batch
   *
   * @param recipients - Array of email options for each recipient
   * @returns Batch result with success/failure counts
   *
   * @example
   * const result = await email.sendBatch([
   *   { to: 'user1@example.com', subject: 'Hello User 1', html: '...' },
   *   { to: 'user2@example.com', subject: 'Hello User 2', html: '...' },
   * ])
   *
   * console.log(`Sent: ${result.successCount}/${result.total}`)
   */
  async sendBatch(recipients: SendOptions[]): Promise<BatchSendResult> {
    const startTime = Date.now()

    if (recipients.length === 0) {
      return {
        total: 0,
        successCount: 0,
        failedCount: 0,
        provider: this.config.provider,
        durationMs: 0,
      }
    }

    try {
      // Normalize all options
      const normalized = recipients.map((opts) => normalizeSendOptions(opts, this.config))

      // Validate all addresses
      for (const opts of normalized) {
        validateEmailAddresses(opts, this.config.provider)
      }

      // Check if provider supports native batch
      if (this.provider.sendBatch) {
        return await this.provider.sendBatch(normalized)
      }

      // Fallback to sequential sending with rate limiting
      const results: SendResult[] = []
      let successCount = 0
      const delay = calculateRateLimitDelay(this.rateLimit)

      for (const [index, opts] of normalized.entries()) {
        const result = await withRetry(() => this.provider.send(opts), this.config.provider)
        results.push(result)

        if (result.success) {
          successCount++
        }

        // Rate limit delay (except for last item)
        if (index < normalized.length - 1) {
          await sleep(delay)
        }
      }

      return {
        total: recipients.length,
        successCount,
        failedCount: recipients.length - successCount,
        provider: this.config.provider,
        results,
        durationMs: Date.now() - startTime,
      }
    } catch {
      return {
        total: recipients.length,
        successCount: 0,
        failedCount: recipients.length,
        provider: this.config.provider,
        durationMs: Date.now() - startTime,
      }
    }
  }

  /**
   * Send using a provider-hosted template
   *
   * @param options - Template send options
   * @returns Send result
   *
   * @example
   * // SendGrid dynamic template
   * const result = await email.sendTemplate({
   *   to: 'user@example.com',
   *   templateId: 'd-abc123',
   *   templateData: {
   *     firstName: 'John',
   *     resetLink: 'https://...',
   *   },
   * })
   */
  async sendTemplate(options: SendTemplateOptions): Promise<SendResult> {
    if (!this.provider.sendTemplate) {
      return {
        success: false,
        error: `Provider ${this.config.provider} does not support templates`,
        provider: this.config.provider,
        durationMs: 0,
      }
    }

    return withRetry(() => this.provider.sendTemplate!(options), this.config.provider)
  }

  /**
   * Validate that the provider is properly configured
   *
   * @returns True if configuration is valid
   */
  async validate(): Promise<boolean> {
    return this.provider.validate()
  }

  /**
   * Get the current provider alias
   */
  getProvider(): ProviderAlias {
    return this.config.provider
  }

  /**
   * Get provider configuration (for debugging)
   */
  getDebugInfo(): Record<string, unknown> {
    return {
      provider: this.config.provider,
      fromEmail: this.config.fromEmail,
      fromName: this.config.fromName,
      rateLimit: this.rateLimit,
      providerInfo: this.provider.getDebugInfo?.() || {},
    }
  }
}

/**
 * Create an email client with explicit configuration
 *
 * @param config - Email client configuration
 * @returns Email client instance
 *
 * @example
 * const email = createEmailClient({
 *   provider: 'resend',
 *   apiKey: 're_123...',
 *   fromEmail: 'hello@example.com',
 *   fromName: 'My App',
 * })
 */
export function createEmailClient(config: EmailClientConfig): EmailClient {
  if (!isValidProvider(config.provider)) {
    throw new EmailError(
      `Invalid email provider: ${config.provider}`,
      EmailErrorCode.PROVIDER_NOT_FOUND,
      config.provider
    )
  }

  return new EmailClient(config)
}

/**
 * Create an email client from environment variables
 *
 * Reads EMAIL_PROVIDER, EMAIL_FROM, and provider-specific keys
 * from the environment and creates an appropriate client.
 *
 * @param env - Environment variables (from c.env in Hono)
 * @returns Email client instance
 *
 * @example
 * app.post('/api/send', async (c) => {
 *   const email = createEmailClientFromEnv(c.env)
 *   const result = await email.send({
 *     to: 'user@example.com',
 *     subject: 'Hello',
 *     html: '<h1>Hi!</h1>',
 *   })
 *   return c.json(result)
 * })
 */
export function createEmailClientFromEnv(env: EmailEnv): EmailClient {
  const config = buildConfigFromEnv(env)
  return createEmailClient(config)
}

/**
 * Quick send helper - creates client and sends in one call
 *
 * @param config - Email client configuration
 * @param options - Email send options
 * @returns Send result
 *
 * @example
 * const result = await sendEmail(
 *   { provider: 'resend', apiKey: '...', fromEmail: '...' },
 *   { to: 'user@example.com', subject: 'Hi', html: '...' }
 * )
 */
export async function sendEmail(config: EmailClientConfig, options: SendOptions): Promise<SendResult> {
  const client = createEmailClient(config)
  return client.send(options)
}

/**
 * Quick send helper using environment variables
 *
 * @param env - Environment variables
 * @param options - Email send options
 * @returns Send result
 */
export async function sendEmailFromEnv(env: EmailEnv, options: SendOptions): Promise<SendResult> {
  const client = createEmailClientFromEnv(env)
  return client.send(options)
}
