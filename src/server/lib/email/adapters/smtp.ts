/**
 * Generic SMTP Email Provider Adapter
 *
 * Implements email sending via SMTP protocol.
 *
 * IMPORTANT: Cloudflare Workers do NOT support raw TCP connections.
 * This adapter is provided for:
 * 1. Local development (via Wrangler with Node.js SMTP libs)
 * 2. Future use if deployed to environments that support TCP
 * 3. As a reference implementation
 *
 * For production Workers deployments, use an API-based provider
 * (Resend, SendGrid, Mailgun, SMTP2Go) instead.
 *
 * If you need SMTP in Workers, consider:
 * - Using Cloudflare Email Workers (for receiving)
 * - Using an SMTP relay service with REST API (SMTP2Go, SendGrid)
 * - Setting up an HTTP-to-SMTP proxy
 */

import { BaseEmailProvider } from './base'
import type { NormalizedSendOptions, SendResult, EmailClientConfig, SMTPConfig } from '../types'
import { EmailError, EmailErrorCode } from '../errors'

/**
 * Generic SMTP email provider adapter
 *
 * NOTE: This is a limited implementation for Cloudflare Workers.
 * Workers cannot make raw TCP connections, so SMTP is not fully supported.
 * This adapter will fail gracefully with a clear error message.
 */
export class SMTPProvider extends BaseEmailProvider {
  readonly alias = 'smtp' as const
  private smtpConfig: SMTPConfig | undefined

  constructor(config: EmailClientConfig) {
    super(config)
    this.smtpConfig = config.smtp
  }

  /**
   * Send a single email via SMTP
   *
   * NOTE: This will always fail in Cloudflare Workers due to TCP limitations.
   * Use an API-based provider for Workers deployments.
   */
  async send(options: NormalizedSendOptions): Promise<SendResult> {
    const startTime = Date.now()

    // Check if we're in a Workers environment
    const isWorkersEnvironment =
      typeof globalThis.caches !== 'undefined' &&
      typeof (globalThis as unknown as Record<string, unknown>)['WebSocketPair'] !== 'undefined'

    if (isWorkersEnvironment) {
      console.warn(
        '[Email:SMTP] SMTP is not supported in Cloudflare Workers. ' +
          'Workers cannot make raw TCP connections. ' +
          'Please use an API-based provider (resend, sendgrid, mailgun, smtp2go) instead.'
      )

      return this.failedResult(
        'SMTP is not supported in Cloudflare Workers. Use an API-based provider instead.',
        Date.now() - startTime,
        { errorCode: EmailErrorCode.PROVIDER_NOT_CONFIGURED }
      )
    }

    if (!this.smtpConfig) {
      return this.failedResult('SMTP configuration not provided', Date.now() - startTime, {
        errorCode: EmailErrorCode.PROVIDER_NOT_CONFIGURED,
      })
    }

    if (!this.smtpConfig.host) {
      return this.failedResult('SMTP host not configured', Date.now() - startTime, {
        errorCode: EmailErrorCode.PROVIDER_NOT_CONFIGURED,
      })
    }

    // For non-Workers environments (e.g., Node.js), we would use nodemailer
    // Since we can't import nodemailer in Workers, we provide instructions

    try {
      this.log('Attempting SMTP send', {
        host: this.smtpConfig.host,
        port: this.smtpConfig.port,
        to: options.to.map((t) => t.email),
      })

      // In a Node.js environment, you would:
      // 1. Import nodemailer
      // 2. Create a transport with this.smtpConfig
      // 3. Send the email

      // For now, we throw a helpful error
      throw new EmailError(
        'SMTP requires nodemailer which is not available in this environment. ' +
          'For Workers, use an API-based provider. ' +
          'For Node.js, install nodemailer and extend this adapter.',
        EmailErrorCode.PROVIDER_NOT_CONFIGURED,
        this.alias
      )
    } catch (error) {
      if (error instanceof EmailError) {
        return this.failedResult(error.message, Date.now() - startTime, {
          errorCode: error.code,
        })
      }

      this.logError('SMTP send error', error)
      return this.failedResult(
        error instanceof Error ? error.message : 'Unknown SMTP error',
        Date.now() - startTime,
        { errorCode: EmailErrorCode.SEND_FAILED }
      )
    }
  }

  /**
   * Validate SMTP configuration
   */
  async validate(): Promise<boolean> {
    if (!this.smtpConfig?.host) {
      return false
    }

    // In Workers, SMTP is never valid
    const isWorkersEnvironment =
      typeof globalThis.caches !== 'undefined' &&
      typeof (globalThis as unknown as Record<string, unknown>)['WebSocketPair'] !== 'undefined'

    if (isWorkersEnvironment) {
      console.warn('[Email:SMTP] SMTP validation skipped - not supported in Workers')
      return false
    }

    // In other environments, we would test the connection
    // For now, just return true if config exists
    return true
  }

  /**
   * Get SMTP-specific debug info
   */
  override getDebugInfo(): Record<string, unknown> {
    return {
      ...super.getDebugInfo(),
      smtpHost: this.smtpConfig?.host,
      smtpPort: this.smtpConfig?.port,
      smtpSecure: this.smtpConfig?.secure,
      smtpUsername: this.smtpConfig?.username ? '***' : undefined,
      warning: 'SMTP is not supported in Cloudflare Workers',
    }
  }
}

/**
 * Create an SMTP provider instance
 *
 * NOTE: This provider has limited functionality in Cloudflare Workers.
 * For production use, prefer API-based providers.
 */
export function createSMTPProvider(config: EmailClientConfig): SMTPProvider {
  return new SMTPProvider(config)
}

/**
 * Build RFC 2822 compliant email message
 * (For reference - would be used by nodemailer transport)
 */
export function buildRFC2822Message(options: NormalizedSendOptions): string {
  const lines: string[] = []

  // Headers
  lines.push(`From: ${formatAddress(options.from)}`)
  lines.push(`To: ${options.to.map(formatAddress).join(', ')}`)
  lines.push(`Subject: ${options.subject}`)
  lines.push(`Date: ${new Date().toUTCString()}`)
  lines.push(`MIME-Version: 1.0`)

  if (options.replyTo) {
    lines.push(`Reply-To: ${formatAddress(options.replyTo)}`)
  }

  if (options.cc && options.cc.length > 0) {
    lines.push(`Cc: ${options.cc.map(formatAddress).join(', ')}`)
  }

  // Custom headers
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      lines.push(`${key}: ${value}`)
    }
  }

  // Content type
  if (options.html && options.text) {
    // Multipart
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    lines.push('')
    lines.push(`--${boundary}`)
    lines.push('Content-Type: text/plain; charset=utf-8')
    lines.push('')
    lines.push(options.text)
    lines.push(`--${boundary}`)
    lines.push('Content-Type: text/html; charset=utf-8')
    lines.push('')
    lines.push(options.html)
    lines.push(`--${boundary}--`)
  } else if (options.html) {
    lines.push('Content-Type: text/html; charset=utf-8')
    lines.push('')
    lines.push(options.html)
  } else if (options.text) {
    lines.push('Content-Type: text/plain; charset=utf-8')
    lines.push('')
    lines.push(options.text)
  }

  return lines.join('\r\n')
}

/**
 * Format email address for RFC 2822
 */
function formatAddress(addr: { email: string; name?: string }): string {
  if (addr.name) {
    return `"${addr.name.replace(/"/g, '\\"')}" <${addr.email}>`
  }
  return addr.email
}
