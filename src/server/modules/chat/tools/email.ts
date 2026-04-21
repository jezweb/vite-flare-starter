/**
 * send_email agent tool
 *
 * Lets the AI compose and send outbound email on behalf of the user.
 * Guarded by `needsApproval: true` so the AI SDK surfaces a confirmation
 * prompt in the chat before the send actually fires. This pairs with
 * the front-end ToolApproval UI.
 *
 * Rate limits: 10 sends/day per user by default (tweak RATE_LIMIT_PER_DAY).
 * The limit is enforced by counting email_log rows for the user in the
 * last 24 hours before calling sendEmail.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { and, eq, gte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { sendEmail, type EmailEnv } from '@/server/modules/email/service'
import { emailLog } from '@/server/modules/email/db/schema'

const RATE_LIMIT_PER_DAY = 10

interface BuildCtx {
  env: {
    DB: EmailEnv['DB']
    EMAIL?: EmailEnv['EMAIL']
    SEND_EMAIL?: EmailEnv['SEND_EMAIL']
    EMAIL_API_KEY?: string
    EMAIL_FROM?: string
    APP_NAME?: string
    APP_URL?: string
    BETTER_AUTH_URL?: string
  }
  userId: string
  userEmail?: string
  userName?: string
}

export function buildEmailTools(ctx: BuildCtx) {
  // Surface the tool only when at least one provider path is wired. If
  // nothing's configured the tool would just return "not configured" and
  // waste a tool-selection round, so we omit it entirely.
  const hasProvider = !!(ctx.env.EMAIL || ctx.env.SEND_EMAIL || ctx.env.EMAIL_API_KEY)
  if (!hasProvider) return {}

  const mailEnv: EmailEnv = {
    DB: ctx.env.DB,
    EMAIL: ctx.env.EMAIL,
    SEND_EMAIL: ctx.env.SEND_EMAIL,
    EMAIL_API_KEY: ctx.env.EMAIL_API_KEY,
    EMAIL_FROM: ctx.env.EMAIL_FROM,
    APP_NAME: ctx.env.APP_NAME,
    APP_URL: ctx.env.APP_URL,
    BETTER_AUTH_URL: ctx.env.BETTER_AUTH_URL,
  }

  return {
    send_email: tool({
      description:
        "Send an email on the user's behalf. Use for follow-ups, summaries, invites, or sharing conversation output. The user will be asked to approve each send explicitly — draft the email carefully. Reply-To defaults to the user's own address so recipients can reply naturally.",
      // needsApproval is honoured by createAgentUIStreamResponse +
      // ToolApproval on the client — the send only fires after the user
      // clicks Approve.
      needsApproval: true,
      inputSchema: z.object({
        to: z.string().email().describe("Recipient email address (single recipient)."),
        subject: z.string().min(1).max(200).describe('Email subject line.'),
        body: z
          .string()
          .min(1)
          .max(10000)
          .describe("Plain-text body of the email. Markdown-style line breaks are respected. HTML will be derived by wrapping paragraphs."),
      }),
      execute: async ({ to, subject, body }) => {
        // Rate limit: count the user's sends in the last 24 hours.
        try {
          const db = drizzle(ctx.env.DB)
          const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
          const recent = await db
            .select({ id: emailLog.id })
            .from(emailLog)
            .where(
              and(
                eq(emailLog.userId, ctx.userId),
                eq(emailLog.status, 'sent'),
                gte(emailLog.sentAt, dayAgo),
              ),
            )
            .limit(RATE_LIMIT_PER_DAY + 1)
          if (recent.length >= RATE_LIMIT_PER_DAY) {
            return {
              ok: false,
              error: `Rate limit reached: ${RATE_LIMIT_PER_DAY} emails per 24 hours. Try again tomorrow.`,
            }
          }
        } catch {
          // Rate-limit query is advisory — if the log read fails we still
          // let the send proceed (the send itself logs too).
        }

        const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#111">${
          body
            .split(/\n{2,}/)
            .map((p) => `<p style="margin:0 0 16px 0">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
            .join('')
        }</div>`

        const result = await sendEmail(mailEnv, {
          to,
          userId: ctx.userId,
          replyTo: ctx.userEmail,
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
    }),
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
