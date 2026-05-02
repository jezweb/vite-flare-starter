/**
 * Inbox items — agent-emitted findings the user reviews on /dashboard/inbox.
 *
 * Sister table to `pending_approvals`: where approvals say "I want to do
 * X, please bless it before I act", inbox_items say "I noticed X, you
 * might want to know / review / decide". The Inbox UI joins both tables
 * (slice 5 decision A: fold approvals into the unified Inbox surface).
 *
 * Fields the agent populates:
 *   - kind          — domain tag ("lead", "youtube_summary", "stuck_ticket", "routine_error")
 *   - summary       — 1-line headline shown in the Inbox row
 *   - payloadJson   — free-form structured data (whatever the agent emits)
 *   - importance    — high|medium|low; routes UI sorting + filter pills
 *   - confidence    — 0..1; how sure was the agent
 *   - reasoning     — short explanation; shown in the expanded view
 *   - suggestedActionJson — { label, link } the user can click
 *   - sourcesJson   — [{ kind, ref, label }] provenance the agent cites
 *   - dueAt         — when the user should act on this; sorts urgent items first
 *   - expiresAt     — auto-archive after this; null = manual
 *   - effortMinutes — rough cost-to-action estimate
 *   - tagsJson      — free-form labels for client-side filtering
 *   - relatedItemIdsJson — pointers to other inbox rows / approvals / runs
 *   - threadSpaceId — optional Space link for cross-team discussion
 *
 * State columns:
 *   - readAt        — first time the user opened this row
 *   - decidedAt     — when the user clicked decide
 *   - decisionText  — short note about the decision
 */
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'
import type { InboxImportance } from '@/shared/schemas/inbox.schema'

export type { InboxImportance }

export const inboxItems = sqliteTable(
  'inbox_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    /** FK to the routine_run that produced this item, when applicable.
     *  Standalone inbox items (e.g. ad-hoc agent ping) leave this null. */
    routineRunId: text('routine_run_id'),
    /** Source agent class — for grouping in the Inbox UI. */
    agentClass: text('agent_class'),

    kind: text('kind').notNull(),
    summary: text('summary').notNull(),
    payloadJson: text('payload_json'),

    importance: text('importance').$type<InboxImportance>(),
    confidence: real('confidence'),
    reasoning: text('reasoning'),
    suggestedActionJson: text('suggested_action_json'),
    sourcesJson: text('sources_json'),

    dueAt: integer('due_at'),
    expiresAt: integer('expires_at'),
    effortMinutes: integer('effort_minutes'),

    tagsJson: text('tags_json'),
    relatedItemIdsJson: text('related_item_ids_json'),

    /** Optional Space (conversation) the user can open to discuss. */
    threadSpaceId: text('thread_space_id'),

    readAt: integer('read_at'),
    decidedAt: integer('decided_at'),
    decisionText: text('decision_text'),

    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
  },
  (table) => [
    index('inbox_items_user_id_idx').on(table.userId),
    index('inbox_items_user_kind_idx').on(table.userId, table.kind),
    index('inbox_items_user_unread_idx').on(table.userId, table.readAt),
    index('inbox_items_user_undecided_idx').on(table.userId, table.decidedAt),
    index('inbox_items_due_at_idx').on(table.dueAt),
    index('inbox_items_routine_run_idx').on(table.routineRunId),
  ],
)
