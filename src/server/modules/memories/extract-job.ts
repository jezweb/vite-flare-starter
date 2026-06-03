/**
 * Memory extraction job — Phase 3 v2.
 *
 * Reads a finished conversation + the user's current memory index and
 * produces a structured set of proposed updates: refined title, free-form
 * tags, and memory adds/updates/removes scoped to project | user | org.
 *
 * The job itself is pure — it returns a proposal. Application of the
 * proposal (auto-apply vs queue for approval) lives in `apply-updates.ts`
 * and is driven by `memoryUpdateMode` per scope.
 *
 * Three triggers fire this job (see Phase 3 plan):
 *   1. Reactive — chat onFinish for new conversations checks the prior
 *      conversation in the same scope and queues this job via waitUntil.
 *   2. Cron — idle-timeout sweep every 15 min picks up conversations
 *      that haven't been processed but haven't seen new traffic in 30+ min.
 *   3. Manual — POST /api/memories/regenerate runs synchronously.
 *
 * Failure mode: schema validation retries once with a stricter prompt,
 * then logs and skips. Memory is best-effort — the chat flow never blocks
 * on it. Conversation `memoryProcessedAt` only gets set on success or
 * explicit reject so the cron will re-attempt transient failures.
 */
import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { conversations, conversationMessages } from '@/server/modules/conversations/db/schema'
import { memories, MEMORY_TYPES } from './db/schema'
import { coerceToString } from '@/server/lib/ai/coerce'

// Default extraction model — Workers AI free tier. Gemma 4 26B handles
// nested-enum schemas reliably (see workers-ai-structured-output rule).
const EXTRACTION_MODEL = '@cf/google/gemma-4-26b-a4b-it'

// ─── Schemas ──────────────────────────────────────────────────────────

const MemoryUpdateSchema = z.object({
  scope: z.enum(['project', 'user']),
  action: z.enum(['add', 'update', 'remove']),
  /** Slug — required for add and remove (lookup key). For update, identifies via targetMemoryId. */
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(200),
  type: z.enum(MEMORY_TYPES),
  /** Body. Required for add and update. Empty string ok for remove. */
  content: z.string().max(8000).default(''),
  /** Memory id for action=update — must match an existing entry in the same scope. */
  targetMemoryId: z.string().uuid().optional(),
  /** When true, the memory is flagged sensitive and excluded from auto-injection. */
  isPrivate: z.boolean().optional(),
  /** Why the model proposed this — surfaced in the approval card. */
  reason: z.string().max(300).optional(),
})

export const ExtractionResultSchema = z.object({
  refinedTitle: z.string().max(80).optional(),
  tags: z.array(z.string().min(1).max(40)).max(5).default([]),
  memoryUpdates: z.array(MemoryUpdateSchema).max(8).default([]),
})

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>
export type MemoryUpdate = z.infer<typeof MemoryUpdateSchema>

// ─── Public entry point ───────────────────────────────────────────────

export interface ExtractInput {
  /** D1 binding. */
  db: D1Database
  /** Workers AI binding. */
  ai: Ai
  /** Conversation to process. */
  conversationId: string
  /** Owner — used to look up user-scope memories and to scope the writes. */
  userId: string
}

export interface ExtractOutput {
  ok: boolean
  /** Set when ok=true and the job produced anything actionable. */
  result?: ExtractionResult
  /** When ok=false, the reason. */
  error?: string
  /** Conversation metadata captured by the job — needed by the apply step. */
  meta: {
    projectId: string | null
    currentTitle: string | null
    messageCount: number
  }
}

/**
 * Run the extraction job for a single conversation.
 *
 * Steps:
 *   1. Load conversation row + first ~30 messages (input cap)
 *   2. Skip if messageCount < 3 (too short to learn from)
 *   3. Load current user-scope memories (and project-scope if applicable)
 *      so the model can propose updates relative to existing entries
 *   4. Call Workers AI with structured-output schema; one retry on parse fail
 *   5. Validate result; return for the caller to apply
 */
export async function extractMemoryFromConversation(input: ExtractInput): Promise<ExtractOutput> {
  const { db, ai, conversationId, userId } = input
  const d = drizzle(db)

  // 1. Conversation row
  const [conv] = await d
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1)

  if (!conv) {
    return {
      ok: false,
      error: 'conversation_not_found',
      meta: { projectId: null, currentTitle: null, messageCount: 0 },
    }
  }

  // 2. Messages
  const msgRows = await d
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(conversationMessages.createdAt)

  const meta = {
    projectId: conv.projectId,
    currentTitle: conv.title,
    messageCount: msgRows.length,
  }

  if (msgRows.length < 3) {
    return { ok: false, error: 'too_short', meta }
  }

  // 3. Build context — user memories + project memories (overview only)
  const userMems = await d
    .select({
      id: memories.id,
      name: memories.name,
      description: memories.description,
      type: memories.type,
    })
    .from(memories)
    .where(and(eq(memories.scope, 'user'), eq(memories.scopeId, userId)))

  const projectMems = conv.projectId
    ? await d
        .select({
          id: memories.id,
          name: memories.name,
          description: memories.description,
          type: memories.type,
        })
        .from(memories)
        .where(and(eq(memories.scope, 'project'), eq(memories.scopeId, conv.projectId)))
    : []

  // 4. Render conversation transcript — cap at ~10K chars total.
  const transcript = renderTranscript(msgRows)

  // 5. Call the model with structured output. One retry on validation fail.
  const systemPrompt = buildSystemPrompt({ userMems, projectMems, hasProject: !!conv.projectId })
  const userPrompt = buildUserPrompt({ transcript, currentTitle: conv.title })

  let attempt = 0
  while (attempt < 2) {
    attempt += 1
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any = await ai.run(EXTRACTION_MODEL, {
        messages: [
          {
            role: 'system',
            content:
              attempt === 1
                ? systemPrompt
                : `${systemPrompt}\n\nIMPORTANT: Reply with ONLY a JSON object matching the schema. No prose, no code fence.`,
          },
          { role: 'user', content: userPrompt },
        ],
        // Don't cap output tokens — see workers-ai-structured-output rule
      } as never)

      const text = coerceToString(raw)
      const json = extractJsonBlock(text)
      const parsed = ExtractionResultSchema.safeParse(json)
      if (!parsed.success) {
        if (attempt === 2) {
          console.warn(
            JSON.stringify({
              event: 'memory_extract_schema_fail',
              conversationId,
              error: parsed.error.message,
              sample: text.slice(0, 200),
            })
          )
          return { ok: false, error: 'schema_validation_failed', meta }
        }
        continue
      }

      // Validation pass-through. Do NOT clip the action; the apply step
      // decides what actually happens (auto vs queue) based on the user's
      // memoryUpdateMode for the scope.
      return { ok: true, result: parsed.data, meta }
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: 'memory_extract_call_fail',
          conversationId,
          attempt,
          error: err instanceof Error ? err.message : String(err),
        })
      )
      if (attempt === 2) return { ok: false, error: 'model_call_failed', meta }
    }
  }

  return { ok: false, error: 'unreachable', meta }
}

// ─── Helpers ──────────────────────────────────────────────────────────

const TRANSCRIPT_CHAR_BUDGET = 10_000

function renderTranscript(rows: Array<typeof conversationMessages.$inferSelect>): string {
  // Keep latest-N to stay within budget. For short chats this is everything.
  const lines: string[] = []
  for (const row of rows) {
    let parts: unknown[]
    try {
      parts = typeof row.parts === 'string' ? JSON.parse(row.parts) : (row.parts as unknown[])
      if (!Array.isArray(parts)) parts = []
    } catch {
      parts = []
    }
    const textBits: string[] = []
    for (const p of parts) {
      if (!p || typeof p !== 'object') continue
      const part = p as Record<string, unknown>
      if (part['type'] === 'text' && typeof part['text'] === 'string') {
        textBits.push(part['text'] as string)
      }
    }
    const text = textBits.join('\n').trim()
    if (!text) continue
    lines.push(`${row.role.toUpperCase()}: ${text}`)
  }

  // Truncate from the start if over budget — keep most recent context.
  let combined = lines.join('\n\n')
  if (combined.length > TRANSCRIPT_CHAR_BUDGET) {
    combined = `[…earlier messages truncated…]\n\n${combined.slice(combined.length - TRANSCRIPT_CHAR_BUDGET)}`
  }
  return combined
}

interface MemRef {
  id: string
  name: string
  description: string
  type: string
}

function buildSystemPrompt(input: {
  userMems: MemRef[]
  projectMems: MemRef[]
  hasProject: boolean
}): string {
  const userIndex =
    input.userMems.length === 0
      ? '(no entries yet)'
      : input.userMems
          .map((m) => `- id=${m.id} name="${m.name}" type=${m.type} — ${m.description}`)
          .join('\n')

  const projectIndex = !input.hasProject
    ? '(no active project)'
    : input.projectMems.length === 0
      ? '(no entries yet)'
      : input.projectMems
          .map((m) => `- id=${m.id} name="${m.name}" type=${m.type} — ${m.description}`)
          .join('\n')

  return `You analyse a chat between a user and an AI assistant, then propose three things:

1. A refined title (only if the current one is generic like "New conversation"; otherwise omit)
2. Up to 5 short tags describing what the conversation was about
3. Memory updates — facts, preferences, decisions worth remembering for future chats

You return a JSON object only. No prose.

CURRENT USER MEMORY INDEX:
${userIndex}

CURRENT PROJECT MEMORY INDEX:
${projectIndex}

MEMORY SCOPES:
- "user" — facts about the human (preferences, role, recurring needs). Use this for things that are true about them across all projects.
- "project" — context specific to this project (only available when an active project exists). Use for goals, conventions, ongoing work.

ACTIONS:
- "add" — propose a new memory entry. Use a stable kebab-case slug as name. Description is a one-line index hook (max 200 chars).
- "update" — refine an existing entry. MUST include targetMemoryId from the index above. Provide the full new content.
- "remove" — delete an existing entry that is now stale. MUST include targetMemoryId. Set content to "".

QUALITY BAR:
- Be specific — capture real facts, not platitudes.
- Skip noise — single-shot questions ("what's the weather") aren't memorable.
- Group by scope — broad user traits go to user, project-specific to project.
- Sensitive data (account numbers, credentials, financial details) → set isPrivate=true.
- Prefer 0-3 updates per conversation. More than that is usually noise.
- "reason" is a one-line justification (max 300 chars) shown to the user when they review the proposal.

OUTPUT SCHEMA:
{
  "refinedTitle": string?,            // optional, max 80 chars
  "tags": string[],                   // 0-5 entries, each 1-40 chars
  "memoryUpdates": [
    {
      "scope": "project" | "user",
      "action": "add" | "update" | "remove",
      "name": string,                 // required, 1-80 chars
      "description": string,          // required, 1-200 chars
      "type": "fact" | "preference" | "decision" | "context" | "reference",
      "content": string,              // required for add/update, empty string for remove
      "targetMemoryId": string?,      // required for update/remove, must match index above
      "isPrivate": boolean?,          // default false
      "reason": string?               // optional, max 300 chars
    }
  ]
}

Reply with ONLY the JSON object.`
}

function buildUserPrompt(input: { transcript: string; currentTitle: string | null }): string {
  const titleBlock = input.currentTitle ? `Current title: "${input.currentTitle}"\n\n` : ''
  return `${titleBlock}Transcript:\n\n${input.transcript}`
}

/**
 * Robust JSON extraction — strip markdown code fences and surrounding
 * prose, find the outermost {…}, parse it. Workers AI models often add
 * narrative around the JSON despite "reply only with JSON" instructions.
 */
function extractJsonBlock(text: string): unknown {
  const trimmed = text.trim()
  // Try direct parse first
  try {
    return JSON.parse(trimmed)
  } catch {
    // fall through
  }
  // Strip markdown fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i)
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1])
    } catch {
      // fall through
    }
  }
  // Find outermost balanced braces
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const slice = trimmed.slice(start, end + 1)
    try {
      return JSON.parse(slice)
    } catch {
      // fall through
    }
  }
  return null
}
