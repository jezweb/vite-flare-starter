/**
 * Email service — single entry point for outbound email across the app.
 *
 * Provider priority (first available wins):
 *   1. Cloudflare Email Service binding (env.EMAIL)       — transactional, any recipient
 *   2. Cloudflare Email Routing SendEmail (env.SEND_EMAIL) — verified destinations only
 *   3. Resend HTTP API (env.EMAIL_API_KEY + EMAIL_FROM)   — HTTP fallback, works anywhere
 *   4. Console log (dev fallback)                         — never blocks auth flows
 *
 * Every send is recorded in the email_log D1 table for debugging, rate
 * limiting, and the admin log viewer (Phase 3.5).
 *
 * Templates are selected by key; TypeScript enforces data shape match.
 */
import type { D1Database } from '@cloudflare/workers-types'
import { drizzle } from 'drizzle-orm/d1'
import { emailLog } from './db/schema'
import { templates, type TemplateKey, type TemplateDataMap, htmlToText } from './templates'

export type EmailProvider = 'email-service' | 'email-routing-send' | 'resend' | 'console'

/**
 * Minimal typing for the Cloudflare Email Service binding. We keep this
 * local so the module doesn't require types from a specific @cloudflare
 * namespace release — the runtime behaviour is what matters.
 */
interface CloudflareEmailServiceBinding {
  send: (message: {
    from: string
    to: string | string[]
    subject: string
    html?: string
    text?: string
    replyTo?: string
  }) => Promise<{ id?: string } | void>
}

interface SendEmailBinding {
  send: (message: unknown) => Promise<void>
}

export interface EmailEnv {
  DB: D1Database
  EMAIL?: CloudflareEmailServiceBinding
  SEND_EMAIL?: SendEmailBinding
  EMAIL_API_KEY?: string // Resend API key (legacy + HTTP fallback)
  EMAIL_FROM?: string
  APP_NAME?: string
  APP_URL?: string
  BETTER_AUTH_URL?: string
}

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
  input: SendEmailInput<K>,
): Promise<SendResult> {
  const from = input.from ?? env.EMAIL_FROM ?? 'onboarding@example.com'
  const recipients = Array.isArray(input.to) ? input.to : [input.to]

  // Resolve template → subject + html + text
  let subject = 'subject' in input ? input.subject ?? '' : ''
  let html = 'html' in input ? input.html ?? '' : ''
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

  // Provider selection
  const provider = pickProvider(env)
  let status: SendResult['status'] = 'failed'
  let messageId: string | undefined
  let error: string | undefined

  try {
    if (provider === 'email-service' && env.EMAIL) {
      const res = await env.EMAIL.send({
        from,
        to: recipients,
        subject,
        html,
        text,
        replyTo: input.replyTo,
      })
      messageId = (res as { id?: string } | undefined)?.id
      status = 'sent'
    } else if (provider === 'email-routing-send' && env.SEND_EMAIL) {
      // Email Routing's SendEmail binding needs a RFC 5322 mime message.
      // The `mimetext` package is a tiny mime builder — install it in your
      // fork (`pnpm add mimetext`) to enable this path. We dynamic-import
      // so apps without Email Routing don't need the dep.
      //
      const to = recipients[0]
      if (!to) throw new Error('Email Routing send requires at least one recipient')
      const mimetext = await import(/* @vite-ignore */ 'mimetext' as string).catch(() => null)
      const cfEmail = await import(/* @vite-ignore */ 'cloudflare:email' as string).catch(() => null)
      if (!mimetext || !cfEmail) {
        throw new Error(
          'Email Routing send requires `mimetext` (run `pnpm add mimetext`). Falling back.',
        )
      }
      const msg = (mimetext as { createMimeMessage: () => { setSender: (s: string) => void; setRecipient: (r: string) => void; setSubject: (s: string) => void; addMessage: (m: { contentType: string; data: string }) => void; asRaw: () => string } }).createMimeMessage()
      msg.setSender(from)
      msg.setRecipient(to)
      msg.setSubject(subject)
      msg.addMessage({ contentType: 'text/plain', data: text })
      msg.addMessage({ contentType: 'text/html', data: html })
      const EmailMessage = (cfEmail as { EmailMessage: new (from: string, to: string, raw: string) => unknown }).EmailMessage
      const message = new EmailMessage(from, to, msg.asRaw())
      await env.SEND_EMAIL.send(message)
      status = 'sent'
    } else if (provider === 'resend' && env.EMAIL_API_KEY) {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.EMAIL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: recipients,
          subject,
          html,
          text,
          ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        }),
      })
      if (!resp.ok) {
        const body = await resp.text()
        throw new Error(`Resend ${resp.status}: ${body.slice(0, 200)}`)
      }
      const json = (await resp.json()) as { id?: string }
      messageId = json.id
      status = 'sent'
    } else {
      // Console fallback for dev — don't block flows just because nothing's configured.
      console.log(
        JSON.stringify({
          event: 'email_console_fallback',
          to: recipients,
          from,
          subject,
          template: input.template,
          hint: 'No email provider configured. Set env.EMAIL (Email Service), env.SEND_EMAIL (Email Routing), or EMAIL_API_KEY (Resend).',
        }),
      )
      status = 'skipped'
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    status = 'failed'
    console.error(
      JSON.stringify({
        event: 'email_send_failed',
        provider,
        to: recipients[0],
        template: input.template,
        error,
      }),
    )
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

function pickProvider(env: EmailEnv): EmailProvider {
  if (env.EMAIL) return 'email-service'
  if (env.SEND_EMAIL) return 'email-routing-send'
  if (env.EMAIL_API_KEY) return 'resend'
  return 'console'
}

/**
 * Inject app-level defaults into template data so callers don't have to
 * pass appName / appUrl on every send. The wrapper lives here so missing
 * env falls back sensibly.
 */
function injectDefaults(env: EmailEnv, data: unknown): Record<string, unknown> {
  const appName = env.APP_NAME || 'Vite Flare Starter'
  const appUrl = env.APP_URL || env.BETTER_AUTH_URL || 'https://example.com'
  return { appName, appUrl, ...(data as Record<string, unknown>) }
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
  },
): Promise<SendResult> {
  const recipients = Array.isArray(args.input.to) ? args.input.to : [args.input.to]
  const logStatus = args.status === 'sent' ? 'sent' : args.status === 'skipped' ? 'queued' : 'failed'
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
      }),
    )
  }
  return {
    provider: args.provider,
    status: args.status,
    messageId: args.messageId,
    error: args.error,
  }
}
