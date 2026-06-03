/**
 * Email admin routes — test sends + log viewer feed.
 *
 * All routes require admin role. Regular users can't see email history
 * because it spans all users and contains PII.
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { desc, eq, and, gte, lte } from 'drizzle-orm'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { adminMiddleware } from '@/server/middleware/admin'
import { emailLog } from './db/schema'
import { sendEmail, type EmailEnv } from './service'
import type { TemplateKey } from './templates'

const app = new Hono<AuthContext>()

// All email admin routes are admin-only.
app.use('*', authMiddleware)
app.use('*', adminMiddleware)

function envForService(c: { env: Record<string, unknown> }): EmailEnv {
  return {
    DB: c.env['DB'] as EmailEnv['DB'],
    EMAIL: c.env['EMAIL'] as EmailEnv['EMAIL'],
    SEND_EMAIL: c.env['SEND_EMAIL'] as EmailEnv['SEND_EMAIL'],
    EMAIL_API_KEY: c.env['EMAIL_API_KEY'] as string | undefined,
    EMAIL_FROM: c.env['EMAIL_FROM'] as string | undefined,
    APP_NAME: c.env['APP_NAME'] as string | undefined,
    APP_URL: c.env['APP_URL'] as string | undefined,
    BETTER_AUTH_URL: c.env['BETTER_AUTH_URL'] as string | undefined,
  }
}

/**
 * POST /api/email/test
 * Send a one-off test email. Useful for verifying provider setup
 * without touching the password-reset flow.
 */
const testSchema = z.object({
  to: z.string().email(),
  template: z
    .enum([
      'passwordReset',
      'magicLink',
      'invite',
      'welcome',
      'notification',
      'emailVerification',
      'emailChange',
      'deleteAccount',
    ])
    .optional(),
  subject: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
})

app.post('/test', zValidator('json', testSchema), async (c) => {
  const input = c.req.valid('json')
  const userId = c.get('userId')
  const env = envForService(c as unknown as { env: Record<string, unknown> })

  // Default demo payload per template so admins don't need to guess fields.
  const demoData: Record<string, unknown> = {
    passwordReset: {
      name: 'Test User',
      resetUrl: `${env.APP_URL || env.BETTER_AUTH_URL}/reset-password?token=demo`,
      appName: env.APP_NAME ?? 'App',
    },
    emailVerification: {
      name: 'Test User',
      verifyUrl: `${env.APP_URL || env.BETTER_AUTH_URL}/verify-email?token=demo`,
      appName: env.APP_NAME ?? 'App',
    },
    magicLink: {
      name: 'Test User',
      signInUrl: `${env.APP_URL || env.BETTER_AUTH_URL}/sign-in/callback?token=demo`,
      appName: env.APP_NAME ?? 'App',
    },
    welcome: {
      name: 'Test User',
      appName: env.APP_NAME ?? 'App',
      appUrl: env.APP_URL ?? env.BETTER_AUTH_URL ?? '',
    },
    invite: {
      name: 'Test User',
      inviterName: 'Admin',
      inviterEmail: 'admin@example.com',
      organizationName: env.APP_NAME ?? 'Workspace',
      signUpUrl: `${env.APP_URL || env.BETTER_AUTH_URL}/sign-up?invite=demo`,
      appName: env.APP_NAME ?? 'App',
    },
    notification: {
      name: 'Test User',
      title: 'Test notification',
      message: 'This is a test email from the admin test endpoint.',
      inAppUrl: env.APP_URL,
      appName: env.APP_NAME ?? 'App',
    },
    emailChange: {
      name: 'Test User',
      newEmail: input.to,
      confirmUrl: `${env.APP_URL || env.BETTER_AUTH_URL}/verify-email-change?token=demo`,
      appName: env.APP_NAME ?? 'App',
    },
    deleteAccount: {
      name: 'Test User',
      confirmUrl: `${env.APP_URL || env.BETTER_AUTH_URL}/delete-account?token=demo`,
      appName: env.APP_NAME ?? 'App',
    },
  }

  if (input.template) {
    const data = demoData[input.template]
    const result = await sendEmail(env, {
      to: input.to,
      userId,
      template: input.template as TemplateKey,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      templateData: data as any,
      tags: ['admin-test'],
    })
    return c.json(result)
  }

  if (!input.subject || !input.body) {
    return c.json({ error: 'Either `template` or both `subject` + `body` are required' }, 400)
  }

  const result = await sendEmail(env, {
    to: input.to,
    userId,
    subject: input.subject,
    html: `<p>${input.body.replace(/\n/g, '<br>')}</p>`,
    text: input.body,
    tags: ['admin-test', 'manual'],
  })
  return c.json(result)
})

/**
 * GET /api/email/logs
 * Paginated list for the admin log viewer. Filters: template, status, to.
 */
const logsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  template: z.string().max(50).optional(),
  status: z.enum(['sent', 'queued', 'failed']).optional(),
  to: z.string().max(200).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
})

app.get('/logs', zValidator('query', logsQuerySchema), async (c) => {
  const q = c.req.valid('query')
  const db = drizzle(c.env.DB)
  const filters = [
    q.template ? eq(emailLog.template, q.template) : undefined,
    q.status ? eq(emailLog.status, q.status) : undefined,
    q.to ? eq(emailLog.toAddress, q.to) : undefined,
    q.since ? gte(emailLog.sentAt, new Date(q.since)) : undefined,
    q.until ? lte(emailLog.sentAt, new Date(q.until)) : undefined,
  ].filter(Boolean)

  const whereExpr = filters.length > 0 ? and(...(filters as [(typeof filters)[0]])) : undefined

  const rows = await db
    .select()
    .from(emailLog)
    .where(whereExpr)
    .orderBy(desc(emailLog.sentAt))
    .limit(q.limit)
    .offset(q.offset)

  return c.json({
    rows: rows.map((r) => ({
      ...r,
      tags: r.tags ? safeJsonArray(r.tags) : [],
    })),
    pagination: { limit: q.limit, offset: q.offset, count: rows.length },
  })
})

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export default app
