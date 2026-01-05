/**
 * Email Module - Type Definitions
 *
 * Type-safe interfaces for the email abstraction layer.
 * Supports multiple email providers with a unified interface.
 */

/**
 * Available email provider aliases for type-safe provider selection
 */
export type ProviderAlias = 'resend' | 'sendgrid' | 'mailgun' | 'smtp2go' | 'smtp'

/**
 * Provider configuration metadata
 */
export interface ProviderConfig {
  /** Short alias for the provider */
  alias: ProviderAlias
  /** Human-readable provider name */
  name: string
  /** Whether the provider supports template IDs (provider-hosted templates) */
  supportsTemplates: boolean
  /** Whether the provider supports scheduled sending */
  supportsScheduling: boolean
  /** Whether the provider supports batch/bulk sending */
  supportsBatch: boolean
  /** Default rate limit (emails per second) */
  defaultRateLimit: number
  /** Human-readable description */
  description: string
}

/**
 * Email address with optional display name
 */
export interface EmailAddress {
  /** Email address */
  email: string
  /** Optional display name */
  name?: string
}

/**
 * Email attachment
 */
export interface EmailAttachment {
  /** Filename for the attachment */
  filename: string
  /** Base64 encoded content OR a URL to fetch */
  content: string
  /** Optional MIME type (will be inferred from filename if not provided) */
  contentType?: string
}

/**
 * Options for sending a single email
 */
export interface SendOptions {
  /** Recipient email address(es) */
  to: string | string[] | EmailAddress | EmailAddress[]
  /** Email subject line */
  subject: string
  /** HTML content (at least one of html or text required) */
  html?: string
  /** Plain text content */
  text?: string
  /** Override from address (uses provider default if not set) */
  from?: string | EmailAddress
  /** Reply-to address */
  replyTo?: string | EmailAddress
  /** CC recipients */
  cc?: string | string[] | EmailAddress | EmailAddress[]
  /** BCC recipients */
  bcc?: string | string[] | EmailAddress | EmailAddress[]
  /** Custom headers */
  headers?: Record<string, string>
  /** Tags for categorization/tracking (provider-specific) */
  tags?: Record<string, string>
  /** Arbitrary metadata (provider-specific) */
  metadata?: Record<string, unknown>
  /** Attachments */
  attachments?: EmailAttachment[]
  /** Schedule send time (ISO 8601 string or Date) */
  scheduledAt?: string | Date
}

/**
 * Options for sending a templated email (provider-hosted templates)
 */
export interface SendTemplateOptions {
  /** Recipient email address(es) */
  to: string | string[] | EmailAddress | EmailAddress[]
  /** Provider's template ID */
  templateId: string
  /** Template variables/data */
  templateData?: Record<string, unknown>
  /** Override from address */
  from?: string | EmailAddress
  /** Reply-to address */
  replyTo?: string | EmailAddress
  /** Tags for categorization/tracking */
  tags?: Record<string, string>
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>
}

/**
 * Result from sending an email
 */
export interface SendResult {
  /** Whether the send was successful */
  success: boolean
  /** Provider's message ID (for tracking) */
  messageId?: string
  /** Provider alias that handled the send */
  provider: ProviderAlias
  /** Error message if send failed */
  error?: string
  /** Error code if available */
  errorCode?: string
  /** Time taken to send in milliseconds */
  durationMs: number
  /** Raw response from provider (for debugging) */
  rawResponse?: unknown
}

/**
 * Result from batch sending
 */
export interface BatchSendResult {
  /** Total number of recipients attempted */
  total: number
  /** Number of successful sends */
  successCount: number
  /** Number of failed sends */
  failedCount: number
  /** Provider alias that handled the send */
  provider: ProviderAlias
  /** Individual results (if available) */
  results?: SendResult[]
  /** Time taken for entire batch in milliseconds */
  durationMs: number
}

/**
 * Email client configuration options
 */
export interface EmailClientConfig {
  /** Provider to use */
  provider: ProviderAlias
  /** API key (for API-based providers) */
  apiKey?: string
  /** API endpoint/region (for providers with multiple regions) */
  apiEndpoint?: string
  /** Default from email address */
  fromEmail: string
  /** Default from name */
  fromName?: string
  /** SMTP-specific configuration */
  smtp?: SMTPConfig
  /** Rate limit override (emails per second) */
  rateLimit?: number
  /** Enable debug logging */
  debug?: boolean
}

/**
 * SMTP-specific configuration
 */
export interface SMTPConfig {
  /** SMTP host */
  host: string
  /** SMTP port (default: 587 for TLS, 465 for SSL, 25 for plain) */
  port: number
  /** Use TLS (STARTTLS) */
  secure?: boolean
  /** Authentication username */
  username?: string
  /** Authentication password */
  password?: string
  /** Connection timeout in milliseconds */
  timeout?: number
}

/**
 * Environment variables for email configuration
 * Maps to Cloudflare Workers environment bindings
 */
export interface EmailEnv {
  // Provider selection
  EMAIL_PROVIDER?: ProviderAlias

  // Common
  EMAIL_FROM?: string
  EMAIL_FROM_NAME?: string

  // Resend
  RESEND_API_KEY?: string

  // SendGrid
  SENDGRID_API_KEY?: string

  // Mailgun
  MAILGUN_API_KEY?: string
  MAILGUN_DOMAIN?: string
  MAILGUN_REGION?: 'us' | 'eu'

  // SMTP2Go
  SMTP2GO_API_KEY?: string

  // Generic SMTP
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USERNAME?: string
  SMTP_PASSWORD?: string
  SMTP_SECURE?: string
}

/**
 * Normalized email address (always { email, name? } format)
 */
export interface NormalizedEmailAddress {
  email: string
  name?: string
}

/**
 * Internal send parameters (normalized from SendOptions)
 */
export interface NormalizedSendOptions {
  to: NormalizedEmailAddress[]
  subject: string
  html?: string
  text?: string
  from: NormalizedEmailAddress
  replyTo?: NormalizedEmailAddress
  cc?: NormalizedEmailAddress[]
  bcc?: NormalizedEmailAddress[]
  headers?: Record<string, string>
  tags?: Record<string, string>
  metadata?: Record<string, unknown>
  attachments?: EmailAttachment[]
  scheduledAt?: Date
}
