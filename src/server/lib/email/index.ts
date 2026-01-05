/**
 * Email Module
 *
 * A unified, type-safe abstraction for sending emails through various providers.
 * Supports Resend, SendGrid, Mailgun, SMTP2Go, and generic SMTP.
 *
 * @example
 * import { createEmailClient, createEmailClientFromEnv } from '@/server/lib/email'
 *
 * // Option 1: Create from explicit config
 * const email = createEmailClient({
 *   provider: 'resend',
 *   apiKey: 're_...',
 *   fromEmail: 'hello@example.com',
 *   fromName: 'My App',
 * })
 *
 * // Option 2: Create from environment variables
 * const email = createEmailClientFromEnv(c.env)
 *
 * // Send a single email
 * const result = await email.send({
 *   to: 'user@example.com',
 *   subject: 'Welcome!',
 *   html: '<h1>Hello!</h1>',
 * })
 *
 * // Send batch emails
 * const batchResult = await email.sendBatch([
 *   { to: 'user1@example.com', subject: 'Hello', html: '...' },
 *   { to: 'user2@example.com', subject: 'Hello', html: '...' },
 * ])
 *
 * // Use provider templates (SendGrid, Mailgun)
 * const templateResult = await email.sendTemplate({
 *   to: 'user@example.com',
 *   templateId: 'd-abc123',
 *   templateData: { name: 'John' },
 * })
 *
 * @module
 */

// Client
export {
  EmailClient,
  createEmailClient,
  createEmailClientFromEnv,
  sendEmail,
  sendEmailFromEnv,
} from './client'

// Providers
export {
  PROVIDER_REGISTRY,
  DEFAULT_PROVIDER,
  getProvider,
  isValidProvider,
  getRecommendedProvider,
  listProviders,
  getProvidersWithFeature,
} from './providers'

// Errors
export {
  EmailError,
  EmailErrorCode,
  isEmailError,
  wrapError,
  withRetry,
  type RetryOptions,
} from './errors'

// Utilities
export {
  normalizeEmailAddress,
  normalizeEmailAddresses,
  normalizeSendOptions,
  isValidEmail,
  validateEmailAddresses,
  buildConfigFromEnv,
  htmlToText,
  calculateRateLimitDelay,
  sleep,
} from './utils'

// Types
export type {
  ProviderAlias,
  ProviderConfig,
  EmailAddress,
  EmailAttachment,
  SendOptions,
  SendTemplateOptions,
  SendResult,
  BatchSendResult,
  EmailClientConfig,
  SMTPConfig,
  EmailEnv,
  NormalizedEmailAddress,
  NormalizedSendOptions,
} from './types'

// Adapters (for advanced use cases)
export {
  BaseEmailProvider,
  type EmailProvider,
  type EmailProviderFactory,
  ResendProvider,
  createResendProvider,
  SendGridProvider,
  createSendGridProvider,
  MailgunProvider,
  createMailgunProvider,
  SMTP2GoProvider,
  createSMTP2GoProvider,
  SMTPProvider,
  createSMTPProvider,
} from './adapters'
