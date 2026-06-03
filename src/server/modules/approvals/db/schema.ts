/**
 * pending_approvals — human-in-the-loop queue for autonomous agents
 *
 * When an autonomous agent wants to perform a destructive action
 * (send email, post message, create calendar event, transfer funds)
 * it stores the request here as `status='pending'`. A user reviews
 * via `/approvals` and approves / rejects / edits / sends.
 *
 * On approve, the system invokes the agent's `executeApproved(action,
 * payload)` method to perform the action with full env access. On
 * reject, the row is just marked done.
 *
 * Why this pattern (vs the chat module's `needsApproval` tool gating):
 *   - Autonomous agents run without a live UI session — there's
 *     nobody to ask in real time
 *   - Async approval is the right shape for human review (review
 *     when convenient, not while the agent is blocked)
 *   - One queue across all agents — single review surface, one
 *     mental model for the user
 */
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'

export const pendingApprovals = sqliteTable(
  'pending_approvals',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** DO class name — used to route the approve callback back to the right binding. */
    agentClass: text('agent_class').notNull(),
    /** Agent's idFromName partition (usually `${userId}:${slug}`). */
    agentName: text('agent_name').notNull(),
    /** Free-form action identifier the agent's executeApproved switches on. */
    action: text('action').notNull(),
    /** One-line human-readable summary the queue UI shows. Optional. */
    summary: text('summary'),
    /** Action-specific payload as JSON. The agent knows the schema per action. */
    payloadJson: text('payload_json').notNull(),
    status: text('status').$type<ApprovalStatus>().notNull().default('pending'),
    /** Optional user note on approval/rejection (e.g. "rejected — typo in subject"). */
    note: text('note'),
    /** Edited payload from the review UI (NULL = unchanged from payloadJson). */
    payloadOverrideJson: text('payload_override_json'),
    /** Result returned by executeApproved (JSON). */
    resultJson: text('result_json'),
    /** If executeApproved threw, the error message. */
    errorMessage: text('error_message'),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Math.floor(Date.now() / 1000)),
    /** When status moved off 'pending' (regardless of approve/reject). */
    resolvedAt: integer('resolved_at'),
    /** When executeApproved finished (only set for status='executed'/'failed'). */
    executedAt: integer('executed_at'),
    /**
     * Spaces (Phase 1): the conversation this approval belongs to when
     * the action was triggered from a Space. Nullable — personal
     * approvals don't set this. Used to scope the approvals UI ("show
     * me only the queue for #marketing") and to deep-link from the
     * approval row back to the source space.
     */
    spaceId: text('space_id'),
    /**
     * Spaces (Phase 1): the actor user who triggered this approval —
     * distinct from `userId` (the agent owner). In a Space, the agent
     * is owned by the space creator but acts on behalf of whoever
     * @-mentioned it. The approve / reject row carries both so we can
     * audit fairly.
     */
    requestedByUserId: text('requested_by_user_id'),
  },
  (table) => [
    index('pending_approvals_user_id_idx').on(table.userId),
    index('pending_approvals_status_idx').on(table.status),
    index('pending_approvals_user_status_idx').on(table.userId, table.status),
    index('pending_approvals_agent_idx').on(table.agentClass, table.agentName),
    index('pending_approvals_created_at_idx').on(table.createdAt),
    index('pending_approvals_space_idx').on(table.spaceId),
  ]
)
