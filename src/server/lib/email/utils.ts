/**
 * Email Module - Utilities
 *
 * Helper functions for email operations.
 */

import type {
  SendOptions,
  NormalizedSendOptions,
  NormalizedEmailAddress,
  EmailAddress,
  EmailClientConfig,
  EmailEnv,
  ProviderAlias,
} from './types'
import { EmailError, EmailErrorCode } from './errors'
import { DEFAULT_PROVIDER, isValidProvider } from './providers'

/**
 * Normalize an email address input to { email, name? } format
 */
export function normalizeEmailAddress(input: string | EmailAddress): NormalizedEmailAddress {
  if (typeof input === 'string') {
    // Check for "Name <email>" format
    const match = input.match(/^(.+?)\s*<(.+?)>$/)
    if (match && match[1] && match[2]) {
      return {
        name: match[1].trim(),
        email: match[2].trim(),
      }
    }
    return { email: input.trim() }
  }
  return {
    email: input.email.trim(),
    name: input.name?.trim(),
  }
}

/**
 * Normalize array of email addresses
 */
export function normalizeEmailAddresses(
  input: string | string[] | EmailAddress | EmailAddress[] | undefined
): NormalizedEmailAddress[] {
  if (!input) return []

  if (typeof input === 'string') {
    return [normalizeEmailAddress(input)]
  }

  if (Array.isArray(input)) {
    return input.map((addr) =>
      typeof addr === 'string' ? normalizeEmailAddress(addr) : normalizeEmailAddress(addr)
    )
  }

  // Single EmailAddress object
  return [normalizeEmailAddress(input)]
}

/**
 * Normalize SendOptions to internal format
 */
export function normalizeSendOptions(
  options: SendOptions,
  config: EmailClientConfig
): NormalizedSendOptions {
  const to = normalizeEmailAddresses(options.to)
  if (to.length === 0) {
    throw new EmailError(
      'At least one recipient is required',
      EmailErrorCode.MISSING_REQUIRED,
      config.provider
    )
  }

  if (!options.subject) {
    throw new EmailError('Subject is required', EmailErrorCode.MISSING_REQUIRED, config.provider)
  }

  if (!options.html && !options.text) {
    throw new EmailError(
      'Either html or text content is required',
      EmailErrorCode.MISSING_REQUIRED,
      config.provider
    )
  }

  // Default from address
  const from = options.from
    ? normalizeEmailAddress(options.from)
    : {
        email: config.fromEmail,
        name: config.fromName,
      }

  return {
    to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    from,
    replyTo: options.replyTo ? normalizeEmailAddress(options.replyTo) : undefined,
    cc: normalizeEmailAddresses(options.cc),
    bcc: normalizeEmailAddresses(options.bcc),
    headers: options.headers,
    tags: options.tags,
    metadata: options.metadata,
    attachments: options.attachments,
    scheduledAt: options.scheduledAt
      ? options.scheduledAt instanceof Date
        ? options.scheduledAt
        : new Date(options.scheduledAt)
      : undefined,
  }
}

/**
 * Basic email validation regex
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email)
}

/**
 * Validate all email addresses in normalized options
 */
export function validateEmailAddresses(
  options: NormalizedSendOptions,
  provider: ProviderAlias
): void {
  const allAddresses = [
    options.from,
    ...options.to,
    ...(options.cc || []),
    ...(options.bcc || []),
    ...(options.replyTo ? [options.replyTo] : []),
  ]

  for (const addr of allAddresses) {
    if (!isValidEmail(addr.email)) {
      throw new EmailError(
        `Invalid email address: ${addr.email}`,
        EmailErrorCode.INVALID_EMAIL,
        provider
      )
    }
  }
}

/**
 * Build EmailClientConfig from environment variables
 */
export function buildConfigFromEnv(env: EmailEnv): EmailClientConfig {
  const provider = (env.EMAIL_PROVIDER || DEFAULT_PROVIDER) as ProviderAlias

  if (!isValidProvider(provider)) {
    throw new EmailError(
      `Invalid email provider: ${provider}`,
      EmailErrorCode.PROVIDER_NOT_FOUND,
      provider
    )
  }

  const baseConfig: EmailClientConfig = {
    provider,
    fromEmail: env.EMAIL_FROM || '',
    fromName: env.EMAIL_FROM_NAME,
  }

  // Add provider-specific configuration
  switch (provider) {
    case 'resend':
      return {
        ...baseConfig,
        apiKey: env.RESEND_API_KEY,
      }

    case 'sendgrid':
      return {
        ...baseConfig,
        apiKey: env.SENDGRID_API_KEY,
      }

    case 'mailgun':
      return {
        ...baseConfig,
        apiKey: env.MAILGUN_API_KEY,
        apiEndpoint: env.MAILGUN_DOMAIN,
        // Mailgun has US and EU regions
        ...(env.MAILGUN_REGION === 'eu' && {
          apiEndpoint: `https://api.eu.mailgun.net/v3/${env.MAILGUN_DOMAIN}`,
        }),
      }

    case 'smtp2go':
      return {
        ...baseConfig,
        apiKey: env.SMTP2GO_API_KEY,
      }

    case 'smtp':
      return {
        ...baseConfig,
        smtp: {
          host: env.SMTP_HOST || '',
          port: parseInt(env.SMTP_PORT || '587', 10),
          username: env.SMTP_USERNAME,
          password: env.SMTP_PASSWORD,
          secure: env.SMTP_SECURE === 'true',
        },
      }
  }
}

/**
 * Generate plain text from HTML (basic implementation)
 */
export function htmlToText(html: string): string {
  return (
    html
      // Remove style and script tags with content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      // Convert line breaks
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      // Convert links to text with URL
      .replace(/<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
      // Remove remaining HTML tags
      .replace(/<[^>]+>/g, '')
      // Decode common HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Clean up whitespace
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim()
  )
}

/**
 * Rate limit helper - delay between sends
 */
export function calculateRateLimitDelay(rateLimit: number): number {
  // Convert rate per second to delay in ms
  // Add 10% buffer to stay under limit
  return Math.ceil((1000 / rateLimit) * 1.1)
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
