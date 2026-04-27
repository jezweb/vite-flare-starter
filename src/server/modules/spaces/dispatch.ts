/**
 * Spaces dispatcher — route a new message's @-mentions to agents.
 *
 * Called from POST /api/spaces/:id/messages after the message has been
 * persisted. Walks the parsed mentions, looks up the agent's reply
 * mode, invokes `runOnce` on the AutonomousAgent DO with the space's
 * recent context, persists the reply, and broadcasts it back via the
 * SpaceAgent.
 *
 * Phase 1 caps:
 *   - One @-mention dispatched per top-level message (no parallel)
 *   - replyMode 'always' | 'mention' | 'off' only
 *   - Auto-thread when the assistant reply is "long" (>200 tokens or
 *     >800 chars as a cheap proxy without a tokenizer)
 *
 * The agent partition is `space:${spaceId}:${agentName}` — distinct
 * from the per-user partition for personal AssistantAgent so a user's
 * 1:1 chat memory doesn't bleed into the space.
 */
import { drizzle } from 'drizzle-orm/d1'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { UIMessage } from 'ai'
import { conversationMembers, conversationMessages } from '@/server/modules/conversations/db/schema'
import type { MentionRef } from './mention-parser'

interface DispatchEnv {
  DB: D1Database
  // Each agent class has its own DO namespace binding. We accept the
  // env loosely and do a lookup by class name.
  [key: string]: unknown
}

const PHASE_1_CONTEXT_TURNS = 20
const AUTO_THREAD_CHAR_THRESHOLD = 800

/**
 * Persist + broadcast an agent reply.
 *
 * Returns the new message id when one was sent, or null on `silent`.
 * Errors are logged + thrown — the route catches and surfaces a 500
 * with the error so dogfood reveals dispatch failures.
 */
export async function dispatchMentions(params: {
  env: DispatchEnv
  spaceId: string
  /** Sender of the triggering message (acting user — used for audit + approvals). */
  senderUserId: string
  /** The triggering message id (used as parentMessageId when auto-threading
   *  or replying inline; null for top-level dispatch from a top-level msg). */
  triggerMessageId: string
  /** When the @-mention happened inside a thread, the parent id of that
   *  thread. Replies from this dispatch land in the same thread. */
  parentMessageId: string | null
  mentions: MentionRef[]
  /** Pre-rendered text of the triggering message — passed to the agent
   *  as the user input string. */
  inputText: string
  /** SpaceAgent DO stub for broadcasting the reply back over WS. */
  broadcastNewMessage: (messageId: string) => Promise<void>
}): Promise<{ replyMessageIds: string[] }> {
  const { env, spaceId, senderUserId, parentMessageId, mentions, inputText, broadcastNewMessage } =
    params
  const replyMessageIds: string[] = []
  if (mentions.length === 0) return { replyMessageIds }

  // Phase 2: cap parallel agent dispatch at 3 mentions per message.
  // Beyond that we silently drop — the spec is "don't fan out a
  // single message to a stampede of agent runs". User mentions are
  // ignored for dispatch (they're notify-only).
  const PARALLEL_CAP = 3
  const agentRefs = mentions
    .filter((m) => m.kind === 'agent' && m.targetAgentClass && m.targetAgentName)
    .slice(0, PARALLEL_CAP)
  if (agentRefs.length === 0) return { replyMessageIds }

  // Phase 1 had a single ref; Phase 2 fans out concurrently. We still
  // serialise the FIRST one through the existing path so the existing
  // tests / observability semantics don't change for the common case;
  // mentions 2-3 run in parallel via Promise.allSettled.
  const ref = agentRefs[0]!
  if (!ref.targetAgentClass || !ref.targetAgentName) return { replyMessageIds }
  const targetAgentClass: string = ref.targetAgentClass
  const targetAgentName: string = ref.targetAgentName

  // Look up reply mode for this agent member. 'off' means the agent
  // is paused — skip silently.
  const d = drizzle(env.DB)
  const [member] = await d
    .select({ replyMode: conversationMembers.replyMode })
    .from(conversationMembers)
    .where(eq(conversationMembers.id, ref.memberId))
    .limit(1)
  const replyMode = member?.replyMode ?? 'mention'
  if (replyMode === 'off') {
    console.log(
      JSON.stringify({ event: 'space_dispatch_skipped_off', spaceId, agentName: ref.targetAgentName }),
    )
    return { replyMessageIds }
  }

  // Build context: recent N top-level messages of this conversation
  // (or thread, when the trigger was inside a thread) ordered oldest →
  // newest. The agent loads its system prompt from its own state.
  const ctxMessages = await loadContextMessages(env.DB, spaceId, parentMessageId)

  // Resolve the AutonomousAgent DO. Each agent class has a Wrangler
  // binding by its className; the namespace is in env. Throw a
  // descriptive error if missing so the route returns 500 with the
  // actual cause.
  const namespace = env[targetAgentClass] as DurableObjectNamespace | undefined
  if (!namespace) {
    throw new Error(
      `dispatchMentions: no DO binding for agent class "${targetAgentClass}" — add it to wrangler.jsonc`,
    )
  }
  const agentName = `space:${spaceId}:${targetAgentName}`
  const stub = namespace.get(namespace.idFromName(agentName)) as unknown as {
    runOnce: (input: {
      input: string
      actingUserId: string
      contextMessages: UIMessage[]
      parentMessageId?: string
      trigger: 'inter_agent'
    }) => Promise<{ text: string }>
    setOwner: (userId: string) => Promise<void>
  }

  // First-touch ownership: when the space was created, the dispatcher
  // sets the agent's owner to the space creator. If state.userId is
  // already set we skip (setOwner throws on reassignment).
  try {
    await stub.setOwner(senderUserId)
  } catch {
    /* already set — fine */
  }

  // Slash sub-command extraction. `@research /summarise <url>` lifts
  // the slash command into structured guidance the agent sees up
  // front. We detect the first @<handle> followed by /<cmd> and
  // prepend a "[Slash command: /cmd; args: ...]" preamble so the
  // model treats it as an explicit instruction.
  const slashRegex = new RegExp(`@${targetAgentName}\\s+/([A-Za-z0-9_-]+)([^\\n]*)`, 'i')
  const slashMatch = inputText.match(slashRegex)
  const augmentedInput = slashMatch
    ? `[Slash command for @${targetAgentName}: /${slashMatch[1]} ${(slashMatch[2] ?? '').trim()}]\n\n${inputText}`
    : inputText

  let reply: { text: string }
  try {
    reply = await stub.runOnce({
      input: augmentedInput,
      actingUserId: senderUserId,
      contextMessages: ctxMessages,
      parentMessageId: parentMessageId ?? undefined,
      trigger: 'inter_agent',
    })
  } catch (err) {
    console.error(
      JSON.stringify({ event: 'space_dispatch_run_failed', spaceId, agentName, error: String(err) }),
    )
    throw err
  }

  if (!reply.text || !reply.text.trim()) return { replyMessageIds }

  // Decide thread placement: if the @-mention was inside a thread,
  // reply in the same thread. Otherwise, top-level UNLESS the reply is
  // long — auto-thread to keep the timeline glanceable.
  const autoThread = parentMessageId === null && reply.text.length > AUTO_THREAD_CHAR_THRESHOLD
  const finalParentId = parentMessageId ?? (autoThread ? params.triggerMessageId : null)

  // Persist the reply. The role is 'assistant' (so the chat surface
  // renders it correctly) and the metadata records which agent.
  const replyId = crypto.randomUUID()
  const partsJson = JSON.stringify([{ type: 'text', text: reply.text }])
  const metadataJson = JSON.stringify({
    senderKind: 'agent',
    senderAgentClass: targetAgentClass,
    senderAgentName: targetAgentName,
    actingUserId: senderUserId,
  })
  await drizzle(env.DB).insert(conversationMessages).values({
    id: replyId,
    conversationId: spaceId,
    role: 'assistant',
    parts: partsJson,
    metadata: metadataJson,
    parentMessageId: finalParentId,
  })

  // If we landed in a thread, bump the parent's threadCount +
  // lastThreadAt in a SINGLE UPDATE so concurrent thread replies
  // don't race a SELECT-then-UPDATE pattern.
  if (finalParentId) {
    await drizzle(env.DB)
      .update(conversationMessages)
      .set({
        threadCount: sql`${conversationMessages.threadCount} + 1`,
        lastThreadAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(conversationMessages.id, finalParentId))
  }

  await broadcastNewMessage(replyId)
  replyMessageIds.push(replyId)

  // Fan out remaining mentions in parallel (best-effort). Each runs
  // through a recursive single-mention dispatch with the same trigger
  // message so threading + audit attribution stay consistent. Errors
  // on individual mentions don't block siblings.
  if (agentRefs.length > 1) {
    const tail = agentRefs.slice(1)
    const fanOut = await Promise.allSettled(
      tail.map((parallelRef) =>
        dispatchMentions({
          env,
          spaceId,
          senderUserId,
          triggerMessageId: params.triggerMessageId,
          parentMessageId,
          mentions: [parallelRef],
          inputText,
          broadcastNewMessage,
        }),
      ),
    )
    for (const settle of fanOut) {
      if (settle.status === 'fulfilled') {
        replyMessageIds.push(...settle.value.replyMessageIds)
      } else {
        console.error(
          JSON.stringify({ event: 'space_dispatch_parallel_failed', spaceId, error: String(settle.reason) }),
        )
      }
    }
  }

  return { replyMessageIds }
}

/**
 * Load the context window for an agent run.
 *
 * - Top-level dispatch: last N top-level messages (parentMessageId IS NULL)
 * - In-thread dispatch: parent + all replies in the thread
 *
 * Returns oldest-first (chronological) so the model sees a natural
 * conversation order.
 */
async function loadContextMessages(
  db: D1Database,
  spaceId: string,
  parentMessageId: string | null,
): Promise<UIMessage[]> {
  const d = drizzle(db)
  let rows: Array<typeof conversationMessages.$inferSelect>
  if (parentMessageId) {
    // Parent + all replies, ordered oldest → newest.
    const parent = await d
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, parentMessageId))
      .limit(1)
    const replies = await d
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.parentMessageId, parentMessageId))
      .orderBy(asc(conversationMessages.createdAt))
    rows = [...parent, ...replies]
  } else {
    rows = await d
      .select()
      .from(conversationMessages)
      .where(
        and(eq(conversationMessages.conversationId, spaceId), isNull(conversationMessages.parentMessageId)),
      )
      .orderBy(asc(conversationMessages.createdAt))
    // Cap to PHASE_1_CONTEXT_TURNS by trimming the oldest.
    if (rows.length > PHASE_1_CONTEXT_TURNS) {
      rows = rows.slice(-PHASE_1_CONTEXT_TURNS)
    }
  }
  return rows.map((row) => {
    let parts: unknown[] = []
    try {
      parts = typeof row.parts === 'string' ? JSON.parse(row.parts) : (row.parts as unknown[])
      if (!Array.isArray(parts)) parts = []
    } catch {
      parts = []
    }
    return {
      id: row.id,
      role: row.role as UIMessage['role'],
      parts,
    } as unknown as UIMessage
  })
}
