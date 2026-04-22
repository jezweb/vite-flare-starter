/**
 * send_email agent tool — compose and send email on behalf of the user.
 *
 * Guarded with `needsApproval: true`. Rate limited to RATE_LIMIT_PER_DAY
 * sends / 24h per user. Hidden from the toolkit unless at least one
 * provider path is configured (EMAIL binding, SEND_EMAIL, or EMAIL_API_KEY).
 */
import { z } from 'zod'
import { and, eq, gte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { Mail } from 'lucide-react'
import { sendEmail, type EmailEnv } from '@/server/modules/email/service'
import { emailLog } from '@/server/modules/email/db/schema'
import type { ToolDefinition, AgentContext } from '@/shared/agent'

const RATE_LIMIT_PER_DAY = 10

type EmailBindings = {
  DB: EmailEnv['DB']
  EMAIL?: EmailEnv['EMAIL']
  SEND_EMAIL?: EmailEnv['SEND_EMAIL']
  EMAIL_API_KEY?: string
  EMAIL_FROM?: string
  APP_NAME?: string
  APP_URL?: string
  BETTER_AUTH_URL?: string
}

function getEmailEnv(ctx: AgentContext): EmailBindings {
  return ctx.env as unknown as EmailBindings
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const SendEmailOutput = z.union([
  z.object({
    ok: z.literal(true),
    provider: z.string(),
    messageId: z.string().optional(),
    message: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    provider: z.string().optional(),
    status: z.string().optional(),
    error: z.string(),
  }),
])

export const sendEmailDefinition: ToolDefinition<
  { to: string; subject: string; body: string },
  z.infer<typeof SendEmailOutput>
> = {
  name: 'send_email',
  description:
    "Send an email on the user's behalf. Use for follow-ups, summaries, invites, or sharing conversation output. The user will be asked to approve each send explicitly — draft the email carefully. Reply-To defaults to the user's own address so recipients can reply naturally.",
  inputSchema: z.object({
    to: z.string().email().describe('Recipient email address (single recipient).'),
    subject: z.string().min(1).max(200).describe('Email subject line.'),
    body: z
      .string()
      .min(1)
      .max(10000)
      .describe(
        'Plain-text body of the email. Markdown-style line breaks are respected. HTML will be derived by wrapping paragraphs.',
      ),
  }),
  outputSchema: SendEmailOutput,
  needsApproval: true,
  isAvailable: (ctx) => {
    const env = getEmailEnv(ctx)
    return !!(env.EMAIL || env.SEND_EMAIL || env.EMAIL_API_KEY)
  },
  execute: async ({ to, subject, body }, ctx) => {
    const env = getEmailEnv(ctx)
    const mailEnv: EmailEnv = {
      DB: env.DB,
      EMAIL: env.EMAIL,
      SEND_EMAIL: env.SEND_EMAIL,
      EMAIL_API_KEY: env.EMAIL_API_KEY,
      EMAIL_FROM: env.EMAIL_FROM,
      APP_NAME: env.APP_NAME,
      APP_URL: env.APP_URL,
      BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    }

    try {
      const db = drizzle(env.DB)
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const recent = await db
        .select({ id: emailLog.id })
        .from(emailLog)
        .where(
          and(eq(emailLog.userId, ctx.userId), eq(emailLog.status, 'sent'), gte(emailLog.sentAt, dayAgo)),
        )
        .limit(RATE_LIMIT_PER_DAY + 1)
      if (recent.length >= RATE_LIMIT_PER_DAY) {
        return {
          ok: false,
          error: `Rate limit reached: ${RATE_LIMIT_PER_DAY} emails per 24 hours. Try again tomorrow.`,
        }
      }
    } catch {
      // Advisory — send proceeds if the log read fails.
    }

    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#111">${body
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 16px 0">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('')}</div>`

    const result = await sendEmail(mailEnv, {
      to,
      userId: ctx.userId,
      replyTo: ctx.user.email,
      subject,
      html,
      text: body,
      tags: [`user:${ctx.userId}`, 'agent-send'],
    })

    if (result.status === 'sent') {
      return {
        ok: true,
        provider: result.provider,
        messageId: result.messageId,
        message: `Email sent to ${to}.`,
      }
    }
    return {
      ok: false,
      provider: result.provider,
      status: result.status,
      error: result.error ?? 'Email send failed.',
    }
  },
  render: { icon: Mail, displayName: 'Send Email' },
}

export const emailDefinitions = [sendEmailDefinition] as ToolDefinition<unknown, unknown>[]
