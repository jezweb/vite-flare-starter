/**
 * Channels — internal MCP-equivalent tools for routine output dispatch.
 *
 * "Channels-as-tools" (issue #50): every output destination an agent
 * might want to dispatch a finding to is just a regular ToolDefinition
 * the agent can call. No special primitive, no rules engine, no fat
 * meta schema — the agent reads its skill, decides where to send the
 * finding, and calls the right tool with whatever fields make sense.
 *
 * These four tools (and the deferred `inbox.add`) are the entire
 * dispatch surface for Routines. Routines opt in via `toolsAllowed`
 * on the agent state — see AutonomousAgent.buildToolset.
 *
 * Notes:
 *
 * - `inbox_add` is intentionally deferred until the inbox_items table
 *   ships (slice 5). Until then the chat agent has nowhere structured
 *   to land findings; routines will queue an approval or notify by
 *   default.
 *
 * - `approval_queue` is a thin wrapper over the same flow that
 *   AutonomousAgent.requestApproval already uses. Available to chat
 *   agents too, so a normal chat conversation can stage an action for
 *   later review without subclassing.
 *
 * - `notify` writes a row into `user_notifications` so the bell badge
 *   picks it up. Best-effort — failures don't bubble.
 *
 * - `space_send` posts a text message into a space the user is a
 *   member of. The space's SpaceAgent DO broadcasts to connected
 *   clients automatically.
 *
 * - `webhook_post` POSTs a JSON body to an arbitrary URL. Approval-
 *   gated by default because firing a webhook can be destructive
 *   (creates issues, sends emails, triggers integrations).
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { CheckSquare, Bell, Send, Webhook, Inbox } from 'lucide-react'
import type { ToolDefinition, AgentContext } from '@/shared/agent'
import { pendingApprovals } from '@/server/modules/approvals/db/schema'
import { userNotifications } from '@/server/modules/notifications/db/schema'
import { conversationMembers } from '@/server/modules/spaces/db/schema'
import { conversationMessages } from '@/server/modules/conversations/db/schema'
import { inboxItems } from '@/server/modules/inbox/db/schema'

interface ChannelsEnv {
  DB: D1Database
  SpaceAgent?: {
    idFromName(name: string): unknown
    get(id: unknown): unknown
  }
}

function envOf(ctx: AgentContext): ChannelsEnv {
  return ctx.env as unknown as ChannelsEnv
}

// ─── inbox_add ─────────────────────────────────────────────────────────

const InboxAddInput = z.object({
  kind: z
    .string()
    .min(1)
    .describe(
      'Domain tag for grouping (e.g. "lead", "youtube_summary", "stuck_ticket"). snake_case.'
    ),
  summary: z.string().min(1).describe('1-line headline shown in the Inbox row.'),
  payload: z
    .unknown()
    .optional()
    .describe('Free-form structured data (any JSON-serialisable value).'),
  importance: z.enum(['high', 'medium', 'low']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasoning: z.string().max(2000).optional().describe('Brief why-this-matters note.'),
  suggestedAction: z
    .object({ label: z.string(), link: z.string() })
    .optional()
    .describe('Optional one-click action; the user opens link from the row.'),
  sources: z
    .array(
      z.object({
        kind: z.string(),
        ref: z.string(),
        label: z.string().optional(),
      })
    )
    .optional()
    .describe('Provenance — what the agent cited.'),
  dueAt: z.number().int().optional().describe('Unix seconds — when the user should act on this.'),
  expiresAt: z.number().int().optional().describe('Unix seconds — auto-archive after this.'),
  effortMinutes: z.number().int().min(1).optional(),
  tags: z.array(z.string()).optional(),
  threadSpaceId: z.string().optional().describe('Optional Space link for cross-team discussion.'),
})

const InboxAddOutput = z.object({ id: z.string() })

export const inboxAdd: ToolDefinition<
  z.infer<typeof InboxAddInput>,
  z.infer<typeof InboxAddOutput>
> = {
  name: 'inbox_add',
  description:
    "Drop a finding into the user's Inbox. Use this to surface things the user might want to know / review / decide that don't require immediate action — leads worth following up, summaries, errors detected by a meta-routine, ideas, anomalies. Different from approval_queue (which gates a specific destructive action) and notify (which is a transient bell ping).",
  inputSchema: InboxAddInput,
  outputSchema: InboxAddOutput,
  execute: async (input, ctx) => {
    const env = envOf(ctx)
    const id = crypto.randomUUID()
    await drizzle(env.DB)
      .insert(inboxItems)
      .values({
        id,
        userId: ctx.userId,
        kind: input.kind,
        summary: input.summary,
        payloadJson: input.payload !== undefined ? JSON.stringify(input.payload) : null,
        importance: input.importance ?? null,
        confidence: input.confidence ?? null,
        reasoning: input.reasoning ?? null,
        suggestedActionJson: input.suggestedAction ? JSON.stringify(input.suggestedAction) : null,
        sourcesJson: input.sources ? JSON.stringify(input.sources) : null,
        dueAt: input.dueAt ?? null,
        expiresAt: input.expiresAt ?? null,
        effortMinutes: input.effortMinutes ?? null,
        tagsJson: input.tags ? JSON.stringify(input.tags) : null,
        threadSpaceId: input.threadSpaceId ?? null,
      })
    return { id }
  },
  render: {
    icon: Inbox,
    displayName: 'Add to Inbox',
    // The agent passes the human-readable summary as input; show that
    // as the tool-call summary instead of an opaque UUID prefix. The
    // ID is irrelevant once the row exists — what the user wants to
    // know is "what got dropped in".
    summary: (_out, input) => {
      const i = input as z.infer<typeof InboxAddInput> | undefined
      return i?.summary ? truncateInline(i.summary, 80) : null
    },
  },
}

function truncateInline(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
}

// ─── approval_queue ────────────────────────────────────────────────────

const ApprovalQueueInput = z.object({
  action: z
    .string()
    .min(1)
    .describe('Short snake_case identifier for the action (e.g. "send_email").'),
  summary: z.string().min(1).describe('One-line description of what will happen if approved.'),
  payload: z.unknown().describe('Free-form JSON payload — the executor reads this when approved.'),
})

const ApprovalQueueOutput = z.object({
  approvalId: z.string(),
  status: z.literal('pending'),
})

export const approvalQueue: ToolDefinition<
  z.infer<typeof ApprovalQueueInput>,
  z.infer<typeof ApprovalQueueOutput>
> = {
  name: 'approval_queue',
  description:
    'Queue an action for human review. Use this when proposing a destructive or external-effect action (sending an email, posting publicly, modifying shared data). The user reviews and approves on /dashboard/approvals.',
  inputSchema: ApprovalQueueInput,
  outputSchema: ApprovalQueueOutput,
  needsApproval: false, // queueing IS the approval gate
  execute: async (input, ctx) => {
    const env = envOf(ctx)
    const id = crypto.randomUUID()
    await drizzle(env.DB)
      .insert(pendingApprovals)
      .values({
        id,
        userId: ctx.userId,
        agentClass: 'chat',
        agentName: 'chat',
        action: input.action,
        payloadJson: JSON.stringify(input.payload ?? {}),
        summary: input.summary,
        status: 'pending',
      })
    // Best-effort bell notification
    try {
      await drizzle(env.DB)
        .insert(userNotifications)
        .values({
          userId: ctx.userId,
          type: 'info',
          title: 'Approval needed',
          message: input.summary,
          data: JSON.stringify({ link: `/dashboard/approvals?focus=${id}`, approvalId: id }),
        })
    } catch {
      // ignore — approval row is the source of truth
    }
    return { approvalId: id, status: 'pending' as const }
  },
  render: {
    icon: CheckSquare,
    displayName: 'Queue approval',
    summary: (out) => `queued (${out.approvalId.slice(0, 8)}…)`,
  },
}

// ─── notify ────────────────────────────────────────────────────────────

const NotifyInput = z.object({
  title: z.string().min(1).describe('Short headline shown in the bell dropdown.'),
  message: z.string().min(1).describe('One- or two-line body.'),
  link: z
    .string()
    .optional()
    .describe('Optional in-app link the user clicks to view context (e.g. "/dashboard/chat/abc").'),
  type: z
    .enum(['info', 'success', 'warning', 'error'])
    .optional()
    .default('info')
    .describe('Visual category; defaults to info.'),
})

const NotifyOutput = z.object({ delivered: z.boolean() })

export const notify: ToolDefinition<z.infer<typeof NotifyInput>, z.infer<typeof NotifyOutput>> = {
  name: 'notify',
  description:
    'Send a non-blocking in-app notification to the user (bell icon). Use for informational pings — not for actions that need approval.',
  inputSchema: NotifyInput,
  outputSchema: NotifyOutput,
  execute: async (input, ctx) => {
    const env = envOf(ctx)
    try {
      await drizzle(env.DB)
        .insert(userNotifications)
        .values({
          userId: ctx.userId,
          type: input.type ?? 'info',
          title: input.title,
          message: input.message,
          data: input.link ? JSON.stringify({ link: input.link }) : null,
        })
      return { delivered: true }
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'notify_tool_failed',
          error: err instanceof Error ? err.message : String(err),
        })
      )
      return { delivered: false }
    }
  },
  render: {
    icon: Bell,
    displayName: 'Notify',
    summary: (out) => (out.delivered ? 'sent' : 'failed'),
  },
}

// ─── space_send ────────────────────────────────────────────────────────

const SpaceSendInput = z.object({
  spaceId: z.string().min(1).describe('The space (conversation) id to post into.'),
  text: z.string().min(1).describe('Plain text to post. Markdown rendered by the client.'),
})

const SpaceSendOutput = z.object({
  messageId: z.string(),
})

export const spaceSend: ToolDefinition<
  z.infer<typeof SpaceSendInput>,
  z.infer<typeof SpaceSendOutput>
> = {
  name: 'space_send',
  description:
    'Post a message into a space the user is a member of. Use to share findings or status updates with the team.',
  inputSchema: SpaceSendInput,
  outputSchema: SpaceSendOutput,
  isAvailable: () => true,
  needsApproval: true,
  execute: async (input, ctx) => {
    const env = envOf(ctx)
    // Membership check — agent acts on behalf of its owner; the owner
    // must be a member of the target space.
    const [member] = await drizzle(env.DB)
      .select({ id: conversationMembers.id })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, input.spaceId),
          eq(conversationMembers.kind, 'user'),
          eq(conversationMembers.userId, ctx.userId)
        )
      )
      .limit(1)
    if (!member) {
      throw new Error(`Not a member of space ${input.spaceId}`)
    }
    const messageId = crypto.randomUUID()
    await drizzle(env.DB)
      .insert(conversationMessages)
      .values({
        id: messageId,
        conversationId: input.spaceId,
        role: 'user',
        parts: JSON.stringify([{ type: 'text', text: input.text }]),
        metadata: JSON.stringify({ senderKind: 'user', senderUserId: ctx.userId }),
      })
    // Broadcast to connected clients (best-effort).
    if (env.SpaceAgent) {
      try {
        const stub = env.SpaceAgent.get(env.SpaceAgent.idFromName(input.spaceId)) as {
          broadcastNewMessage: (mid: string) => Promise<void>
        }
        await stub.broadcastNewMessage(messageId)
      } catch {
        // ignore — the message is already persisted
      }
    }
    return { messageId }
  },
  render: {
    icon: Send,
    displayName: 'Post to space',
    summary: (out) => `posted (${out.messageId.slice(0, 8)}…)`,
  },
}

// ─── webhook_post ──────────────────────────────────────────────────────

const WebhookPostInput = z.object({
  url: z.string().url().describe('Full URL to POST to. Must be https in production.'),
  body: z.unknown().describe('JSON-serialisable body sent as application/json.'),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe('Optional extra headers (e.g. {"X-Auth": "..."}).'),
})

const WebhookPostOutput = z.object({
  status: z.number().int(),
  responseSnippet: z.string(),
})

export const webhookPost: ToolDefinition<
  z.infer<typeof WebhookPostInput>,
  z.infer<typeof WebhookPostOutput>
> = {
  name: 'webhook_post',
  description:
    'POST a JSON body to an external URL (e.g. Slack/Discord/Zapier webhook). Approval-gated — the user reviews the URL and body before the call fires.',
  inputSchema: WebhookPostInput,
  outputSchema: WebhookPostOutput,
  needsApproval: true,
  execute: async (input) => {
    const resp = await fetch(input.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(input.headers ?? {}),
      },
      body: JSON.stringify(input.body ?? {}),
    })
    const text = await resp.text()
    return {
      status: resp.status,
      responseSnippet: text.slice(0, 500),
    }
  },
  render: {
    icon: Webhook,
    displayName: 'POST webhook',
    summary: (out) => `${out.status}`,
  },
}

// ─── Aggregate ─────────────────────────────────────────────────────────
//
// Routines opt in to these by listing their tool names in the agent's
// `toolsAllowed`. The chat agent gets them by default — most are
// already useful in interactive chat (queue an action, send a notify,
// post to a space), and `webhook_post` is approval-gated so it's safe
// to expose by default.

export const channelsDefinitions: ToolDefinition<unknown, unknown>[] = [
  inboxAdd as unknown as ToolDefinition<unknown, unknown>,
  approvalQueue as unknown as ToolDefinition<unknown, unknown>,
  notify as unknown as ToolDefinition<unknown, unknown>,
  spaceSend as unknown as ToolDefinition<unknown, unknown>,
  webhookPost as unknown as ToolDefinition<unknown, unknown>,
]
