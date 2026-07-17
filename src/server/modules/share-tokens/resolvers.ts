/**
 * Share resolvers — per-type rules for what a share token exposes.
 *
 * Each shareable record type registers two functions:
 *   canShare   — may THIS user mint a public link to THIS record?
 *   loadPublic — the exact payload an anonymous visitor receives.
 *
 * loadPublic is an allow-list, never a row spread: decide field by
 * field what the public internet may see. The 'entity' resolver
 * deliberately omits userId (owner identity), externalId (internal
 * system references), assigneeId, and organizationId.
 *
 * Forks add types here (knowledge doc, conversation transcript, board
 * snapshot) — one entry, and both the mint route and the public
 * endpoint pick it up.
 */
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { scopeUser, isCondition } from '@/server/lib/tenancy'
import { entities } from '@/server/modules/entities/db/schema'
import { artifacts } from '@/server/modules/artifacts/db/schema'
import { getLatestVersion } from '@/server/modules/artifacts/store'

export interface ShareResolver {
  canShare(env: { DB: D1Database }, entityId: string, userId: string): Promise<boolean>
  loadPublic(env: { DB: D1Database }, entityId: string): Promise<Record<string, unknown> | null>
}

export const shareResolvers: Record<string, ShareResolver> = {
  entity: {
    // Same visibility rule as the entities API: creator in per-user
    // mode, any team member in shared mode.
    async canShare(env, entityId, userId) {
      const db = drizzle(env.DB)
      const conditions = [eq(entities.id, entityId), scopeUser(entities.userId, userId)].filter(
        isCondition
      )
      const [row] = await db
        .select({ id: entities.id })
        .from(entities)
        .where(and(...conditions))
        .limit(1)
      return !!row
    },
    async loadPublic(env, entityId) {
      const db = drizzle(env.DB)
      const [row] = await db.select().from(entities).where(eq(entities.id, entityId)).limit(1)
      if (!row) return null
      let fields: Record<string, unknown> = {}
      try {
        fields = JSON.parse(row.fields) as Record<string, unknown>
      } catch {
        fields = {}
      }
      return {
        type: row.type,
        title: row.title,
        status: row.status,
        fields,
        updatedAt: row.updatedAt,
      }
    },
  },

  // AI-generated artifacts (WorkspacePanel) — publishes the LATEST
  // version at resolve time, so an updated artifact updates its links.
  artifact: {
    async canShare(env, entityId, userId) {
      const db = drizzle(env.DB)
      const conditions = [eq(artifacts.id, entityId), scopeUser(artifacts.userId, userId)].filter(
        isCondition
      )
      const [row] = await db
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(and(...conditions))
        .limit(1)
      return !!row
    },
    async loadPublic(env, entityId) {
      const latest = await getLatestVersion(env, entityId)
      if (!latest) return null
      return {
        artifactType: latest.artifact.type,
        title: latest.version.title,
        code: latest.version.code,
        version: latest.version.version,
        updatedAt: latest.artifact.updatedAt,
      }
    },
  },
}
