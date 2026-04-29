/**
 * Memory update applier — Phase 3 v2.
 *
 * Takes the structured proposal from extract-job.ts and applies it,
 * branching per scope on the user's `memoryUpdateMode`:
 *
 *   - 'never' → skip the scope entirely
 *   - 'auto'  → apply directly to the memories table
 *   - 'ask'   → enqueue a row in pending_approvals; approve route picks
 *               this up via the synthetic agentClass='memory_extraction'
 *               handler in approvals/routes.ts
 *
 * Title refinement and tags are low-risk and ALWAYS apply directly,
 * regardless of mode (per Extension E commentary in the plan: "auto-tagging
 * could become an approval too — but we judge it low-risk and skip the
 * approval"). Memory removals always queue, even in auto-mode, since
 * destructive actions deserve human review.
 *
 * The conversation row gets `memoryProcessedAt = now()` once everything
 * has been routed (whether applied directly or queued). Setting it
 * prevents the cron from re-attempting.
 */
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { conversations } from '@/server/modules/conversations/db/schema'
import { projects } from '@/server/modules/projects/db/schema'
import { user } from '@/server/modules/auth/db/schema'
import { memories } from './db/schema'
import { pendingApprovals } from '@/server/modules/approvals/db/schema'
import type { ExtractionResult, MemoryUpdate } from './extract-job'

export interface ApplyInput {
  db: D1Database
  userId: string
  conversationId: string
  projectId: string | null
  result: ExtractionResult
  /** When true, an existing conversation title is "generic" and may be replaced. Caller decides. */
  allowTitleReplace?: boolean
}

export interface ApplyOutput {
  /** How many updates went through immediately (auto-mode or low-risk paths). */
  applied: number
  /** How many were queued to pending_approvals for human review. */
  queued: number
  /** How many were skipped because the scope is set to 'never'. */
  skipped: number
  /** How many low-risk artefacts (title, tags) were written. */
  metadataApplied: number
}

const SYNTHETIC_AGENT_CLASS = 'memory_extraction'

export async function applyExtractionResult(
  input: ApplyInput,
): Promise<ApplyOutput> {
  const { db, userId, conversationId, projectId, result, allowTitleReplace } = input
  const d = drizzle(db)
  const out: ApplyOutput = { applied: 0, queued: 0, skipped: 0, metadataApplied: 0 }

  // 1. Title (only if allowed and a new one was provided)
  if (allowTitleReplace && result.refinedTitle && result.refinedTitle.trim().length >= 3) {
    await d
      .update(conversations)
      .set({ title: result.refinedTitle.trim().slice(0, 80) })
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    out.metadataApplied += 1
  }

  // 2. Tags — always replace, JSON array. Capped at 5 by schema.
  if (result.tags && result.tags.length > 0) {
    const cleanTags = result.tags
      .map((t) => t.trim().toLowerCase().slice(0, 40))
      .filter((t) => t.length > 0)
      .slice(0, 5)
    if (cleanTags.length > 0) {
      await d
        .update(conversations)
        .set({ tags: JSON.stringify(cleanTags) })
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
      out.metadataApplied += 1
    }
  }

  // 3. Memory updates — branch per scope on memoryUpdateMode
  // Resolve modes ONCE per scope to avoid N round-trips.
  const userMode = await loadUserMode(d, userId)
  const projectMode = projectId ? await loadProjectMode(d, projectId) : null

  for (const update of result.memoryUpdates) {
    const mode = update.scope === 'user' ? userMode : projectMode
    if (mode === null) {
      // Project update with no active project — skip
      out.skipped += 1
      continue
    }
    if (mode === 'never') {
      out.skipped += 1
      continue
    }
    // Removes ALWAYS queue, even in auto mode (destructive)
    if (mode === 'auto' && update.action !== 'remove') {
      const ok = await applyOne(d, { update, userId, projectId, conversationId })
      if (ok) out.applied += 1
      else {
        // Apply failed (e.g. targetMemoryId missing) — fall back to queueing
        await queueOne(d, { update, userId, projectId, conversationId })
        out.queued += 1
      }
    } else {
      await queueOne(d, { update, userId, projectId, conversationId })
      out.queued += 1
    }
  }

  // 4. Mark conversation processed regardless — prevents re-attempt by cron.
  await d
    .update(conversations)
    .set({ memoryProcessedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))

  return out
}

// ─── Auto-apply ───────────────────────────────────────────────────────

interface OneInput {
  update: MemoryUpdate
  userId: string
  projectId: string | null
  conversationId: string
}

async function applyOne(
  d: ReturnType<typeof drizzle>,
  { update, userId, projectId, conversationId }: OneInput,
): Promise<boolean> {
  const scopeId = update.scope === 'user' ? userId : projectId
  if (!scopeId) return false

  if (update.action === 'add') {
    await d.insert(memories).values({
      scope: update.scope,
      scopeId,
      name: update.name,
      description: update.description,
      type: update.type,
      content: update.content,
      isPrivate: update.isPrivate ? 1 : 0,
      sourceConversationId: conversationId,
    })
    return true
  }

  if (update.action === 'update') {
    if (!update.targetMemoryId) return false
    // Verify the target exists in the same scope (defence in depth — the
    // model could hallucinate an id).
    const [existing] = await d
      .select({ id: memories.id })
      .from(memories)
      .where(
        and(
          eq(memories.id, update.targetMemoryId),
          eq(memories.scope, update.scope),
          eq(memories.scopeId, scopeId),
        ),
      )
      .limit(1)
    if (!existing) return false
    await d
      .update(memories)
      .set({
        name: update.name,
        description: update.description,
        type: update.type,
        content: update.content,
        ...(update.isPrivate !== undefined && { isPrivate: update.isPrivate ? 1 : 0 }),
        updatedAt: new Date(),
        // Bump source to the most recent producing conversation
        sourceConversationId: conversationId,
      })
      .where(eq(memories.id, update.targetMemoryId))
    return true
  }

  // 'remove' is excluded from auto-apply by the caller — but if we get
  // here, treat it as a no-op rather than crash.
  return false
}

// ─── Queue for approval ───────────────────────────────────────────────

async function queueOne(
  d: ReturnType<typeof drizzle>,
  { update, userId, projectId, conversationId }: OneInput,
): Promise<void> {
  // Build a one-line summary the queue UI shows. Title-case the
  // memory key so "tool-troubleshooting-preference" surfaces as "Tool
  // troubleshooting preference" in the user-facing inbox / dashboard /
  // approvals row instead of the raw slug.
  const verb = update.action === 'add' ? 'Add' : update.action === 'update' ? 'Update' : 'Remove'
  const scopeLabel = update.scope === 'user' ? 'user memory' : 'project memory'
  const friendlyKey = update.name
    ? update.name.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase())
    : '(unnamed)'
  const summary = `${verb} ${scopeLabel}: ${friendlyKey}`.slice(0, 500)

  // Payload preserves enough context to render a rich card and to apply
  // on approve. The conversationId lets the approval card link back to
  // the source conversation (provenance).
  const payload = {
    update,
    conversationId,
    projectId,
    userId,
  }

  await d.insert(pendingApprovals).values({
    userId,
    agentClass: SYNTHETIC_AGENT_CLASS,
    agentName: `${userId}:${update.scope}:${update.scope === 'user' ? userId : (projectId ?? '_none')}`,
    action: update.action,
    summary,
    payloadJson: JSON.stringify(payload),
  })
}

// ─── Mode lookups ─────────────────────────────────────────────────────

async function loadUserMode(
  d: ReturnType<typeof drizzle>,
  userId: string,
): Promise<'ask' | 'auto' | 'never'> {
  const [row] = await d
    .select({ memoryUpdateMode: user.memoryUpdateMode })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return (row?.memoryUpdateMode as 'ask' | 'auto' | 'never') ?? 'auto'
}

async function loadProjectMode(
  d: ReturnType<typeof drizzle>,
  projectId: string,
): Promise<'ask' | 'auto' | 'never'> {
  const [row] = await d
    .select({ memoryUpdateMode: projects.memoryUpdateMode })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  return (row?.memoryUpdateMode as 'ask' | 'auto' | 'never') ?? 'auto'
}

// ─── Approval-time handler ────────────────────────────────────────────

/**
 * Called by the approvals approve route when agentClass is the synthetic
 * 'memory_extraction'. Reads the queued payload and applies the update
 * exactly as it would in auto-mode.
 *
 * Optionally flips memoryUpdateMode to 'auto' on the scope when the user
 * clicked "Approve & always allow" — surfaced via `alwaysAllow=true` in
 * the (possibly user-edited) payload.
 */
export async function executeApprovedMemoryUpdate(
  db: D1Database,
  payload: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const d = drizzle(db)
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid payload' }
  const p = payload as Record<string, unknown>
  const update = p['update'] as MemoryUpdate | undefined
  const conversationId = typeof p['conversationId'] === 'string' ? (p['conversationId'] as string) : ''
  const projectId = typeof p['projectId'] === 'string' ? (p['projectId'] as string) : null
  const userId = typeof p['userId'] === 'string' ? (p['userId'] as string) : ''
  const alwaysAllow = p['alwaysAllow'] === true

  if (!update || !userId || !conversationId) return { ok: false, error: 'missing fields' }

  // Apply the update — same logic as auto path.
  if (update.action === 'remove') {
    if (!update.targetMemoryId) return { ok: false, error: 'remove requires targetMemoryId' }
    const scopeId = update.scope === 'user' ? userId : projectId
    if (!scopeId) return { ok: false, error: 'no scope id' }
    await d
      .delete(memories)
      .where(
        and(
          eq(memories.id, update.targetMemoryId),
          eq(memories.scope, update.scope),
          eq(memories.scopeId, scopeId),
        ),
      )
  } else {
    const ok = await applyOne(d, { update, userId, projectId, conversationId })
    if (!ok) return { ok: false, error: 'apply failed' }
  }

  // 3-way trust: flip to auto if the user clicked "Approve & always allow"
  if (alwaysAllow) {
    if (update.scope === 'user') {
      await d
        .update(user)
        .set({ memoryUpdateMode: 'auto' })
        .where(eq(user.id, userId))
    } else if (projectId) {
      await d
        .update(projects)
        .set({ memoryUpdateMode: 'auto' })
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    }
  }

  return { ok: true }
}

export const MEMORY_AGENT_CLASS = SYNTHETIC_AGENT_CLASS
