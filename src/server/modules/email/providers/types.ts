/**
 * Email provider contract.
 *
 * Every provider implements the same shape so the service can iterate
 * a priority list and optionally cascade through failover.
 */
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Stable provider id. Persisted into `email_log.provider` for the
 * admin log viewer + cost analysis. Add a new id here when adding a
 * provider.
 */
export type EmailProvider =
  | 'email-service'      // env.EMAIL — Cloudflare Email Service (beta)
  | 'email-routing-send' // env.SEND_EMAIL — Cloudflare Email Routing
  | 'smtp2go'            // SMTP2Go HTTP API
  | 'mailgun'            // Mailgun HTTP API
  | 'resend'             // Resend HTTP API
  | 'console'            // dev fallback (logs only)

/**
 * Minimal binding shape for the Cloudflare Email Service binding —
 * `env.EMAIL.send({ from, to, subject, html, text, replyTo })`.
 */
export interface CloudflareEmailServiceBinding {
  send: (message: {
    from: string
    to: string | string[]
    subject: string
    html?: string
    text?: string
    replyTo?: string
  }) => Promise<{ messageId?: string; id?: string } | void>
}

/**
 * Email Routing's older send-from-Worker binding. Takes a fully-built
 * MIME message via the `cloudflare:email` runtime module.
 */
export interface SendEmailBinding {
  send: (message: unknown) => Promise<void>
}

export interface EmailEnv {
  DB: D1Database
  /** Cloudflare Email Service binding. */
  EMAIL?: CloudflareEmailServiceBinding
  /** Cloudflare Email Routing send-from-Worker binding. */
  SEND_EMAIL?: SendEmailBinding

  // Provider API keys — set as wrangler secrets in production.
  /** Resend (https://resend.com) API key. Legacy name kept for
   *  backwards compat; RESEND_API_KEY also accepted. */
  EMAIL_API_KEY?: string
  RESEND_API_KEY?: string
  /** SMTP2Go API key. Used by the smtp2go provider. */
  SMTP2GO_API_KEY?: string
  /** Mailgun API key. Used by the mailgun provider. */
  MAILGUN_API_KEY?: string
  /** Mailgun sending domain. */
  MAILGUN_DOMAIN?: string
  /** Mailgun region — 'us' (default) or 'eu'. */
  MAILGUN_REGION?: string

  EMAIL_FROM?: string
  /**
   * Optional display name prepended to the From address — produces
   * `Display Name <user@example.com>` per RFC 5322. Falls back to
   * `APP_NAME` when set, otherwise the bare email address.
   *
   * Example: `EMAIL_FROM_NAME='RightCover Insurance'`
   */
  EMAIL_FROM_NAME?: string
  /**
   * Optional plain-text signature line(s) appended to template-rendered
   * emails. Use a single string with `\n` for line breaks. Templates
   * include it via `{{signature}}` slot when they want it.
   *
   * Example: `EMAIL_SIGNATURE='Michael Luc · Lake Macquarie Insurance\n0411 056 876'`
   */
  EMAIL_SIGNATURE?: string
  /**
   * Optional header image URL embedded at the top of HTML email bodies.
   * Recommended size: 600×100 (transactional standard).
   *
   * Example: `EMAIL_HEADER_IMAGE_URL='https://cdn.rightcover.com.au/email-banner.png'`
   */
  EMAIL_HEADER_IMAGE_URL?: string
  APP_NAME?: string
  APP_URL?: string
  BETTER_AUTH_URL?: string

  /**
   * When set to 'true', the service falls through to the next provider
   * if one fails. Default: false (strict — fail loud, log + return
   * status='failed').
   */
  EMAIL_FAILOVER?: string

  /**
   * Optional comma-separated provider id list to override the default
   * priority order. Unknown ids are ignored. Example:
   *   "smtp2go,email-service,resend"
   */
  EMAIL_PROVIDER_ORDER?: string
}

/**
 * Normalised message handed to each provider's send(). Keeps providers
 * decoupled from the SendEmailInput discriminated union.
 */
export interface NormalisedMessage {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  replyTo?: string
}

export interface ProviderSendResult {
  /** Provider-specific message id, when available. Returned as-is. */
  messageId?: string
}

export interface EmailProviderImpl {
  /** Stable id used in logs + the priority list. */
  id: EmailProvider
  /** Returns true when the provider has the credentials/bindings it
   *  needs to actually send. The service skips providers that return
   *  false — they're not retry candidates either. */
  isAvailable(env: EmailEnv): boolean
  /** Send the message. May throw — the service's failover loop catches
   *  errors and falls through to the next provider. */
  send(env: EmailEnv, message: NormalisedMessage): Promise<ProviderSendResult>
}
