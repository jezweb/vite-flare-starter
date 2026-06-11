/**
 * Walkabout — the ask-the-app Guide's question log.
 *
 * Every question a user asks the in-app Guide is recorded here with the answer
 * given, the page it was asked from, latency, and any error. The log IS the
 * product insight: what users ask is the roadmap and the next tour script.
 *
 * userId-scoped (the starter's default tenancy). The Guide answers strictly
 * from the hand-written app guide (knowledge.ts) — never from imagination — so
 * a wrong answer here is a gap in that file, traceable from this log.
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const walkaboutQuestions = sqliteTable(
  'walkabout_questions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    answer: text('answer'),
    pagePath: text('page_path'),
    modelUsed: text('model_used'),
    latencyMs: integer('latency_ms'),
    errorMessage: text('error_message'),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [index('idx_walkabout_questions_user_created').on(t.userId, t.createdAt)]
)

export type WalkaboutQuestion = typeof walkaboutQuestions.$inferSelect
