/**
 * SendGrid Email Provider Adapter
 *
 * Implements email sending via SendGrid's REST API (v3).
 * SendGrid is an industry-standard email platform with robust features.
 *
 * @see https://docs.sendgrid.com/api-reference/mail-send/mail-send
 */

import { BaseEmailProvider } from './base'
import type {
  NormalizedSendOptions,
  SendResult,
  BatchSendResult,
  SendTemplateOptions,
  EmailClientConfig,
} from '../types'
import { EmailErrorCode, wrapError } from '../errors'
import { normalizeEmailAddresses } from '../utils'

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3'

/**
 * SendGrid API types
 */
interface SendGridPersonalization {
  to: Array<{ email: string; name?: string }>
  cc?: Array<{ email: string; name?: string }>
  bcc?: Array<{ email: string; name?: string }>
  subject?: string
  dynamic_template_data?: Record<string, unknown>
}

interface SendGridContent {
  type: string
  value: string
}

interface SendGridAttachment {
  content: string
  type?: string
  filename: string
  disposition?: 'attachment' | 'inline'
}

interface SendGridMail {
  personalizations: SendGridPersonalization[]
  from: { email: string; name?: string }
  reply_to?: { email: string; name?: string }
  subject?: string
  content?: SendGridContent[]
  attachments?: SendGridAttachment[]
  headers?: Record<string, string>
  categories?: string[]
  custom_args?: Record<string, string>
  send_at?: number
  template_id?: string
}

interface SendGridResponse {
  errors?: Array<{
    message: string
    field?: string
    help?: string
  }>
}

/**
 * SendGrid email provider adapter
 */
export class SendGridProvider extends BaseEmailProvider {
  readonly alias = 'sendgrid' as const
  private apiKey: string

  constructor(config: EmailClientConfig) {
    super(config)
    this.apiKey = config.apiKey || ''
  }

  /**
   * Send a single email via SendGrid API
   */
  async send(options: NormalizedSendOptions): Promise<SendResult> {
    const startTime = Date.now()

    if (!this.apiKey) {
      return this.failedResult('SendGrid API key not configured', Date.now() - startTime, {
        errorCode: EmailErrorCode.PROVIDER_NOT_CONFIGURED,
      })
    }

    try {
      this.log('Sending email', { to: options.to.map((t) => t.email), subject: options.subject })

      const payload = this.buildPayload(options)

      const response = await fetch(`${SENDGRID_API_URL}/mail/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      // SendGrid returns 202 Accepted on success with no body
      if (response.status === 202) {
        const messageId = response.headers.get('X-Message-Id') || ''
        this.log('Email sent successfully', { messageId })
        return this.successResult(messageId, Date.now() - startTime)
      }

      // Handle error response
      let errorMessage = `HTTP ${response.status}`
      try {
        const data = (await response.json()) as SendGridResponse
        if (data.errors && data.errors.length > 0) {
          errorMessage = data.errors.map((e) => e.message).join(', ')
        }
      } catch {
        // Response might not be JSON
      }

      this.logError('Send failed', { status: response.status, error: errorMessage })

      return this.failedResult(errorMessage, Date.now() - startTime, {
        errorCode: this.mapStatusToError(response.status),
      })
    } catch (error) {
      this.logError('Send error', error)
      const wrapped = wrapError(error, this.alias, 'Failed to send email')
      return this.failedResult(wrapped.message, Date.now() - startTime, {
        errorCode: wrapped.code,
      })
    }
  }

  /**
   * Send batch emails via SendGrid personalizations
   * SendGrid supports up to 1000 personalizations in a single request
   */
  async sendBatch(recipients: NormalizedSendOptions[]): Promise<BatchSendResult> {
    const startTime = Date.now()

    if (!this.apiKey) {
      return {
        total: recipients.length,
        successCount: 0,
        failedCount: recipients.length,
        provider: this.alias,
        durationMs: Date.now() - startTime,
      }
    }

    // SendGrid batch is done via personalizations
    // Each personalization can have different recipients but same content
    // For truly different content per recipient, we need to send individually
    // For now, we'll send individually with rate limiting

    const results: SendResult[] = []
    let successCount = 0

    for (const options of recipients) {
      const result = await this.send(options)
      results.push(result)
      if (result.success) successCount++

      // Rate limit delay (conservative)
      await new Promise((resolve) => setTimeout(resolve, 20))
    }

    return {
      total: recipients.length,
      successCount,
      failedCount: recipients.length - successCount,
      provider: this.alias,
      results,
      durationMs: Date.now() - startTime,
    }
  }

  /**
   * Send using a SendGrid dynamic template
   */
  async sendTemplate(options: SendTemplateOptions): Promise<SendResult> {
    const startTime = Date.now()

    if (!this.apiKey) {
      return this.failedResult('SendGrid API key not configured', Date.now() - startTime, {
        errorCode: EmailErrorCode.PROVIDER_NOT_CONFIGURED,
      })
    }

    try {
      const to = normalizeEmailAddresses(options.to)
      const from = options.from
        ? typeof options.from === 'string'
          ? { email: options.from }
          : { email: options.from.email, name: options.from.name }
        : { email: this.config.fromEmail, name: this.config.fromName }

      const payload: SendGridMail = {
        personalizations: [
          {
            to: to.map((addr) => ({ email: addr.email, name: addr.name })),
            dynamic_template_data: options.templateData,
          },
        ],
        from,
        template_id: options.templateId,
      }

      if (options.replyTo) {
        const replyTo =
          typeof options.replyTo === 'string'
            ? { email: options.replyTo }
            : { email: options.replyTo.email, name: options.replyTo.name }
        payload.reply_to = replyTo
      }

      const response = await fetch(`${SENDGRID_API_URL}/mail/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (response.status === 202) {
        const messageId = response.headers.get('X-Message-Id') || ''
        return this.successResult(messageId, Date.now() - startTime)
      }

      let errorMessage = `HTTP ${response.status}`
      try {
        const data = (await response.json()) as SendGridResponse
        if (data.errors && data.errors.length > 0) {
          errorMessage = data.errors.map((e) => e.message).join(', ')
        }
      } catch {
        // Response might not be JSON
      }

      return this.failedResult(errorMessage, Date.now() - startTime)
    } catch (error) {
      const wrapped = wrapError(error, this.alias, 'Failed to send template email')
      return this.failedResult(wrapped.message, Date.now() - startTime, {
        errorCode: wrapped.code,
      })
    }
  }

  /**
   * Validate SendGrid configuration
   */
  async validate(): Promise<boolean> {
    if (!this.apiKey) {
      return false
    }

    try {
      // Check API key by fetching user profile
      const response = await fetch(`${SENDGRID_API_URL}/user/profile`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      })

      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Build SendGrid API payload from normalized options
   */
  private buildPayload(options: NormalizedSendOptions): SendGridMail {
    const personalization: SendGridPersonalization = {
      to: options.to.map((addr) => ({
        email: addr.email,
        name: addr.name,
      })),
    }

    if (options.cc && options.cc.length > 0) {
      personalization.cc = options.cc.map((addr) => ({
        email: addr.email,
        name: addr.name,
      }))
    }

    if (options.bcc && options.bcc.length > 0) {
      personalization.bcc = options.bcc.map((addr) => ({
        email: addr.email,
        name: addr.name,
      }))
    }

    const payload: SendGridMail = {
      personalizations: [personalization],
      from: {
        email: options.from.email,
        name: options.from.name,
      },
      subject: options.subject,
    }

    // Build content array
    const content: SendGridContent[] = []
    if (options.text) {
      content.push({ type: 'text/plain', value: options.text })
    }
    if (options.html) {
      content.push({ type: 'text/html', value: options.html })
    }
    if (content.length > 0) {
      payload.content = content
    }

    if (options.replyTo) {
      payload.reply_to = {
        email: options.replyTo.email,
        name: options.replyTo.name,
      }
    }

    if (options.headers) {
      payload.headers = options.headers
    }

    if (options.tags) {
      // SendGrid uses categories (up to 10)
      payload.categories = Object.values(options.tags).slice(0, 10)
    }

    if (options.metadata) {
      // SendGrid uses custom_args for metadata
      payload.custom_args = Object.fromEntries(
        Object.entries(options.metadata).map(([k, v]) => [k, String(v)])
      )
    }

    if (options.attachments && options.attachments.length > 0) {
      payload.attachments = options.attachments.map((att) => ({
        content: att.content,
        filename: att.filename,
        type: att.contentType,
        disposition: 'attachment',
      }))
    }

    if (options.scheduledAt) {
      // SendGrid uses Unix timestamp
      payload.send_at = Math.floor(options.scheduledAt.getTime() / 1000)
    }

    return payload
  }

  /**
   * Map HTTP status code to EmailErrorCode
   */
  private mapStatusToError(status: number): string {
    switch (status) {
      case 401:
        return EmailErrorCode.AUTH_ERROR
      case 403:
        return EmailErrorCode.AUTH_ERROR
      case 429:
        return EmailErrorCode.RATE_LIMITED
      case 400:
        return EmailErrorCode.INVALID_EMAIL
      default:
        return EmailErrorCode.SEND_FAILED
    }
  }

  /**
   * Get SendGrid-specific debug info
   */
  override getDebugInfo(): Record<string, unknown> {
    return {
      ...super.getDebugInfo(),
      apiKeyConfigured: !!this.apiKey,
      apiKeyPrefix: this.apiKey ? this.apiKey.substring(0, 8) + '...' : undefined,
    }
  }
}

/**
 * Create a SendGrid provider instance
 */
export function createSendGridProvider(config: EmailClientConfig): SendGridProvider {
  return new SendGridProvider(config)
}
