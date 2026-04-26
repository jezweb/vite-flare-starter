/**
 * Memory injection helper.
 *
 * Composes a system-prompt fragment from the user's user-scope and (optionally)
 * the active project's project-scope memories. Uses the progressive-disclosure
 * pattern: only the index (name + description) is loaded into the prompt.
 * The agent can fetch full content on demand via the `load_memory` tool.
 *
 * Privacy: rows with is_private = 1 are EXCLUDED from injection. They are
 * only available via explicit load_memory(name) calls.
 */
import { drizzle } from 'drizzle-orm/d1'
import { eq, and } from 'drizzle-orm'
import type { D1Database } from '@cloudflare/workers-types'
import { memories } from './db/schema'

export interface MemoryIndexEntry {
  id: string
  name: string
  description: string
  type: string
}

export interface MemoryIndexBuckets {
  user: MemoryIndexEntry[]
  project: MemoryIndexEntry[]
  org: MemoryIndexEntry[]
}

export async function loadMemoryIndex({
  db,
  userId,
  projectId,
}: {
  db: D1Database
  userId: string
  projectId: string | null
}): Promise<MemoryIndexBuckets> {
  const d = drizzle(db)

  // User memories — always private to the user, always loaded for that user.
  const userRows = await d
    .select({
      id: memories.id,
      name: memories.name,
      description: memories.description,
      type: memories.type,
    })
    .from(memories)
    .where(
      and(
        eq(memories.scope, 'user'),
        eq(memories.scopeId, userId),
        eq(memories.isPrivate, 0),
      ),
    )
    .limit(50)

  let projectRows: typeof userRows = []
  if (projectId) {
    projectRows = await d
      .select({
        id: memories.id,
        name: memories.name,
        description: memories.description,
        type: memories.type,
      })
      .from(memories)
      .where(
        and(
          eq(memories.scope, 'project'),
          eq(memories.scopeId, projectId),
          eq(memories.isPrivate, 0),
        ),
      )
      .limit(50)
  }

  // Org memories — Phase 5 wires the user's active org.
  const orgRows: typeof userRows = []

  return { user: userRows, project: projectRows, org: orgRows }
}

/**
 * Format the memory index as a system-prompt block. Returns an empty string
 * if there are no memories — caller can then skip injecting anything.
 */
export function formatMemoryBlock(index: MemoryIndexBuckets): string {
  const sections: string[] = []

  const renderBucket = (entries: MemoryIndexEntry[], label: string) => {
    if (entries.length === 0) return null
    return `### ${label}\n${entries
      .map((e) => `- ${e.name}: ${e.description}`)
      .join('\n')}`
  }

  const userSection = renderBucket(index.user, 'About the user')
  const projectSection = renderBucket(index.project, 'About this project')
  const orgSection = renderBucket(index.org, 'About the organisation')

  if (userSection) sections.push(userSection)
  if (projectSection) sections.push(projectSection)
  if (orgSection) sections.push(orgSection)

  if (sections.length === 0) return ''

  return [
    '## Memory (overview)',
    '',
    'These are persistent memories you have about this context. Use `load_memory(name)` to fetch the full content of an entry when relevant.',
    '',
    sections.join('\n\n'),
  ].join('\n')
}
