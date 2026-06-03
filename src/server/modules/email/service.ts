/**
 * Email service — single entry point for outbound email across the app.
 *
 * Providers live in providers/ (one file each). The default priority
 * order is defined in providers/index.ts:
 *
 *   1. email-service        — Cloudflare Email Service binding
 *   2. smtp2go              — SMTP2Go HTTP API
 *   3. mailgun              — Mailgun HTTP API
 *   4. resend               — Resend HTTP API
 *   5. email-routing-send   — Cloudflare Email Routing legacy
 *   6. console              — dev fallback, always available
 *
 * Override the order at runtime via EMAIL_PROVIDER_ORDER (comma-
 * separated). Enable cascade-on-error via EMAIL_FAILOVER='true'.
 *
 * Every send is recorded in the email_log D1 table for debugging,
 * rate limiting, and the admin log viewer.
 */
import { drizzle } from 'drizzle-orm/d1'
import { emailLog } from './db/schema'
import { templates, type TemplateKey, type TemplateDataMap, htmlToText } from './templates'
import {
  resolveProviderList,
  type EmailEnv,
  type EmailProvider,
  type NormalisedMessage,
} from './providers'

export type { EmailEnv, EmailProvider } from './providers'

/**
 * Input shape for templated sends. When `template` is set, `subject`,
 * `html`, and `text` are derived — pass `templateData` instead.
 */
export type SendEmailInput<K extends TemplateKey | undefined = undefined> = {
  to: string | string[]
  from?: string
  replyTo?: string
  tags?: string[]
  /** Hint for rate limiting + log filtering */
  userId?: string
} & (
  | {
      template: K
      templateData: K extends TemplateKey ? TemplateDataMap[K] : never
      subject?: never
      html?: never
      text?: never
    }
  | {
      template?: never
      templateData?: never
      subject: string
      html: string
      text?: string
    }
)

export interface SendResult {
  provider: EmailProvider
  status: 'sent' | 'failed' | 'skipped'
  messageId?: string
  error?: string
}

/**
 * Send an email, logging the attempt regardless of outcome.
 *
 * Never throws — auth flows and agent tools should never break because
 * email delivery failed. Returns a result object the caller can inspect.
 */
export async function sendEmail<K extends TemplateKey | undefined = undefined>(
  env: EmailEnv,
  input: SendEmailInput<K>
): Promise<SendResult> {
  const fromAddress = input.from ?? env.EMAIL_FROM ?? 'onboarding@example.com'
  // RFC 5322 From with optional display name. EMAIL_FROM_NAME wins; APP_NAME
  // is the secondary fallback so a fork that sets only APP_NAME still gets a
  // branded From line. If the caller passed `input.from` already containing
  // a display name (`Display <addr>`), we don't double-wrap it.
  const fromName = env.EMAIL_FROM_NAME || env.APP_NAME
  const from = fromName && !fromAddress.includes('<') ? `${fromName} <${fromAddress}>` : fromAddress
  const recipients = Array.isArray(input.to) ? input.to : [input.to]

  // Resolve template → subject + html + text
  let subject = 'subject' in input ? (input.subject ?? '') : ''
  let html = 'html' in input ? (input.html ?? '') : ''
  let text = 'text' in input ? input.text : undefined

  if (input.template) {
    const tpl = templates[input.template]
    if (!tpl) {
      return finaliseLog(env, {
        input,
        from,
        provider: 'console',
        status: 'failed',
        error: `Unknown template: ${String(input.template)}`,
      })
    }
    const data = injectDefaults(env, input.templateData)
    // @ts-expect-error — template data is narrowed by the caller via discriminated union
    subject = tpl.subject(data)
    // @ts-expect-error — same narrowing
    html = tpl.html(data)
    // @ts-expect-error — same narrowing
    text = tpl.text(data)
  }

  if (!text) text = htmlToText(html)
  if (!subject || !html) {
    return finaliseLog(env, {
      input,
      from,
      provider: 'console',
      status: 'failed',
      error: 'Missing subject or html body',
    })
  }

  // ─── Provider dispatch with optional failover ────────────────────
  //
  // Build the active provider list (priority + filtered by availability)
  // then walk it in order. With EMAIL_FAILOVER='true', errors fall through
  // to the next provider; without it, the first available provider's
  // result is the final answer.
  const providers = resolveProviderList(env)
  const failoverEnabled = env.EMAIL_FAILOVER === 'true'
  const message: NormalisedMessage = {
    from,
    to: recipients,
    subject,
    html,
    text,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  }

  let provider: EmailProvider = 'console'
  let status: SendResult['status'] = 'failed'
  let messageId: string | undefined
  let error: string | undefined
  const attempted: Array<{ provider: EmailProvider; error?: string }> = []

  for (const p of providers) {
    provider = p.id
    try {
      const result = await p.send(env, message)
      messageId = result.messageId
      status = p.id === 'console' ? 'skipped' : 'sent'
      error = undefined
      break
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      attempted.push({ provider: p.id, error: errMsg })
      console.error(
        JSON.stringify({
          event: 'email_send_failed',
          provider: p.id,
          to: recipients[0],
          template: input.template,
          error: errMsg,
          willFailover: failoverEnabled,
        })
      )
      // Without failover, surface the failure immediately.
      if (!failoverEnabled) {
        error = errMsg
        status = 'failed'
        break
      }
      // With failover, capture the error + continue to the next provider.
      error = errMsg
    }
  }
  // If we walked the whole list with failover on and never hit a success,
  // record the cumulative attempt list so the log row is debuggable.
  if (failoverEnabled && status === 'failed' && attempted.length > 1) {
    error = `All providers failed: ${attempted.map((a) => `${a.provider}=${a.error?.slice(0, 60)}`).join('; ')}`
  }

  return finaliseLog(env, {
    input,
    from,
    provider,
    status,
    messageId,
    error,
  })
}

/**
 * Inject app-level defaults into template data so callers don't have to
 * pass appName / appUrl on every send. The wrapper lives here so missing
 * env falls back sensibly.
 */
function injectDefaults(env: EmailEnv, data: unknown): Record<string, unknown> {
  const appName = env.APP_NAME || 'Vite Flare Starter'
  const appUrl = env.APP_URL || env.BETTER_AUTH_URL || 'https://example.com'
  // Optional brand fields — templates that want them reference {{signature}}
  // or {{headerImageUrl}}. Templates that don't reference them are unchanged.
  const signature = env.EMAIL_SIGNATURE || ''
  const headerImageUrl = env.EMAIL_HEADER_IMAGE_URL || ''
  return {
    appName,
    appUrl,
    signature,
    headerImageUrl,
    ...(data as Record<string, unknown>),
  }
}

async function finaliseLog(
  env: EmailEnv,
  args: {
    input: { to: string | string[]; template?: string; tags?: string[]; userId?: string }
    from: string
    provider: EmailProvider
    status: SendResult['status']
    messageId?: string
    error?: string
  }
): Promise<SendResult> {
  const recipients = Array.isArray(args.input.to) ? args.input.to : [args.input.to]
  const logStatus =
    args.status === 'sent' ? 'sent' : args.status === 'skipped' ? 'queued' : 'failed'
  try {
    const db = drizzle(env.DB)
    await db.insert(emailLog).values({
      userId: args.input.userId ?? null,
      toAddress: recipients[0]!,
      fromAddress: args.from,
      subject: '', // filled in by direct-subject sends; templated sends intentionally redact
      template: args.input.template ?? null,
      provider: args.provider,
      status: logStatus,
      messageId: args.messageId ?? null,
      error: args.error ?? null,
      tags: args.input.tags ? JSON.stringify(args.input.tags) : null,
    })
  } catch (err) {
    // Log failure shouldn't break the send path. Observability catches it.
    console.error(
      JSON.stringify({
        event: 'email_log_insert_failed',
        error: err instanceof Error ? err.message : String(err),
      })
    )
  }
  return {
    provider: args.provider,
    status: args.status,
    messageId: args.messageId,
    error: args.error,
  }
}
