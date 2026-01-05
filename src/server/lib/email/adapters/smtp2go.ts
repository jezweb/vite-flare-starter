/**
 * SMTP2Go Email Provider Adapter
 *
 * Implements email sending via SMTP2Go's REST API.
 * SMTP2Go offers both API and SMTP relay with good deliverability.
 *
 * @see https://www.smtp2go.com/docs/api/
 */

import { BaseEmailProvider } from './base'
import type {
  NormalizedSendOptions,
  SendResult,
  BatchSendResult,
  EmailClientConfig,
} from '../types'
import { EmailErrorCode, wrapError } from '../errors'

const SMTP2GO_API_URL = 'https://api.smtp2go.com/v3'

/**
 * SMTP2Go API response types
 */
interface SMTP2GoSendResponse {
  data?: {
    succeeded: number
    failed: number
    email_id?: string
    failures?: Array<{
      email: string
      error?: string
    }>
  }
  request_id?: string
}

interface SMTP2GoErrorResponse {
  data?: {
    error?: string
    error_code?: string
  }
}

/**
 * SMTP2Go email provider adapter
 */
export class SMTP2GoProvider extends BaseEmailProvider {
  readonly alias = 'smtp2go' as const
  private apiKey: string

  constructor(config: EmailClientConfig) {
    super(config)
    this.apiKey = config.apiKey || ''
  }

  /**
   * Send a single email via SMTP2Go API
   */
  async send(options: NormalizedSendOptions): Promise<SendResult> {
    const startTime = Date.now()

    if (!this.apiKey) {
      return this.failedResult('SMTP2Go API key not configured', Date.now() - startTime, {
        errorCode: EmailErrorCode.PROVIDER_NOT_CONFIGURED,
      })
    }

    try {
      this.log('Sending email', { to: options.to.map((t) => t.email), subject: options.subject })

      const payload = this.buildPayload(options)

      const response = await fetch(`${SMTP2GO_API_URL}/email/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = (await response.json()) as SMTP2GoSendResponse & SMTP2GoErrorResponse

      // SMTP2Go returns 200 even for some errors, check the response data
      if (!response.ok || data.data?.error) {
        const errorMessage = data.data?.error || `HTTP ${response.status}`
        this.logError('Send failed', { status: response.status, error: errorMessage })

        return this.failedResult(errorMessage, Date.now() - startTime, {
          errorCode: this.mapErrorCode(data.data?.error_code),
          rawResponse: data,
        })
      }

      if (data.data?.failed && data.data.failed > 0) {
        const failureMessage = data.data.failures?.[0]?.error || 'Send failed'
        return this.failedResult(failureMessage, Date.now() - startTime, {
          rawResponse: data,
        })
      }

      const messageId = data.data?.email_id || data.request_id || ''
      this.log('Email sent successfully', { messageId })

      return this.successResult(messageId, Date.now() - startTime, data)
    } catch (error) {
      this.logError('Send error', error)
      const wrapped = wrapError(error, this.alias, 'Failed to send email')
      return this.failedResult(wrapped.message, Date.now() - startTime, {
        errorCode: wrapped.code,
      })
    }
  }

  /**
   * Send batch emails via SMTP2Go
   * SMTP2Go supports multiple recipients in a single request
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

    // Send individually with rate limiting
    const results: SendResult[] = []
    let successCount = 0

    for (const options of recipients) {
      const result = await this.send(options)
      results.push(result)
      if (result.success) successCount++

      // Rate limit delay (conservative for SMTP2Go)
      await new Promise((resolve) => setTimeout(resolve, 50))
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
   * Validate SMTP2Go configuration
   */
  async validate(): Promise<boolean> {
    if (!this.apiKey) {
      return false
    }

    try {
      // Use the stats endpoint to validate API key
      const response = await fetch(`${SMTP2GO_API_URL}/stats/email_summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.apiKey,
        }),
      })

      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Build SMTP2Go API payload from normalized options
   */
  private buildPayload(options: NormalizedSendOptions): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      api_key: this.apiKey,
      sender: this.formatEmailAddress(options.from),
      to: options.to.map((addr) => addr.email),
      subject: options.subject,
    }

    if (options.html) {
      payload['html_body'] = options.html
    }

    if (options.text) {
      payload['text_body'] = options.text
    }

    if (options.replyTo) {
      payload['custom_headers'] = [
        {
          header: 'Reply-To',
          value: options.replyTo.email,
        },
      ]
    }

    if (options.cc && options.cc.length > 0) {
      payload['cc'] = options.cc.map((addr) => addr.email)
    }

    if (options.bcc && options.bcc.length > 0) {
      payload['bcc'] = options.bcc.map((addr) => addr.email)
    }

    if (options.headers) {
      const customHeaders =
        (payload['custom_headers'] as Array<{ header: string; value: string }>) || []
      for (const [header, value] of Object.entries(options.headers)) {
        customHeaders.push({ header, value })
      }
      payload['custom_headers'] = customHeaders
    }

    if (options.attachments && options.attachments.length > 0) {
      payload['attachments'] = options.attachments.map((att) => ({
        filename: att.filename,
        fileblob: att.content,
        mimetype: att.contentType || 'application/octet-stream',
      }))
    }

    return payload
  }

  /**
   * Map SMTP2Go error code to EmailErrorCode
   */
  private mapErrorCode(errorCode?: string): string | undefined {
    if (!errorCode) return undefined

    // SMTP2Go error codes
    const errorMap: Record<string, EmailErrorCode> = {
      E_ApiValidationFailed: EmailErrorCode.INVALID_EMAIL,
      E_ApiKeyInvalid: EmailErrorCode.AUTH_ERROR,
      E_ApiDisabled: EmailErrorCode.AUTH_ERROR,
      E_RateLimit: EmailErrorCode.RATE_LIMITED,
    }

    return errorMap[errorCode] || EmailErrorCode.SEND_FAILED
  }

  /**
   * Get SMTP2Go-specific debug info
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
 * Create an SMTP2Go provider instance
 */
export function createSMTP2GoProvider(config: EmailClientConfig): SMTP2GoProvider {
  return new SMTP2GoProvider(config)
}
