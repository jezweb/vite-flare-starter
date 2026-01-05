/**
 * Mailgun Email Provider Adapter
 *
 * Implements email sending via Mailgun's REST API.
 * Mailgun offers excellent deliverability analytics and developer features.
 *
 * @see https://documentation.mailgun.com/en/latest/api-sending-messages.html
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

/**
 * Mailgun API response types
 */
interface MailgunSendResponse {
  id?: string
  message?: string
}

interface MailgunErrorResponse {
  message?: string
}

/**
 * Mailgun email provider adapter
 */
export class MailgunProvider extends BaseEmailProvider {
  readonly alias = 'mailgun' as const
  private apiKey: string
  private domain: string
  private baseUrl: string

  constructor(config: EmailClientConfig) {
    super(config)
    this.apiKey = config.apiKey || ''
    // Domain can be in apiEndpoint or extracted from fromEmail
    this.domain = config.apiEndpoint || this.extractDomain(config.fromEmail)
    // Default to US region, EU region uses api.eu.mailgun.net
    this.baseUrl = config.apiEndpoint?.includes('eu.mailgun')
      ? 'https://api.eu.mailgun.net/v3'
      : 'https://api.mailgun.net/v3'
  }

  /**
   * Extract domain from email address
   */
  private extractDomain(email: string): string {
    const parts = email.split('@')
    return parts[1] || ''
  }

  /**
   * Send a single email via Mailgun API
   */
  async send(options: NormalizedSendOptions): Promise<SendResult> {
    const startTime = Date.now()

    if (!this.apiKey) {
      return this.failedResult('Mailgun API key not configured', Date.now() - startTime, {
        errorCode: EmailErrorCode.PROVIDER_NOT_CONFIGURED,
      })
    }

    if (!this.domain) {
      return this.failedResult('Mailgun domain not configured', Date.now() - startTime, {
        errorCode: EmailErrorCode.PROVIDER_NOT_CONFIGURED,
      })
    }

    try {
      this.log('Sending email', { to: options.to.map((t) => t.email), subject: options.subject })

      const formData = this.buildFormData(options)

      const response = await fetch(`${this.baseUrl}/${this.domain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`api:${this.apiKey}`)}`,
        },
        body: formData,
      })

      const data = (await response.json()) as MailgunSendResponse | MailgunErrorResponse

      if (!response.ok) {
        const errorMessage = (data as MailgunErrorResponse).message || `HTTP ${response.status}`
        this.logError('Send failed', { status: response.status, error: errorMessage })

        return this.failedResult(errorMessage, Date.now() - startTime, {
          errorCode: this.mapStatusToError(response.status),
          rawResponse: data,
        })
      }

      const messageId = (data as MailgunSendResponse).id || ''
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
   * Send batch emails
   * Mailgun supports batch via recipient-variables
   */
  async sendBatch(recipients: NormalizedSendOptions[]): Promise<BatchSendResult> {
    const startTime = Date.now()

    if (!this.apiKey || !this.domain) {
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

      // Rate limit delay
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
   * Send using a Mailgun stored template
   */
  async sendTemplate(options: SendTemplateOptions): Promise<SendResult> {
    const startTime = Date.now()

    if (!this.apiKey || !this.domain) {
      return this.failedResult('Mailgun not configured', Date.now() - startTime, {
        errorCode: EmailErrorCode.PROVIDER_NOT_CONFIGURED,
      })
    }

    try {
      const to = normalizeEmailAddresses(options.to)
      const from = options.from
        ? typeof options.from === 'string'
          ? options.from
          : this.formatEmailAddress(options.from)
        : this.formatEmailAddress({
            email: this.config.fromEmail,
            name: this.config.fromName,
          })

      const formData = new FormData()
      formData.append('from', from)
      formData.append('to', to.map((addr) => addr.email).join(','))
      formData.append('template', options.templateId)

      if (options.templateData) {
        // Mailgun uses h:X-Mailgun-Variables for template data
        formData.append('h:X-Mailgun-Variables', JSON.stringify(options.templateData))
      }

      if (options.replyTo) {
        const replyTo =
          typeof options.replyTo === 'string' ? options.replyTo : options.replyTo.email
        formData.append('h:Reply-To', replyTo)
      }

      const response = await fetch(`${this.baseUrl}/${this.domain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`api:${this.apiKey}`)}`,
        },
        body: formData,
      })

      const data = (await response.json()) as MailgunSendResponse | MailgunErrorResponse

      if (!response.ok) {
        const errorMessage = (data as MailgunErrorResponse).message || `HTTP ${response.status}`
        return this.failedResult(errorMessage, Date.now() - startTime)
      }

      const messageId = (data as MailgunSendResponse).id || ''
      return this.successResult(messageId, Date.now() - startTime, data)
    } catch (error) {
      const wrapped = wrapError(error, this.alias, 'Failed to send template email')
      return this.failedResult(wrapped.message, Date.now() - startTime, {
        errorCode: wrapped.code,
      })
    }
  }

  /**
   * Validate Mailgun configuration
   */
  async validate(): Promise<boolean> {
    if (!this.apiKey || !this.domain) {
      return false
    }

    try {
      const response = await fetch(`${this.baseUrl}/${this.domain}`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${btoa(`api:${this.apiKey}`)}`,
        },
      })

      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Build FormData for Mailgun API
   * Mailgun uses multipart/form-data instead of JSON
   */
  private buildFormData(options: NormalizedSendOptions): FormData {
    const formData = new FormData()

    formData.append('from', this.formatEmailAddress(options.from))
    formData.append('to', options.to.map((addr) => addr.email).join(','))
    formData.append('subject', options.subject)

    if (options.html) {
      formData.append('html', options.html)
    }

    if (options.text) {
      formData.append('text', options.text)
    }

    if (options.replyTo) {
      formData.append('h:Reply-To', options.replyTo.email)
    }

    if (options.cc && options.cc.length > 0) {
      formData.append('cc', options.cc.map((addr) => addr.email).join(','))
    }

    if (options.bcc && options.bcc.length > 0) {
      formData.append('bcc', options.bcc.map((addr) => addr.email).join(','))
    }

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        formData.append(`h:${key}`, value)
      }
    }

    if (options.tags) {
      // Mailgun supports multiple o:tag parameters
      for (const value of Object.values(options.tags)) {
        formData.append('o:tag', value)
      }
    }

    if (options.metadata) {
      // Mailgun uses v: prefix for custom variables
      for (const [key, value] of Object.entries(options.metadata)) {
        formData.append(`v:${key}`, String(value))
      }
    }

    if (options.attachments && options.attachments.length > 0) {
      for (const att of options.attachments) {
        // For FormData, we need to convert base64 to Blob
        const binaryString = atob(att.content)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        const blob = new Blob([bytes], { type: att.contentType || 'application/octet-stream' })
        formData.append('attachment', blob, att.filename)
      }
    }

    if (options.scheduledAt) {
      // Mailgun uses RFC 2822 date format
      formData.append('o:deliverytime', options.scheduledAt.toUTCString())
    }

    return formData
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
   * Get Mailgun-specific debug info
   */
  override getDebugInfo(): Record<string, unknown> {
    return {
      ...super.getDebugInfo(),
      apiKeyConfigured: !!this.apiKey,
      domain: this.domain,
      region: this.baseUrl.includes('eu.') ? 'EU' : 'US',
    }
  }
}

/**
 * Create a Mailgun provider instance
 */
export function createMailgunProvider(config: EmailClientConfig): MailgunProvider {
  return new MailgunProvider(config)
}
