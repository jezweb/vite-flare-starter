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
  AI?: Ai
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

  // Phase 2: cap parallel agent dispatch at 3 mentions per message.
  // Beyond that we silently drop — the spec is "don't fan out a
  // single message to a stampede of agent runs". User mentions are
  // ignored for dispatch (they're notify-only).
  const PARALLEL_CAP = 3
  const agentRefs = mentions
    .filter((m) => m.kind === 'agent' && m.targetAgentClass && m.targetAgentName)
    .slice(0, PARALLEL_CAP)
  console.log(
    JSON.stringify({
      event: 'space_dispatch_entry',
      spaceId,
      mentionCount: mentions.length,
      agentMentionCount: agentRefs.length,
      parentMessageId,
    })
  )

  // P2-002 — when no @-mention targeted an agent, fan out to:
  //   (a) every `always`-mode agent (e.g. AdminAgent in /admin space —
  //       configured to "Replies to every message")
  //   (b) every `proactive`/`ambient`-mode agent (Phase 3 classifier path)
  //
  // Without (a), spaces like /admin (which seed AdminAgent in 'always'
  // mode) appeared silent: the user posted a message, no agent reply,
  // no system message, no error. The audit caught this in P2-002.
  if (agentRefs.length === 0) {
    if (parentMessageId !== null) return { replyMessageIds } // Phase 3 + always only fires top-level
    // (a) Always agents fire first — they're the "this room has a
    // dedicated agent" pattern (1:1 chat, AdminAgent, etc).
    await runAlwaysAgents({
      env,
      spaceId,
      senderUserId,
      triggerMessageId: params.triggerMessageId,
      parentMessageId,
      inputText,
      broadcastNewMessage,
      replyMessageIds,
    })
    // (b) Proactive/ambient classifier path runs alongside.
    await runProactiveAgents({
      env,
      spaceId,
      senderUserId,
      triggerMessageId: params.triggerMessageId,
      parentMessageId,
      inputText,
      broadcastNewMessage,
      replyMessageIds,
    })
    return { replyMessageIds }
  }

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
      JSON.stringify({
        event: 'space_dispatch_skipped_off',
        spaceId,
        agentName: ref.targetAgentName,
      })
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
      `dispatchMentions: no DO binding for agent class "${targetAgentClass}" — add it to wrangler.jsonc`
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
      JSON.stringify({ event: 'space_dispatch_run_failed', spaceId, agentName, error: String(err) })
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
        })
      )
    )
    for (const settle of fanOut) {
      if (settle.status === 'fulfilled') {
        replyMessageIds.push(...settle.value.replyMessageIds)
      } else {
        console.error(
          JSON.stringify({
            event: 'space_dispatch_parallel_failed',
            spaceId,
            error: String(settle.reason),
          })
        )
      }
    }
  }

  return { replyMessageIds }
}

/**
 * P2-002 — `always` reply-mode dispatch.
 *
 * For agents configured as `replyMode: 'always'`, fire on every
 * top-level message in the space (no @-mention required, no classifier
 * gate). This is the pattern for 1:1 chat (single user + single
 * always-replying agent) and special spaces like /admin which seed
 * AdminAgent in always mode.
 *
 * Cap at 2 always-agents per top-level message so a misconfigured room
 * with 5 always-agents doesn't fan out 5 LLM calls per send.
 */
async function runAlwaysAgents(params: {
  env: DispatchEnv
  spaceId: string
  senderUserId: string
  triggerMessageId: string
  parentMessageId: string | null
  inputText: string
  broadcastNewMessage: (messageId: string) => Promise<void>
  replyMessageIds: string[]
}): Promise<void> {
  const {
    env,
    spaceId,
    senderUserId,
    triggerMessageId,
    parentMessageId,
    inputText,
    broadcastNewMessage,
    replyMessageIds,
  } = params
  const ALWAYS_CAP = 2
  const d = drizzle(env.DB)
  const candidateRows = await d
    .select({
      id: conversationMembers.id,
      agentClass: conversationMembers.agentClass,
      agentName: conversationMembers.agentName,
      replyMode: conversationMembers.replyMode,
    })
    .from(conversationMembers)
    .where(
      and(eq(conversationMembers.conversationId, spaceId), eq(conversationMembers.kind, 'agent'))
    )
  const candidates = candidateRows
    .filter((r) => r.replyMode === 'always')
    .filter((r) => !!r.agentClass && !!r.agentName)
    .slice(0, ALWAYS_CAP)
  console.log(
    JSON.stringify({
      event: 'always_dispatch_entry',
      spaceId,
      totalAgentMembers: candidateRows.length,
      alwaysCandidates: candidates.length,
      replyModes: candidateRows.map((r) => r.replyMode),
    })
  )
  if (candidates.length === 0) return

  for (const cand of candidates) {
    const agentClass = cand.agentClass as string
    const agentName = cand.agentName as string
    console.log(
      JSON.stringify({
        event: 'always_dispatch_member',
        spaceId,
        agentClass,
        agentName,
        replyMode: cand.replyMode,
      })
    )
    const namespace = env[agentClass] as DurableObjectNamespace | undefined
    if (!namespace) {
      console.error(
        JSON.stringify({
          event: 'always_dispatch_no_binding',
          spaceId,
          agentClass,
          agentName,
          envKeys: Object.keys(env).filter((k) => /Agent$/.test(k)),
        })
      )
      continue
    }
    const ctxMessages = await loadContextMessages(env.DB, spaceId, parentMessageId)
    const stub = namespace.get(
      namespace.idFromName(`space:${spaceId}:${agentName}`)
    ) as unknown as {
      runOnce: (input: {
        input: string
        actingUserId: string
        contextMessages: UIMessage[]
        parentMessageId?: string
        trigger: 'inter_agent'
      }) => Promise<{ text: string }>
      setOwner: (userId: string) => Promise<void>
    }
    try {
      await stub.setOwner(senderUserId)
    } catch {
      /* already set — fine */
    }
    console.log(
      JSON.stringify({
        event: 'always_dispatch_invoke',
        spaceId,
        agentClass,
        agentName,
        inputLen: inputText.length,
        ctxMessages: ctxMessages.length,
      })
    )
    let reply: { text: string }
    try {
      reply = await stub.runOnce({
        input: inputText,
        actingUserId: senderUserId,
        contextMessages: ctxMessages,
        parentMessageId: parentMessageId ?? undefined,
        trigger: 'inter_agent',
      })
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'always_dispatch_failed',
          spaceId,
          agentClass,
          agentName,
          error: String(err),
          stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
        })
      )
      continue
    }
    console.log(
      JSON.stringify({
        event: 'always_dispatch_complete',
        spaceId,
        agentClass,
        agentName,
        replyLen: reply.text?.length ?? 0,
      })
    )
    if (!reply.text || !reply.text.trim()) continue
    // Same auto-thread heuristic as the @-mention path.
    const autoThread = parentMessageId === null && reply.text.length > AUTO_THREAD_CHAR_THRESHOLD
    const finalParentId = parentMessageId ?? (autoThread ? triggerMessageId : null)
    const replyId = crypto.randomUUID()
    const partsJson = JSON.stringify([{ type: 'text', text: reply.text }])
    const metadataJson = JSON.stringify({
      senderKind: 'agent',
      senderAgentClass: agentClass,
      senderAgentName: agentName,
      actingUserId: senderUserId,
      replyMode: 'always',
    })
    await d.insert(conversationMessages).values({
      id: replyId,
      conversationId: spaceId,
      role: 'assistant',
      parts: partsJson,
      metadata: metadataJson,
      parentMessageId: finalParentId,
    })
    if (finalParentId) {
      await d
        .update(conversationMessages)
        .set({
          threadCount: sql`${conversationMessages.threadCount} + 1`,
          lastThreadAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(conversationMessages.id, finalParentId))
    }
    await broadcastNewMessage(replyId)
    replyMessageIds.push(replyId)
  }
}

/**
 * Phase 3 — proactive + ambient classifier path.
 *
 * Walks every agent member in `proactive` or `ambient` mode and asks
 * a tiny Workers AI model (Gemma 4 26B) "should this agent reply or
 * react?". Cap at 2 evaluations per message so a busy room doesn't
 * fan out classifier calls.
 *
 * Proactive: classifier returns 'reply' | 'silent'. On 'reply', the
 * agent is dispatched as if @-mentioned.
 * Ambient: classifier returns 'react:<emoji>' | 'silent'. On react,
 * we add a reaction to the trigger message instead of replying.
 */
async function runProactiveAgents(params: {
  env: DispatchEnv
  spaceId: string
  senderUserId: string
  triggerMessageId: string
  parentMessageId: string | null
  inputText: string
  broadcastNewMessage: (messageId: string) => Promise<void>
  replyMessageIds: string[]
}): Promise<void> {
  const {
    env,
    spaceId,
    senderUserId,
    triggerMessageId,
    parentMessageId,
    inputText,
    broadcastNewMessage,
    replyMessageIds,
  } = params
  const PROACTIVE_CAP = 2
  if (!env.AI) return
  const d = drizzle(env.DB)
  const candidateRows = await d
    .select({
      id: conversationMembers.id,
      agentClass: conversationMembers.agentClass,
      agentName: conversationMembers.agentName,
      replyMode: conversationMembers.replyMode,
    })
    .from(conversationMembers)
    .where(
      and(eq(conversationMembers.conversationId, spaceId), eq(conversationMembers.kind, 'agent'))
    )
  const candidates = candidateRows
    .filter((r) => r.replyMode === 'proactive' || r.replyMode === 'ambient')
    .filter((r) => !!r.agentClass && !!r.agentName)
    .slice(0, PROACTIVE_CAP)
  if (candidates.length === 0) return

  for (const cand of candidates) {
    const agentClass = cand.agentClass as string
    const agentName = cand.agentName as string
    const mode = cand.replyMode as 'proactive' | 'ambient'
    const decision = await classifyTurn(env.AI, mode, agentName, inputText).catch((err) => {
      console.error(
        JSON.stringify({
          event: 'space_proactive_classify_failed',
          spaceId,
          agentName,
          error: String(err),
        })
      )
      return { kind: 'silent' as const }
    })

    if (decision.kind === 'silent') continue

    if (decision.kind === 'react') {
      // Ambient mode — add a reaction to the trigger message.
      try {
        const [row] = await d
          .select()
          .from(conversationMessages)
          .where(eq(conversationMessages.id, triggerMessageId))
          .limit(1)
        if (!row) continue
        let reactions: Record<string, string[]> = {}
        if (row.reactions) {
          try {
            const parsed =
              typeof row.reactions === 'string' ? JSON.parse(row.reactions) : row.reactions
            if (parsed && typeof parsed === 'object') reactions = parsed as Record<string, string[]>
          } catch {
            reactions = {}
          }
        }
        const actorKey = `agent:${agentName}`
        const list = reactions[decision.emoji] ?? []
        if (!list.includes(actorKey)) list.push(actorKey)
        reactions[decision.emoji] = list
        await d
          .update(conversationMessages)
          .set({ reactions: JSON.stringify(reactions) })
          .where(eq(conversationMessages.id, triggerMessageId))
        await broadcastNewMessage(triggerMessageId)
      } catch (err) {
        console.error(
          JSON.stringify({
            event: 'space_proactive_react_failed',
            spaceId,
            agentName,
            error: String(err),
          })
        )
      }
      continue
    }

    // decision.kind === 'reply' — dispatch the agent as if @-mentioned.
    const ctxMessages = await loadContextMessages(env.DB, spaceId, parentMessageId)
    const namespace = env[agentClass] as DurableObjectNamespace | undefined
    if (!namespace) continue
    const stub = namespace.get(
      namespace.idFromName(`space:${spaceId}:${agentName}`)
    ) as unknown as {
      runOnce: (input: {
        input: string
        actingUserId: string
        contextMessages: UIMessage[]
        parentMessageId?: string
        trigger: 'inter_agent'
      }) => Promise<{ text: string }>
      setOwner: (userId: string) => Promise<void>
    }
    try {
      await stub.setOwner(senderUserId)
    } catch {
      /* already set */
    }
    let reply: { text: string }
    try {
      reply = await stub.runOnce({
        input: inputText,
        actingUserId: senderUserId,
        contextMessages: ctxMessages,
        parentMessageId: parentMessageId ?? undefined,
        trigger: 'inter_agent',
      })
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'space_proactive_dispatch_failed',
          spaceId,
          agentName,
          error: String(err),
        })
      )
      continue
    }
    if (!reply.text || !reply.text.trim()) continue
    const replyId = crypto.randomUUID()
    const partsJson = JSON.stringify([{ type: 'text', text: reply.text }])
    const metadataJson = JSON.stringify({
      senderKind: 'agent',
      senderAgentClass: agentClass,
      senderAgentName: agentName,
      actingUserId: senderUserId,
      proactive: true,
    })
    await d.insert(conversationMessages).values({
      id: replyId,
      conversationId: spaceId,
      role: 'assistant',
      parts: partsJson,
      metadata: metadataJson,
      parentMessageId: parentMessageId,
    })
    await broadcastNewMessage(replyId)
    replyMessageIds.push(replyId)
  }
}

/**
 * Tiny classifier — single Workers AI call. Returns silent / reply /
 * react:<emoji>. Bounded to a small token output to keep cost
 * negligible. We use the json structure prompted in plain text and
 * parse out the verb.
 */
async function classifyTurn(
  ai: Ai,
  mode: 'proactive' | 'ambient',
  agentName: string,
  text: string
): Promise<{ kind: 'silent' } | { kind: 'reply' } | { kind: 'react'; emoji: string }> {
  const trimmed = text.trim()
  if (!trimmed) return { kind: 'silent' }
  const sample = trimmed.length > 600 ? `${trimmed.slice(0, 600)}…` : trimmed
  const system =
    mode === 'proactive'
      ? `You are deciding whether an AI agent named @${agentName} should jump into a multi-user chat unprompted.
- Reply ONLY if @${agentName} can clearly add value (e.g. answers a directly relevant question, surfaces missing context).
- Stay silent for chitchat, off-topic banter, anything not in @${agentName}'s expertise.
- Output JSON: {"action":"reply"} or {"action":"silent"}.`
      : `You are deciding whether an AI agent named @${agentName} should react to a chat message with an emoji (no text reply).
- React when there's clear signal worth acknowledging (a job done, a kind word, a question that's been answered).
- Output JSON: {"action":"react","emoji":"👍"} or {"action":"silent"}.`
  const user = `Latest message:\n${sample}`
  // biome-ignore lint/suspicious/noExplicitAny: Workers AI response shape
  const result: any = await ai.run('@cf/google/gemma-4-26b-a4b-it', {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 60,
    temperature: 0.1,
  })
  const responseText = typeof result?.response === 'string' ? result.response : ''
  // Extract first {…} block — robust against the model wrapping prose.
  const match = responseText.match(/\{[^{}]*\}/)
  if (!match) return { kind: 'silent' }
  try {
    const parsed = JSON.parse(match[0])
    if (parsed?.action === 'reply') return { kind: 'reply' }
    if (parsed?.action === 'react' && typeof parsed.emoji === 'string') {
      return { kind: 'react', emoji: parsed.emoji }
    }
  } catch {
    /* fall through */
  }
  return { kind: 'silent' }
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
  parentMessageId: string | null
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
        and(
          eq(conversationMessages.conversationId, spaceId),
          isNull(conversationMessages.parentMessageId)
        )
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
