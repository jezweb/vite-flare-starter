/**
 * Email log schema — records every outbound email attempt.
 *
 * Powers:
 *  - Admin → Email logs view (filter by template, status, user, tag)
 *  - Rate limiting ("this user has had 5 password-resets in the last hour")
 *  - User activity feed entry per send
 *  - Debugging delivery issues across providers
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const emailLog = sqliteTable(
  'email_log',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    toAddress: text('to_address').notNull(),
    fromAddress: text('from_address').notNull(),
    subject: text('subject').notNull(),
    template: text('template'),
    // 'email-service' | 'email-routing-send' | 'resend' | 'console'
    provider: text('provider').notNull(),
    // 'queued' | 'sent' | 'failed'
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
  ],
)

export type EmailLog = typeof emailLog.$inferSelect
export type NewEmailLog = typeof emailLog.$inferInsert
