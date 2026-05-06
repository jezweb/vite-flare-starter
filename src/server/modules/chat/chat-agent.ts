/**
 * ChatAgent — Durable Object backed by `@cloudflare/ai-chat`'s AIChatAgent.
 *
 * SDK-aligned chat primitive. One DO per (user, conversation) pair, named
 * `user-{userId}-conv-{conversationId}`. The DO owns:
 *   - Per-conversation message history in SQLite (via SDK's persistence)
 *   - WebSocket fan-out to all connected clients of that conversation
 *   - The full chat agent loop: system prompt assembly, tool calls,
 *     streaming response, MCP integration, telemetry
 *
 * Cross-module projection: `onChatResponse` writes-through to the shared
 * `conversation_messages` table in D1 so Spaces/Projects/Memories/AdminTools
 * can read chat content without reaching into the DO. The DO is authoritative
 * for live state; D1 is the cross-module read projection.
 *
 * Sidebar listing reads from the existing `conversations` table (where
 * kind='chat'). No separate `chat_sessions` table needed — DO instance name
 * is derivable: `user-${userId}-conv-${conversationId}`.
 *
 * Routed via `routeAgentRequest` at
 * `/agents/chat-agent/user-{userId}-conv-{conversationId}` once the
 * client switches over.
 *
 * @see chat-aichatagent-migration-plan-2026-05-04.md
 * @see https://www.npmjs.com/package/@cloudflare/ai-chat
 */
import {
  AIChatAgent,
  type OnChatMessageOptions,
  type ChatResponseResult,
} from '@cloudflare/ai-chat'
import {
  streamText,
  convertToModelMessages,
  pruneMessages,
  smoothStream,
  stepCountIs,
  hasToolCall,
  safeValidateUIMessages,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type PrepareStepResult,
  type UIMessage,
} from 'ai'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'

import type { Env } from '@/server/index'
import type {
  AgentContext as CanonicalAgentContext,
  AgentUser,
} from '@/shared/agent'
import { nullTelemetry } from '@/shared/agent'

import { tokenBudgetPrepareStep, computeActiveTools } from '@/server/lib/ai/prepare-step'
import {
  buildFindToolsTool,
  buildListToolsTool,
  CORE_TOOL_NAMES,
  extractDiscoveredToolNames,
  type SearchableTool,
} from '@/server/lib/ai/tool-search'
import { toAiSdkTool } from '@/server/lib/ai/tool-adapter'
import { resolveModelForUser } from '@/server/lib/ai/providers'
import { costFor } from '@/server/lib/ai/cost'
import { buildModel } from '@/server/lib/ai/middleware'
import { buildCacheableSystemPrompt } from '@/server/lib/ai/context'
import { getMCPTools } from '@/server/lib/ai/mcp'
import { getModel, DEFAULT_MODEL } from '@/server/lib/ai/models'
import { listSkills, loadAlwaysActiveSkills } from '@/server/lib/ai/skills/registry'
import {
  listKnowledgeCatalog,
  loadAlwaysActiveKnowledge,
} from '@/server/modules/knowledge/storage'
import { trimHistoryToTokenBudget } from '@/server/lib/ai/trim-history'
import { convertToMarkdown } from '@/server/lib/ai/documents'
import { buildChatTools } from '@/server/modules/chat/tools'
import { aiUsageLogs, aiToolCalls } from '@/server/modules/chat/db/schema'
import { userMeta } from '@/server/modules/user-meta/db/schema'
import { projects } from '@/server/modules/projects/db/schema'
import { user as userTable } from '@/server/modules/auth/db/schema'
import { conversations } from '@/server/modules/conversations/db/schema'
import { createD1ChatStorage } from '@/server/modules/conversations/storage'
import { logActivity } from '@/server/modules/activity/log'

/**
 * Result of parsing a DO instance name — `user-{userId}-conv-{conversationId}`.
 * Returns nulls when the name doesn't match the expected shape so callers
 * can reject early without throwing.
 */
function parseInstanceName(name: string): { userId: string | null; conversationId: string | null } {
  const match = name.match(/^user-([^-].*?)-conv-(.+)$/)
  if (!match) return { userId: null, conversationId: null }
  return { userId: match[1] ?? null, conversationId: match[2] ?? null }
}

/**
 * Strip `<skill_content>` wrappers from text — slash-activated skills
 * (`/plan-task` etc.) inject these blocks; we don't want them in the
 * conversation title or activity feed.
 *
 * Ported verbatim from the legacy routes.ts `extractTitle` helper.
 */
function stripSkillWrapper(text: string): string {
  return text.replace(/<skill_content\b[^>]*>[\s\S]*?<\/skill_content>\s*/gi, '').trim()
}

/**
 * Derive the conversation title from the first user message. Mirrors the
 * legacy routes.ts behaviour — handles both `content: string` (legacy
 * shape) and `parts[].text` (current AI SDK shape).
 */
function extractTitleFromMessage(msg: UIMessage | undefined): string {
  if (!msg) return 'New conversation'
  const parts = msg.parts as Array<{ type?: string; text?: string }> | undefined
  const textPart = parts?.find(
    (p) => p?.type === 'text' && typeof p.text === 'string' && p.text.trim(),
  )
  if (textPart?.text) {
    const cleaned = stripSkillWrapper(textPart.text)
    if (cleaned) return cleaned.slice(0, 80)
  }
  // Defensive — older messages may have `content: string` directly.
  const content = (msg as unknown as { content?: unknown }).content
  if (typeof content === 'string' && content.trim()) {
    const cleaned = stripSkillWrapper(content)
    if (cleaned) return cleaned.slice(0, 80)
  }
  return 'New conversation'
}

/**
 * Best-effort sanitiser for stream-level errors surfaced to the client.
 * Mirrors routes.ts onError mapping. Stack traces stay in Workers Logs only.
 */
function sanitiseStreamError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name
    if (name === 'AbortError') return 'Request was cancelled.'
    if (name === 'TimeoutError') return 'The model took too long to respond. Please try again.'
    if (name === 'RateLimitError') return 'Rate limit reached. Please wait a moment and try again.'
    if (name === 'AI_APICallError') return 'The model service is temporarily unavailable.'
  }
  return 'An error occurred during chat streaming. Please try again.'
}

/**
 * Auto-generate a short conversation title from the first user/assistant
 * exchange. Uses Workers AI Kimi K2.6 — free, fast. Falls back to silently
 * keeping the truncated first-user-message title if the LLM call fails.
 *
 * Ported from routes.ts `autoTitleConversation`. Fire-and-forget from
 * `onChatResponse` after the first turn completes.
 */
async function autoTitleConversation(
  env: Env,
  conversationId: string,
  userId: string,
  messages: readonly UIMessage[],
): Promise<void> {
  try {
    const firstUser = messages.find((m) => m.role === 'user')
    const firstAssistant = messages.find((m) => m.role === 'assistant')
    if (!firstUser || !firstAssistant) return
    const userText =
      (firstUser.parts as Array<{ type?: string; text?: string }> | undefined)
        ?.find((p) => p?.type === 'text')
        ?.text?.slice(0, 500) ?? ''
    const assistantText =
      (firstAssistant.parts as Array<{ type?: string; text?: string }> | undefined)
        ?.find((p) => p?.type === 'text')
        ?.text?.slice(0, 500) ?? ''
    if (!userText || !assistantText) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await (env.AI as any).run('@cf/moonshotai/kimi-k2.6', {
      messages: [
        {
          role: 'system',
          content:
            'Summarise the user\'s intent from this chat exchange into a short, specific title (≤6 words, sentence case, no quotes or trailing punctuation). Reply with ONLY the title text.',
        },
        { role: 'user', content: `USER: ${userText}\n\nASSISTANT: ${assistantText}\n\nTitle:` },
      ],
      max_tokens: 40,
    })
    const raw = (result?.response || result?.text || '').toString().trim()
    const title = raw
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/[.!?]+$/, '')
      .slice(0, 80)
    if (!title || title.length < 3) return

    await drizzle(env.DB)
      .update(conversations)
      .set({ title })
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    console.log(JSON.stringify({ event: 'chat_auto_title', conversationId, title }))
  } catch (err) {
    console.warn(JSON.stringify({ event: 'chat_auto_title_failed', error: String(err) }))
  }
}

/**
 * Build the `"<name> (<size>)"` label embedded in the attachment prefix the
 * client's AttachedFileBlock detects to render a collapsed file card.
 */
function attachmentLabel(part: { filename?: string }, byteLen: number): string {
  const name = part.filename?.trim() || 'file'
  return `${name} (${formatBytes(byteLen)})`
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/* ------------------------------------------------------------------ */
/* Chat preferences (loaded from user_meta).                           */
/* Mirrors agent.ts `loadChatPreferences` + `formatChatPreferences`.   */
/* ------------------------------------------------------------------ */

interface ChatPreferences {
  preferredName?: string
  style?: 'concise' | 'detailed'
  tone?: 'friendly' | 'direct' | 'academic'
  about?: string
  confirmationMode?: boolean
}

async function loadChatPreferences(
  db: D1Database,
  userId: string,
): Promise<ChatPreferences | null> {
  try {
    const row = await drizzle(db)
      .select({ value: userMeta.value })
      .from(userMeta)
      .where(and(eq(userMeta.userId, userId), eq(userMeta.key, 'chat.preferences')))
      .get()
    if (!row) return null
    const parsed = JSON.parse(row.value) as ChatPreferences
    if (
      !parsed.preferredName &&
      !parsed.style &&
      !parsed.tone &&
      !parsed.about &&
      !parsed.confirmationMode
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function formatChatPreferences(p: ChatPreferences): string {
  const lines: string[] = []
  if (p.preferredName) lines.push(`- Preferred name: ${p.preferredName}`)
  if (p.style) {
    lines.push(
      p.style === 'concise'
        ? '- Response style: Concise — keep replies short and focused. Skip preamble.'
        : '- Response style: Detailed — include context, reasoning, and worked examples.',
    )
  }
  if (p.tone) {
    const toneMap: Record<string, string> = {
      friendly: 'warm and conversational',
      direct: 'direct and matter-of-fact; no hedging',
      academic: 'precise and formal, with citations where relevant',
    }
    lines.push(`- Tone: ${toneMap[p.tone] ?? p.tone}`)
  }
  if (p.about) {
    const trimmed = p.about.slice(0, 2000).trim()
    lines.push(`- About the user (markdown):\n\n${trimmed}`)
  }
  if (p.confirmationMode) {
    lines.push(
      '- Confirmation mode: ON — before calling any tool, briefly describe your plan in one sentence and ask the user to confirm. Only proceed after the user says yes (or equivalent).',
    )
  }
  return lines.join('\n')
}

/**
 * Load a project row scoped to the user. Mirrors agent.ts `loadProject`.
 * Returns null on miss / cross-user mismatch / DB error.
 */
async function loadProject(
  db: D1Database,
  projectId: string,
  userId: string,
): Promise<{ name: string; systemPrompt: string | null; defaultModel: string | null } | null> {
  try {
    const row = await drizzle(db)
      .select({
        name: projects.name,
        systemPrompt: projects.systemPrompt,
        defaultModel: projects.defaultModel,
      })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .get()
    return row ?? null
  } catch {
    return null
  }
}

/**
 * Pre-process file attachments on the user's latest message. Audio →
 * Workers AI Nova-3 transcription. Text/JSON → inline. Everything else →
 * `convertToMarkdown` (PDF, DOCX, XLSX, etc).
 *
 * Operates on a *clone* of the messages so the SDK's persisted copy still
 * carries the original file parts (the user can re-download them); only
 * the model sees the converted text.
 *
 * Ported from routes.ts lines 188-258. We intentionally only preprocess
 * the *latest* user message — historical attachments were already
 * preprocessed on their respective turns.
 *
 * @param env - Worker env, used for AI binding (transcription / markdown)
 * @param messages - Source messages; not mutated
 * @returns Cloned message array with file parts swapped for text parts
 */
async function preprocessAttachments(
  env: Env,
  messages: readonly UIMessage[],
): Promise<UIMessage[]> {
  const latestUserIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'user') return i
    }
    return -1
  })()

  if (latestUserIndex < 0) return messages.map((m) => ({ ...m }))

  // Deep-clone the latest user message's parts so we can splice without
  // mutating the SDK-persisted array.
  const cloned: UIMessage[] = messages.map((m, i) => {
    if (i !== latestUserIndex) return m
    return {
      ...m,
      parts: Array.isArray(m.parts) ? m.parts.map((p) => ({ ...(p as object) })) : m.parts,
    } as UIMessage
  })

  const target = cloned[latestUserIndex]!
  const parts = target.parts as Array<{
    type: string
    url?: string
    mediaType?: string
    data?: string
    text?: string
    filename?: string
  }>

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    if (part.type !== 'file') continue
    const mime = part.mediaType || ''
    // Images pass through — models with vision handle them natively.
    if (mime.startsWith('image/')) continue

    try {
      if (!part.url?.startsWith('data:')) continue
      const base64 = part.url.split(',')[1] || ''
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

      let textContent = ''

      if (mime.startsWith('audio/')) {
        // Nova 3 needs the multipart input shape — raw Uint8Array fails
        // with `5006: required properties at '/audio' are 'body,contentType'`.
        try {
          const form = new FormData()
          form.append('audio', new Blob([new Uint8Array(bytes)], { type: mime }), 'audio')
          const formResp = new Response(form)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result: any = await (env.AI as any).run('@cf/deepgram/nova-3', {
            audio: {
              body: formResp.body,
              contentType: formResp.headers.get('content-type'),
            },
          })
          const transcript = (
            result?.text ||
            result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
            ''
          ).trim()
          textContent = transcript
            ? `[Audio transcription]:\n\n${transcript}`
            : '[Audio file attached but transcription returned no text.]'
        } catch (err) {
          console.warn(
            JSON.stringify({ event: 'audio_transcription_failed', error: String(err) }),
          )
          textContent =
            '[Audio file attached but transcription failed. Use the transcribe_audio tool to retry.]'
        }
      } else if (mime.startsWith('text/') || mime === 'application/json') {
        const decoded = new TextDecoder().decode(bytes)
        // Prefix `[Attached file: <name> (<size>)]` is detected by
        // AttachedFileBlock — keep it stable.
        textContent = `[Attached file: ${attachmentLabel(part, bytes.length)}]\n\n${decoded}`
      } else {
        // PDF / DOCX / XLSX / PPTX / HTML / RTF / EPUB — env.AI.toMarkdown
        // wrapper handles ZIP-based office formats correctly.
        const markdown = await convertToMarkdown(
          env as unknown as Parameters<typeof convertToMarkdown>[0],
          bytes,
          mime,
          { filename: part.filename },
        )
        textContent = `[Attached file: ${attachmentLabel(part, bytes.length)}]\n\n${markdown}`
      }

      if (textContent) {
        parts[i] = { type: 'text', text: textContent } as typeof part
      }
    } catch (err) {
      console.warn('Failed to convert file attachment:', err)
    }
  }

  return cloned
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export class ChatAgent extends AIChatAgent<Env> {
  /**
   * Storage cap. SQLite auto-deletes oldest beyond this. Independent of the
   * per-turn LLM context (handled by `pruneMessages` inside `onChatMessage`).
   */
  override maxPersistedMessages = 200

  /**
   * Wait for MCP connections to restore after hibernation before processing.
   * Without this, `getAITools()` can return an incomplete set on first
   * post-hibernate turn.
   */
  override waitForMcpConnections = { timeout: 10_000 } as const

  /**
   * Tracks whether we've already inserted the conversation row in D1.
   * Set true after a successful first-turn lazy-insert. Avoids re-running
   * the insert + activity log + memory trigger on subsequent turns.
   *
   * Lives in memory only — DO hibernation rebuilds the agent and we'll
   * re-check `conversations` table existence on the next turn (cheap).
   */
  private _conversationRowEnsured = false

  /**
   * Extract `{ userId, conversationId }` from `this.name`. Throws if the
   * instance name doesn't match the convention — that's a programming
   * error (the route should reject mismatched names before reaching here).
   */
  protected resolveSession(): { userId: string; conversationId: string } {
    const { userId, conversationId } = parseInstanceName(this.name)
    if (!userId || !conversationId) {
      throw new Error(
        `ChatAgent instance name "${this.name}" doesn't match user-{userId}-conv-{conversationId}`,
      )
    }
    return { userId, conversationId }
  }

  override async onChatMessage(
    _onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions,
  ): Promise<Response | undefined> {
    const { userId, conversationId } = this.resolveSession()
    const startTime = Date.now()

    // ─── 1. Read body params (client-sent custom data) ───────────────
    // routes.ts line 105-122 — same defensive parse + UUID regex.
    const body = (options?.body ?? {}) as Record<string, unknown>
    const requestedModel =
      typeof body['model'] === 'string' ? (body['model'] as string) : undefined
    // systemPrompt is intentionally server-controlled — client cannot override.
    // Forks: change the default in buildSystemPrompt baseInstructions below.
    const clientSystemPromptIgnored = undefined as undefined
    void clientSystemPromptIgnored

    const rawProjectId = body['projectId']
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const clientProjectId: string | null =
      typeof rawProjectId === 'string' && UUID_RE.test(rawProjectId) ? rawProjectId : null

    // ─── 2. Lazy-create the conversation D1 row on first turn ────────
    // The DO is the source of truth for messages, but cross-module readers
    // (Spaces global search, Projects, Admin tools) need a `conversations`
    // row. Inserted lazily so a stream that fails before any message
    // completes doesn't leave a ghost empty conversation.
    //
    // Side effects on lazy-create: seeds default member rows
    // (user=owner + AssistantAgent always-replying) AND records an
    // activity log row.
    const isFirstUserMessage =
      this.messages.filter((m) => m.role === 'user').length === 1 &&
      !options?.continuation
    const firstUserMsg = this.messages.find((m) => m.role === 'user')

    if (isFirstUserMessage && !this._conversationRowEnsured) {
      try {
        const storage = createD1ChatStorage(this.env.DB)
        // Trust the stored row for existing conversations; trust the client
        // for brand-new ones. `getProjectId` returns null when no row exists.
        const existingProjectId = await storage.getProjectId(conversationId, userId)
        const effectiveProjectId =
          existingProjectId !== null ? existingProjectId : clientProjectId

        // onConflictDoNothing inside createConversationWithId makes this
        // idempotent for retried streams.
        await storage.createConversationWithId(conversationId, userId, {
          title: extractTitleFromMessage(firstUserMsg),
          model: requestedModel || DEFAULT_MODEL,
          systemPrompt: undefined,
          projectId: effectiveProjectId,
        })

        // Fire-and-forget activity log. We don't have a Hono `c` in the DO,
        // so use the lower-level `logActivity` helper directly with synthetic
        // ip/userAgent values. Non-blocking so an audit hiccup never breaks
        // chat — see the catch below.
        await logActivity(this.env.DB, {
          userId,
          action: 'create',
          entityType: 'conversation',
          entityId: conversationId,
          entityName: extractTitleFromMessage(firstUserMsg),
          metadata: { model: requestedModel || DEFAULT_MODEL, source: 'ChatAgent' },
          ipAddress: 'do',
          userAgent: 'ChatAgent',
        })

        this._conversationRowEnsured = true
      } catch (err) {
        console.error(
          JSON.stringify({
            event: 'chat_conversation_lazy_create_failed',
            conversationId,
            error: String(err),
          }),
        )
        // Don't throw — D1 projection is best-effort. The DO still owns
        // the conversation; sidebar listing is what suffers.
      }
    }

    // Resolve effective project for system prompt assembly (cheap second
    // read; guaranteed correct after the lazy-create above).
    const storageForRead = createD1ChatStorage(this.env.DB)
    const effectiveProjectId = await storageForRead.getProjectId(conversationId, userId)

    // ─── 3. File preprocessing (audio / text / docs → text) ──────────
    // Operates on a CLONE — the SDK has already persisted the original
    // file parts. Only the model-bound copy gets text-substituted.
    const messagesAfterFiles = await preprocessAttachments(this.env, this.messages)

    // ─── 4. Token-aware history trim ─────────────────────────────────
    // Drops oldest until under 80K tokens, optionally summarises the
    // dropped block with Haiku 4.5 if OPENROUTER_API_KEY is set.
    const openRouterKey = (this.env as { OPENROUTER_API_KEY?: string }).OPENROUTER_API_KEY
    const trim = await trimHistoryToTokenBudget(messagesAfterFiles, {
      openRouterApiKey: openRouterKey,
    })
    if (trim.trimmed) {
      console.log(
        JSON.stringify({
          event: 'chat_history_trimmed',
          conversationId,
          userId,
          droppedCount: trim.droppedCount,
          summarised: !!trim.summary,
          estimatedTokensAfter: trim.estimatedTokens,
        }),
      )
    }
    const trimmedMessages = trim.messages as UIMessage[]

    // ─── 5. Resolve user record (for system prompt context) ──────────
    let userRecord: AgentUser
    try {
      const row = await drizzle(this.env.DB)
        .select({
          id: userTable.id,
          email: userTable.email,
          name: userTable.name,
          role: userTable.role,
        })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .get()
      if (row) {
        userRecord = {
          id: row.id,
          email: row.email,
          name: row.name ?? null,
          role: (row.role as AgentUser['role']) ?? 'user',
        }
      } else {
        userRecord = { id: userId, email: '', name: null, role: 'user' }
      }
    } catch {
      userRecord = { id: userId, email: '', name: null, role: 'user' }
    }

    // ─── 6. Load project (system prompt + default model precedence) ──
    const project = effectiveProjectId
      ? await loadProject(this.env.DB, effectiveProjectId, userId)
      : null

    // Model precedence: explicit client → project default → DEFAULT_MODEL.
    const modelId = requestedModel || project?.defaultModel || DEFAULT_MODEL
    const modelConfig = getModel(modelId)

    // ─── 7. Resolve model + apply middleware (BYOK-aware) ────────────
    const baseModel = await resolveModelForUser(
      this.env as unknown as Parameters<typeof resolveModelForUser>[0],
      { userId },
      modelId,
    )
    const model = buildModel(baseModel, modelId)

    // ─── 8. Skill catalog (Level 1 progressive disclosure) ───────────
    // Skills with `disable_model_invocation: true` are user-invocable
    // only — hide them from the catalog so the model can't auto-load.
    // Skills with `always_active: true` have their full body baked
    // into the prompt below — also hide from the on-demand catalog so
    // the model doesn't redundantly try to load them.
    const availableSkills = (
      await listSkills(this.env as { DB: D1Database; SKILLS?: R2Bucket }, userId)
    ).filter((s) => !s.disableModelInvocation)
    const skillsCatalog = availableSkills.length > 0
      ? availableSkills
          .filter((s) => !s.alwaysActive)
          .map((s) => `- **${s.name}**: ${s.description}`)
          .join('\n')
      : null

    // ─── 8b. Always-active skill bodies (baked baseline) ─────────────
    // These skills are loaded in full into the system prompt every turn
    // — no load_skill call needed. Used for baseline knowledge (style,
    // persona, project glossary) the agent should apply unconditionally.
    const alwaysActiveSkills = await loadAlwaysActiveSkills(
      this.env as { DB: D1Database; SKILLS?: R2Bucket },
      userId,
    )
    const baselineBlock = alwaysActiveSkills.length > 0
      ? alwaysActiveSkills
          .map((s) => `### Skill: ${s.name}\n\n${s.body.trim()}`)
          .join('\n\n---\n\n')
      : null

    // ─── 8c. Knowledge — always-active bodies + on-demand catalog ───
    // Mirrors 8a/8b for skills. Long-form reference docs marked
    // injectionMode='always' are baked in full into the system prompt;
    // injectionMode='on_demand' docs only show their title+summary in
    // a catalog so the agent can decide whether to call knowledge_search
    // → load_knowledge for the body.
    // Validate `effectiveProjectId` against project ownership before
    // passing to the knowledge loaders. Otherwise a stale chat created
    // under a project the user has lost access to could still pull in
    // that project's docs.
    let safeProjectId: string | null = null
    if (effectiveProjectId) {
      try {
        const dForProject = drizzle(this.env.DB)
        const [own] = await dForProject
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, effectiveProjectId), eq(projects.userId, userId)))
          .limit(1)
        if (own) safeProjectId = effectiveProjectId
      } catch {
        // ignore — leaves safeProjectId null
      }
    }

    let alwaysKnowledgeResult: Awaited<ReturnType<typeof loadAlwaysActiveKnowledge>> = {
      docs: [],
      truncated: null,
    }
    let knowledgeCatalog: Awaited<ReturnType<typeof listKnowledgeCatalog>> = []
    try {
      alwaysKnowledgeResult = await loadAlwaysActiveKnowledge(
        this.env.DB,
        userId,
        safeProjectId,
        null, // org scope — Phase 5
      )
      knowledgeCatalog = await listKnowledgeCatalog(
        this.env.DB,
        userId,
        safeProjectId,
        null,
      )
    } catch (err) {
      console.error(
        JSON.stringify({ event: 'knowledge_load_failed', error: String(err) }),
      )
    }
    const alwaysKnowledge = alwaysKnowledgeResult.docs
    const knowledgeTruncationNotice = alwaysKnowledgeResult.truncated
      ? `_Note: ${alwaysKnowledgeResult.truncated.count} always-active doc(s) (~${alwaysKnowledgeResult.truncated.tokensSkipped.toLocaleString()} tokens) were omitted to stay under the 50K-token system-prompt cap._`
      : null
    const knowledgeBlock = alwaysKnowledge.length > 0
      ? alwaysKnowledge
          .map((k) => `### ${k.title}\n\n${k.body.trim()}`)
          .join('\n\n---\n\n')
      : null
    const knowledgeCatalogBlock = knowledgeCatalog.length > 0
      ? knowledgeCatalog
          .map((k) => `- **${k.title}** (id: ${k.id}): ${k.summary}`)
          .join('\n')
      : null

    // ─── 9. Chat preferences (per-user prompt block) ─────────────────
    const chatPrefs = await loadChatPreferences(this.env.DB, userId)
    const prefsBlock = chatPrefs ? formatChatPreferences(chatPrefs) : null

    // ─── 10. Assemble system prompt extra sections ───────────────────
    // Order matters for prompt-cache reuse + agent priority:
    //   1. Active Skills  (baseline always-on procedures)
    //   2. Active Knowledge  (baseline always-on reference material)
    //   3. Available Skills  (on-demand procedure catalog)
    //   4. Available Knowledge  (on-demand reference catalog)
    //   5. User Preferences
    //   6. Project instructions
    //   7. Memory
    //
    // Active sections go FIRST so the agent reads its baseline before
    // deciding what else it needs.
    const extraSections: Record<string, string> = {}
    if (baselineBlock) {
      extraSections['Active Skills'] = [
        'These skills are always active for this conversation. Apply them throughout — you do not need to call load_skill for any of them.',
        '',
        baselineBlock,
      ].join('\n')
    }
    if (knowledgeBlock) {
      extraSections['Active Knowledge'] = [
        'These reference documents are always available. Apply them whenever relevant — you do not need to call load_knowledge for any of them.',
        '',
        knowledgeBlock,
        ...(knowledgeTruncationNotice ? ['', knowledgeTruncationNotice] : []),
      ].join('\n')
    }
    if (skillsCatalog) {
      extraSections['Available Skills'] = [
        'Before answering, scan the skills below and load any that match the user\'s task. Specialist work (research, drafting, code review, document analysis, data extraction, comparing options, planning) almost always has a matching skill — call load_skill FIRST rather than improvising. If no skill matches, proceed normally.',
        '',
        'load_skill returns a <skill_content> block with full instructions; follow it, and use fs tools to read any listed resources on demand.',
        '',
        skillsCatalog,
      ].join('\n')
    }
    if (knowledgeCatalogBlock) {
      extraSections['Available Knowledge'] = [
        "Reference documents available on demand. When the user asks about a topic these cover, call knowledge_search(query) to confirm relevance, then load_knowledge(id) to fetch the body. Prefer this over guessing — the answer is often in the KB already.",
        '',
        knowledgeCatalogBlock,
      ].join('\n')
    }
    if (prefsBlock) {
      extraSections['User Preferences'] = prefsBlock
    }
    if (project?.systemPrompt) {
      const header = project.name ? `Project: ${project.name}` : 'Project instructions'
      extraSections['Project instructions'] = `${header}\n\n${project.systemPrompt}`
    }

    // ─── 11. Memory injection (best-effort) ──────────────────────────
    try {
      const { loadMemoryIndex, formatMemoryBlock } = await import(
        '@/server/modules/memories/inject'
      )
      const memoryIndex = await loadMemoryIndex({
        db: this.env.DB,
        userId,
        // Use the ownership-validated id — same defence-in-depth as
        // applied to knowledge in section 8c, so a stale chat under a
        // revoked project can't pull that project's memories either.
        projectId: safeProjectId,
      })
      const memoryBlock = formatMemoryBlock(memoryIndex)
      if (memoryBlock) {
        extraSections['Memory'] = memoryBlock
      }
    } catch (err) {
      console.error(JSON.stringify({ event: 'memory_injection_failed', error: String(err) }))
    }

    // ─── 12. Build the system prompt (static-vs-dynamic split) ──────
    // `instructions` is the cacheable system field — same byte-for-byte
    // turn-to-turn, so Anthropic's prompt cache hits. `dynamicPreamble`
    // (current date/time) goes into a synthetic context block at the
    // start of the latest user message instead, keeping the cache key
    // stable. Pre-fix this was inlined into the system prompt and
    // poisoned the cache every minute.
    const { system: instructions, dynamic: dynamicPreamble } =
      buildCacheableSystemPrompt({
        baseInstructions: 'You are a helpful assistant.',
        user: { name: userRecord.name ?? undefined, email: userRecord.email, role: userRecord.role },
        currentDate: true,
        timezone: 'Australia/Sydney',
        extra: Object.keys(extraSections).length > 0 ? extraSections : undefined,
      })

    // ─── 13. Build toolset (chat tools + env-MCP + per-user MCP) ─────
    let tools: ToolSet = {}
    let mcpCleanup: (() => Promise<void>) | undefined

    const agentCtx: CanonicalAgentContext = {
      env: this.env as unknown as Record<string, unknown>,
      userId,
      user: userRecord,
      projectId: effectiveProjectId ?? null,
      model: {
        id: modelId,
        provider: 'other',
        supportsVision: modelConfig?.supportsVision ?? false,
        supportsTools: modelConfig?.supportsTools ?? true,
      },
      telemetry: nullTelemetry,
    }

    if (modelConfig?.supportsTools) {
      const chatTools = await buildChatTools(agentCtx, {
        availableSkillNames: availableSkills.map((s) => s.name),
      })
      const { tools: mcpTools, cleanup: envCleanup } = await getMCPTools(
        this.env as unknown as Record<string, unknown>,
      )
      const { getUserMcpTools } = await import('@/server/lib/ai/user-mcp')
      const userMcp = await getUserMcpTools(
        this.env as unknown as Parameters<typeof getUserMcpTools>[0],
        userId,
      )
      mcpCleanup = async () => {
        await envCleanup()
        await userMcp.cleanup()
      }
      tools = { ...chatTools, ...mcpTools, ...userMcp.tools } as ToolSet

      // Tool Search — inject `find_tools` and gate the rest behind it.
      const searchCatalog: SearchableTool[] = Object.entries(tools).map(([name, tool]) => ({
        name,
        description:
          typeof tool === 'object' && tool && 'description' in tool && typeof tool.description === 'string'
            ? tool.description
            : name,
      }))
      const findTools = buildFindToolsTool(searchCatalog)
      tools['find_tools'] = toAiSdkTool(
        findTools as unknown as Parameters<typeof toAiSdkTool>[0],
        agentCtx,
      )
      const listTools = buildListToolsTool(searchCatalog)
      tools['list_tools'] = toAiSdkTool(
        listTools as unknown as Parameters<typeof toAiSdkTool>[0],
        agentCtx,
      )
    }

    // ─── 14. Places-tool nudge ──────────────────────────────────────
    // Pair places_search with show_map for a proper map+cards UI.
    const hasPlacesTool = Object.keys(tools).some((t) => {
      const lower = t.toLowerCase()
      return lower === 'places_search' || lower.includes('google_local_places') || lower === 'places'
    })
    let finalInstructions = instructions
    if (hasPlacesTool) {
      finalInstructions += `\n\n## Local business answers\n\nWhen the user asks for local businesses, shops, wreckers, venues, or any places with a location, follow this flow:\n1. Call the places search tool (prefer \`places_search\` when available) with a specific query that includes the suburb/city.\n2. Pass the returned places (top 3-8) to the \`show_map\` tool — include name, lat, lng, address, phone, website, rating, reviewCount, type.\n3. Write a short 1-2 sentence intro above the map ("Best bet first: X specialises in Y"). Do not repeat every business in prose — the map cards already show it.`
    }

    // ─── 15. Provider options (Anthropic prompt caching) ────────────
    const isAnthropic = modelId.includes('anthropic/') || modelId.startsWith('claude-')
    const providerOptions = isAnthropic
      ? {
          openrouter: { cache_control: { type: 'ephemeral' as const } },
          anthropic: { cacheControl: { type: 'ephemeral' as const } },
        }
      : undefined

    // ─── 16. prepareStep — token budget + tool gating ───────────────
    const budgetCheck = tokenBudgetPrepareStep({ maxTotalTokens: 50000 })
    // The AI SDK passes a richer opts object than either helper consumes
    // — both `tokenBudgetPrepareStep` (reads `steps[].usage`) and
    // `computeActiveTools` (reads `messages` + `steps[].toolCalls`) take
    // structural subsets. Wide cast keeps the TS surface honest at the
    // call-site rather than fighting overlapping structural signatures.
    const prepareStep = (opts: any) => {
      try {
        const budgetResult = budgetCheck(opts) as PrepareStepResult
        if (
          budgetResult &&
          'activeTools' in budgetResult &&
          Array.isArray(budgetResult.activeTools) &&
          budgetResult.activeTools.length === 0
        ) {
          return budgetResult
        }
        const discovered = extractDiscoveredToolNames(
          opts.steps as Parameters<typeof extractDiscoveredToolNames>[0],
        )
        const activeTools = computeActiveTools(tools, opts.messages, opts.steps, {
          coreToolNames: CORE_TOOL_NAMES,
          discoveredToolNames: discovered,
        })
        if (activeTools.length !== Object.keys(tools).length) {
          return { activeTools } as PrepareStepResult
        }
        return {}
      } catch {
        // Fail open — never crash the loop on a prepareStep bug.
        return {}
      }
    }

    // ─── 17. Validate UI messages against current tool schemas ──────
    // Handles schema drift (a tool was renamed / removed since the
    // history was persisted). On validation failure we fall back to
    // the unvalidated trimmed array so the model still sees something.
    let validatedMessages: UIMessage[] = trimmedMessages
    try {
      const validation = await safeValidateUIMessages({
        messages: trimmedMessages,
        tools: tools as any,
      })
      if (validation.success) {
        validatedMessages = validation.data as UIMessage[]
      }
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: 'chat_validate_ui_messages_failed',
          conversationId,
          error: String(err),
        }),
      )
    }

    // ─── 18. streamText — the actual model call ─────────────────────
    // Dynamic preamble (date/time) goes in front of the messages array
    // as a system-role message. This keeps the cached `system` field
    // byte-stable across turns. Without this split, the date string
    // changing per minute breaks every prompt-cache lookup.
    const prunedMessages = pruneMessages({
      messages: await convertToModelMessages(validatedMessages),
      toolCalls: 'before-last-2-messages',
      reasoning: 'before-last-message',
    })
    const messagesWithPreamble = dynamicPreamble
      ? [{ role: 'system' as const, content: dynamicPreamble }, ...prunedMessages]
      : prunedMessages
    const result = streamText({
      abortSignal: options?.abortSignal,
      model,
      system: finalInstructions,
      messages: messagesWithPreamble,
      tools,
      stopWhen: modelConfig?.supportsTools
        ? [stepCountIs(5), hasToolCall('done')]
        : stepCountIs(1),
      maxOutputTokens: modelConfig?.defaultMaxTokens ?? 16384,
      providerOptions,
      prepareStep: prepareStep as any,
      // Single-retry repair logs the parse failure and returns null,
      // which tells the SDK to surface the original error. Same
      // behaviour as the legacy buildChatAgent — we don't yet retry
      // via another LLM call (cost concern).
      experimental_repairToolCall: async ({ toolCall, error }) => {
        console.log(
          JSON.stringify({
            event: 'tool_call_repair',
            userId,
            model: modelId,
            toolName: toolCall.toolName,
            errorName: error instanceof Error ? error.name : 'UnknownError',
            errorMessage: error instanceof Error ? error.message : String(error),
          }),
        )
        return null
      },
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'chat-agent',
        metadata: { userId, model: modelId },
      },
      experimental_transform: smoothStream({ chunking: 'word' }),
      onStepFinish: async (stepResult) => {
        // Per-step telemetry — one row per tool call. Powers the
        // admin "Recent tool errors" strip and reliability dashboards.
        const { toolCalls, toolResults, usage } = stepResult
        // Step number isn't on the StepResult shape directly in v6 —
        // we don't index by it any more. Default to 0 for the column.
        const stepNumber = 0
        if (!toolCalls || toolCalls.length === 0) return
        try {
          const db = drizzle(this.env.DB)
          const rows = toolCalls.map((tc) => {
            const result = toolResults?.find((tr) => tr.toolCallId === tc.toolCallId)
            const toolError =
              result && 'output' in result === false && 'error' in result
                ? String((result as { error: unknown }).error)
                : null
            return {
              userId,
              model: modelId,
              stepIndex: stepNumber,
              toolName: tc.toolName,
              toolDurationMs: null,
              toolError,
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              costUsd: costFor(modelId, usage.inputTokens ?? 0, usage.outputTokens ?? 0),
            }
          })
          await db.insert(aiToolCalls).values(rows)
          const errored = rows.filter((r) => r.toolError)
          if (errored.length > 0) {
            console.log(
              JSON.stringify({
                event: 'tool_error',
                stepIndex: stepNumber,
                userId,
                model: modelId,
                conversationId,
                errors: errored.map((r) => ({ tool: r.toolName, error: r.toolError })),
              }),
            )
          }
        } catch (err) {
          console.error(
            JSON.stringify({ event: 'step_finish_telemetry_error', error: String(err) }),
          )
        }
      },
      onFinish: async ({ usage }) => {
        // Clean up MCP connections (env + per-user).
        if (mcpCleanup) {
          try {
            await mcpCleanup()
          } catch (err) {
            console.error(
              JSON.stringify({ event: 'mcp_cleanup_failed', error: String(err) }),
            )
          }
        }

        // Aggregate token usage row. Per-step rows in aiToolCalls; this
        // is the per-turn parent.
        try {
          const db = drizzle(this.env.DB)
          const inputTokens = usage.inputTokens ?? 0
          const outputTokens = usage.outputTokens ?? 0
          await db.insert(aiUsageLogs).values({
            userId,
            model: modelId,
            promptTokens: inputTokens,
            completionTokens: outputTokens,
            totalTokens: inputTokens + outputTokens,
            durationMs: Date.now() - startTime,
            costUsd: costFor(modelId, inputTokens, outputTokens),
          })
        } catch (err) {
          console.error('Failed to log AI usage:', err)
        }
      },
    })

    // ─── 19. Stream the response — UIMessage protocol ───────────────
    return result.toUIMessageStreamResponse({
      sendReasoning: true,
      sendSources: true,
      generateMessageId: () => crypto.randomUUID(),
      messageMetadata: ({ part }) => {
        if (part.type === 'finish') {
          return {
            conversationId,
            model: modelId,
            inputTokens: part.totalUsage?.inputTokens,
            outputTokens: part.totalUsage?.outputTokens,
            durationMs: Date.now() - startTime,
          } as Record<string, unknown>
        }
        return undefined
      },
      onError: (error) => {
        // Stack goes to Workers Logs only; client gets a sanitised string.
        console.error(
          JSON.stringify({
            event: 'chat_stream_error',
            userId,
            model: modelId,
            conversationId,
            error:
              error instanceof Error
                ? { name: error.name, message: error.message, stack: error.stack }
                : String(error),
          }),
        )
        return sanitiseStreamError(error)
      },
    })
  }

  /**
   * Fires AFTER turn completion. The SDK has already persisted messages
   * to DO SQLite. Our job:
   *   - Project all current messages to D1 `conversation_messages` so
   *     cross-module readers (Spaces global search, Projects, Memories,
   *     Admin tools) see them. `saveChat` is idempotent — only NEW
   *     message ids get inserted.
   *   - On first-turn completion: auto-title + reactive memory trigger.
   */
  protected override async onChatResponse(result: ChatResponseResult): Promise<void> {
    const { userId, conversationId } = this.resolveSession()

    // Project to D1. Best-effort — D1 projection is a read-cache for
    // other modules; the DO is authoritative. Failure here doesn't break
    // the chat experience.
    try {
      const storage = createD1ChatStorage(this.env.DB)
      await storage.saveChat({ conversationId, messages: this.messages as UIMessage[] })
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'chat_d1_projection_failed',
          conversationId,
          error: String(err),
        }),
      )
    }

    // First-turn side effects — only run on a clean completion.
    if (
      result.status === 'completed' &&
      !result.continuation &&
      this.messages.filter((m) => m.role === 'user').length === 1
    ) {
      // Auto-title — fire-and-forget. The sidebar query picks it up on
      // next render.
      this.ctx
        .waitUntil(
          autoTitleConversation(this.env, conversationId, userId, this.messages as UIMessage[]),
        )

      // Reactive memory trigger (Phase 3 v2). Looks at the prior
      // conversation in this scope and queues memory extraction.
      try {
        const { triggerPriorConversationMemoryExtraction } = await import(
          '@/server/modules/memories/triggers'
        )
        const storage = createD1ChatStorage(this.env.DB)
        const projectId = await storage.getProjectId(conversationId, userId)
        const task = triggerPriorConversationMemoryExtraction({
          env: this.env as unknown as { DB: D1Database; AI: Ai },
          userId,
          currentConversationId: conversationId,
          projectId: projectId ?? null,
        })
        try {
          this.ctx.waitUntil(task)
        } catch {
          await task
        }
      } catch (err) {
        console.warn(
          JSON.stringify({ event: 'memory_reactive_trigger_failed', error: String(err) }),
        )
      }
    }
  }
}
