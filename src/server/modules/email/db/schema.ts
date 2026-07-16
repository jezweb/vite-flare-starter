/**
 * Email log schema — records every outbound email attempt.
 *
 * Powers:
 *  - Admin → Email logs view (filter by template, status, user, tag)
 *  - Rate limiting ("this user has had 5 password-resets in the last hour")
 *  - User activity feed entry per send
 *  - Debugging delivery issues across providers
 */
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const emailLog = sqliteTable(
  'email_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    toAddress: text('to_address').notNull(),
    fromAddress: text('from_address').notNull(),
    subject: text('subject').notNull(),
    template: text('template'),
    // 'email-service' | 'email-routing-send' | 'resend' | 'console'
    provider: text('provider').notNull(),
    // 'queued' | 'sent' | 'failed' | 'suppressed'
    status: text('status').notNull(),
    messageId: text('message_id'),
    error: text('error'),
    // JSON array of tag strings
    tags: text('tags'),
    sentAt: integer('sent_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('email_log_user_idx').on(table.userId, table.sentAt),
    index('email_log_status_idx').on(table.status, table.sentAt),
    index('email_log_template_idx').on(table.template, table.sentAt),
  ]
)

export type EmailLog = typeof emailLog.$inferSelect
export type NewEmailLog = typeof emailLog.$inferInsert

/**
 * Delivery lifecycle events — one row per Email Sending event received
 * via the Queues event subscription (see ../delivery-events.ts).
 *
 * Events arrive only for the Cloudflare Email Service provider
 * (`env.EMAIL`) — the other five providers have their own webhook
 * systems and don't feed this table.
 */
export const emailEvents = sqliteTable(
  'email_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Cloudflare's `payload.eventId` — the idempotency key. Queues
     *  delivers at-least-once, so replays hit the unique index and are
     *  dropped by the consumer's onConflictDoNothing. */
    eventId: text('event_id').notNull(),
    /** Provider message id — matches `email_log.message_id` for sends
     *  made through the email-service provider. */
    messageId: text('message_id').notNull(),
    recipient: text('recipient').notNull(),
    // 'delivered' | 'deferred' | 'bounced' | 'failed' | 'rejected' | 'complained'
    eventType: text('event_type').notNull(),
    /** True when the message reached a final state (no more retries). */
    terminal: integer('terminal', { mode: 'boolean' }).notNull().default(false),
    /** e.g. '250', '550'. Absent for internal failures/rejections. */
    smtpStatusCode: text('smtp_status_code'),
    /** Full SMTP response line, e.g. '550 5.1.1 User unknown'. */
    smtpResponse: text('smtp_response'),
    // 'soft' | 'hard' — only set on deferred/bounced events
    bounceType: text('bounce_type'),
    bounceClassification: text('bounce_classification'),
    /** Sending domain the subscription is scoped to (source.domain). */
    domain: text('domain'),
    /** Full envelope JSON, for fields the columns don't capture. */
    rawPayload: text('raw_payload').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('email_events_event_id_idx').on(table.eventId),
    index('email_events_recipient_idx').on(table.recipient, table.createdAt),
    index('email_events_type_idx').on(table.eventType, table.createdAt),
    index('email_events_message_idx').on(table.messageId),
  ]
)

export type EmailEvent = typeof emailEvents.$inferSelect
export type NewEmailEvent = typeof emailEvents.$inferInsert

/**
 * Suppression list — recipients we must not send to again.
 *
 * Populated automatically by the delivery-events consumer on bounced /
 * complained events; rows with reason 'manual' come from the admin API.
 * App-global (not user-scoped) — deliverability reputation is a
 * property of the sending domain, not of any one user.
 *
 * Enforced in sendEmail() only when EMAIL_SUPPRESSION_ENFORCE='true'.
 */
export const emailSuppressions = sqliteTable(
  'email_suppressions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Normalised (lowercased) recipient address. */
    email: text('email').notNull(),
    // 'bounce' | 'complaint' | 'manual'
    reason: text('reason').notNull(),
    /** email_events.id of the event that triggered the suppression.
     *  Null for manual entries. */
    sourceEventId: text('source_event_id'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('email_suppressions_email_idx').on(table.email)]
)

export type EmailSuppression = typeof emailSuppressions.$inferSelect
export type NewEmailSuppression = typeof emailSuppressions.$inferInsert
