/**
 * Resend Email Provider Adapter
 *
 * Implements email sending via Resend's REST API.
 * Resend is optimized for transactional email with excellent DX.
 *
 * @see https://resend.com/docs/api-reference/emails/send-email
 */

import { BaseEmailProvider } from './base'
import type {
  NormalizedSendOptions,
  SendResult,
  BatchSendResult,
  EmailClientConfig,
} from '../types'
import { EmailErrorCode, wrapError } from '../errors'

const RESEND_API_URL = 'https://api.resend.com'

/**
 * Resend API response types
 */
interface ResendSendResponse {
  id?: string
  error?: {
    message: string
    name: string
  }
}

interface ResendBatchResponse {
  data?: Array<{ id: string }>
  error?: {
    message: string
    name: string
  }
}

/**
 * Resend email provider adapter
 */
export class ResendProvider extends BaseEmailProvider {
  readonly alias = 'resend' as const
  private apiKey: string

  constructor(config: EmailClientConfig) {
    super(config)
    this.apiKey = config.apiKey || ''
  }

  /**
   * Send a single email via Resend API
   */
  async send(options: NormalizedSendOptions): Promise<SendResult> {
    const startTime = Date.now()

    if (!this.apiKey) {
      return this.failedResult('Resend API key not configured', Date.now() - startTime, {
        errorCode: EmailErrorCode.PROVIDER_NOT_CONFIGURED,
      })
    }

    try {
      this.log('Sending email', { to: options.to.map((t) => t.email), subject: options.subject })

      const payload = this.buildPayload(options)

      const response = await fetch(`${RESEND_API_URL}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = (await response.json()) as ResendSendResponse

      if (!response.ok || data.error) {
        const errorMessage = data.error?.message || `HTTP ${response.status}`
        this.logError('Send failed', { status: response.status, error: data.error })

        return this.failedResult(errorMessage, Date.now() - startTime, {
          errorCode: this.mapResendError(data.error?.name),
          rawResponse: data,
        })
      }

      this.log('Email sent successfully', { messageId: data.id })

      return this.successResult(data.id || '', Date.now() - startTime, data)
    } catch (error) {
      this.logError('Send error', error)
      const wrapped = wrapError(error, this.alias, 'Failed to send email')
      return this.failedResult(wrapped.message, Date.now() - startTime, {
        errorCode: wrapped.code,
      })
    }
  }

  /**
   * Send batch emails via Resend batch API
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

    try {
      this.log('Sending batch', { count: recipients.length })

      const emails = recipients.map((options) => this.buildPayload(options))

      const response = await fetch(`${RESEND_API_URL}/emails/batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emails),
      })

      const data = (await response.json()) as ResendBatchResponse

      if (!response.ok || data.error) {
        this.logError('Batch send failed', { status: response.status, error: data.error })
        return {
          total: recipients.length,
          successCount: 0,
          failedCount: recipients.length,
          provider: this.alias,
          durationMs: Date.now() - startTime,
        }
      }

      const successCount = data.data?.length || 0

      this.log('Batch sent', { successCount, total: recipients.length })

      return {
        total: recipients.length,
        successCount,
        failedCount: recipients.length - successCount,
        provider: this.alias,
        results: data.data?.map((item) => ({
          success: true,
          messageId: item.id,
          provider: this.alias,
          durationMs: 0,
        })),
        durationMs: Date.now() - startTime,
      }
    } catch (error) {
      this.logError('Batch error', error)
      return {
        total: recipients.length,
        successCount: 0,
        failedCount: recipients.length,
        provider: this.alias,
        durationMs: Date.now() - startTime,
      }
    }
  }

  /**
   * Validate Resend configuration
   */
  async validate(): Promise<boolean> {
    if (!this.apiKey) {
      return false
    }

    try {
      // Resend doesn't have a dedicated validation endpoint,
      // so we'll check API key format and try to list domains
      const response = await fetch(`${RESEND_API_URL}/domains`, {
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
   * Build Resend API payload from normalized options
   */
  private buildPayload(options: NormalizedSendOptions): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      from: this.formatEmailAddress(options.from),
      to: options.to.map((addr) => addr.email),
      subject: options.subject,
    }

    if (options.html) {
      payload['html'] = options.html
    }

    if (options.text) {
      payload['text'] = options.text
    }

    if (options.replyTo) {
      payload['reply_to'] = options.replyTo.email
    }

    if (options.cc && options.cc.length > 0) {
      payload['cc'] = options.cc.map((addr) => addr.email)
    }

    if (options.bcc && options.bcc.length > 0) {
      payload['bcc'] = options.bcc.map((addr) => addr.email)
    }

    if (options.headers) {
      payload['headers'] = options.headers
    }

    if (options.tags) {
      // Resend uses array format for tags
      payload['tags'] = Object.entries(options.tags).map(([name, value]) => ({
        name,
        value,
      }))
    }

    if (options.attachments && options.attachments.length > 0) {
      payload['attachments'] = options.attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
        type: att.contentType,
      }))
    }

    if (options.scheduledAt) {
      payload['scheduled_at'] = options.scheduledAt.toISOString()
    }

    return payload
  }

  /**
   * Map Resend error name to EmailErrorCode
   */
  private mapResendError(errorName?: string): string | undefined {
    if (!errorName) return undefined

    const errorMap: Record<string, EmailErrorCode> = {
      validation_error: EmailErrorCode.INVALID_EMAIL,
      not_found: EmailErrorCode.TEMPLATE_NOT_FOUND,
      rate_limit_exceeded: EmailErrorCode.RATE_LIMITED,
      unauthorized: EmailErrorCode.AUTH_ERROR,
    }

    return errorMap[errorName] || EmailErrorCode.SEND_FAILED
  }

  /**
   * Get Resend-specific debug info
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
 * Create a Resend provider instance
 */
export function createResendProvider(config: EmailClientConfig): ResendProvider {
  return new ResendProvider(config)
}
