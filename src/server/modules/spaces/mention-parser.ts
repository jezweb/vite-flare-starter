/**
 * Mention parser — extract @-references from message parts.
 *
 * Two render shapes the client emits:
 *   1. Plain text: "hi @research can you summarise this?"
 *   2. Pill-aware:  parts include explicit `mention` parts with target
 *      data (preferred — survives copy/paste / search and lets the UI
 *      render avatars rather than text).
 *
 * Phase 1 supports BOTH shapes. The text path runs a simple regex
 * scan; the parts path is a typed pull. Either way we resolve handles
 * against the space's `conversation_members` table to get the target
 * (kind, agentClass, agentName, userId).
 *
 * Returned MentionRefs are deduped by handle — if a sender mentions
 * @research three times in one message, the dispatcher only invokes
 * the agent once.
 */
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { conversationMembers } from '@/server/modules/conversations/db/schema'

export interface MentionRef {
  /** The literal handle text including the @ ("@research"). */
  raw: string
  /** Just the handle ("research"). */
  handle: string
  kind: 'user' | 'agent'
  /** When kind='user' — null otherwise. */
  targetUserId: string | null
  /** When kind='agent' — null otherwise. */
  targetAgentClass: string | null
  targetAgentName: string | null
  /** Member row id for downstream audit / approval routing. */
  memberId: string
}

interface PartLike {
  type?: string
  text?: string
  data?: { handle?: string; userId?: string; agentName?: string }
}

const HANDLE_PATTERN = /(^|[\s,.;:!?])@([A-Za-z0-9_-]{1,32})\b/g

/**
 * Extract handles from a message's parts. Combines explicit pill
 * mentions (`type: 'mention'`) and inline @text scans. Returns at most
 * one MentionRef per unique handle.
 */
export async function parseMentions(
  db: D1Database,
  conversationId: string,
  parts: unknown[]
): Promise<MentionRef[]> {
  const handles = new Set<string>()
  const partList = Array.isArray(parts) ? (parts as PartLike[]) : []

  for (const part of partList) {
    if (!part || typeof part !== 'object') continue
    if (part.type === 'mention' && typeof part.data?.handle === 'string') {
      handles.add(stripAt(part.data.handle))
      continue
    }
    if (part.type === 'text' && typeof part.text === 'string') {
      let m: RegExpExecArray | null
      HANDLE_PATTERN.lastIndex = 0
      while ((m = HANDLE_PATTERN.exec(part.text))) {
        if (m[2]) handles.add(m[2])
      }
    }
  }

  if (handles.size === 0) return []

  // Resolve handles against this space's member rows. Single SELECT
  // pulls everyone (cheap — bounded room size) and avoids N round-trips.
  const d = drizzle(db)
  const members = await d
    .select({
      id: conversationMembers.id,
      kind: conversationMembers.kind,
      userId: conversationMembers.userId,
      agentClass: conversationMembers.agentClass,
      agentName: conversationMembers.agentName,
    })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))

  const refs: MentionRef[] = []
  for (const handle of handles) {
    const lower = handle.toLowerCase()
    const member = members.find((m) => {
      if (m.kind === 'agent') return (m.agentName ?? '').toLowerCase() === lower
      // Phase 1: plain @-text user mentions aren't resolved server-side
      // — the client emits a pill mention part with the explicit userId
      // when the user picks one from the autocomplete. Phase 2 will
      // introduce handle metadata on the user record so server-side
      // text scanning works for users too.
      return false
    })
    if (!member) continue
    refs.push({
      raw: `@${handle}`,
      handle,
      kind: member.kind as 'user' | 'agent',
      targetUserId: member.userId ?? null,
      targetAgentClass: member.agentClass ?? null,
      targetAgentName: member.agentName ?? null,
      memberId: member.id,
    })
  }

  // Also resolve pill mentions that carried userId or agentName
  // explicitly — these don't go through the handle map.
  for (const part of partList) {
    if (!part || part.type !== 'mention') continue
    const explicitUserId = part.data?.userId
    const explicitAgentName = part.data?.agentName
    if (explicitUserId) {
      const member = members.find((m) => m.kind === 'user' && m.userId === explicitUserId)
      if (member && !refs.some((r) => r.targetUserId === explicitUserId)) {
        refs.push({
          raw: '@user',
          handle: explicitUserId,
          kind: 'user',
          targetUserId: explicitUserId,
          targetAgentClass: null,
          targetAgentName: null,
          memberId: member.id,
        })
      }
      continue
    }
    if (explicitAgentName) {
      const member = members.find(
        (m) =>
          m.kind === 'agent' &&
          (m.agentName ?? '').toLowerCase() === explicitAgentName.toLowerCase()
      )
      if (member && !refs.some((r) => r.targetAgentName === explicitAgentName)) {
        refs.push({
          raw: `@${explicitAgentName}`,
          handle: explicitAgentName,
          kind: 'agent',
          targetUserId: null,
          targetAgentClass: member.agentClass ?? null,
          targetAgentName: member.agentName ?? null,
          memberId: member.id,
        })
      }
    }
  }

  return refs
}

function stripAt(s: string): string {
  return s.startsWith('@') ? s.slice(1) : s
}
