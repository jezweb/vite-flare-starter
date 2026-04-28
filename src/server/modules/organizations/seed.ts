/**
 * Personal-org auto-create — runs from the better-auth user-create hook.
 *
 * Every user gets a personal org on signup so the multi-tenant UI has
 * something to render from day one. Idempotent: if the user already
 * has any org membership, the helper does nothing — that handles
 *   - the existing-users backfill case (re-running the migration is safe)
 *   - races where two signup events fire for the same user
 *   - the case where a user accepts an invitation BEFORE the personal-
 *     org hook gets a chance to fire (rare, but possible)
 *
 * Default name: "{firstName}'s workspace" if we have a name, else
 * "Personal". Slug uses 8 chars of the user id for uniqueness — slugs
 * have a UNIQUE constraint and we don't want a collision when two
 * users named "Alice Lee" sign up.
 */
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'

interface SeedEnv {
  DB: D1Database
}

export interface PersonalOrgInput {
  userId: string
  /** Display name for the user (better-auth `user.name`). Optional —
   *  falls back to email-derived label if absent. */
  userName?: string | null
  /** Email — used for the fallback display name. */
  userEmail?: string | null
}

export interface PersonalOrgResult {
  /** True if a new org was created on this call. False = user already
   *  had at least one org. */
  created: boolean
  /** Org id whether newly created or pre-existing. May be null if the
   *  insert itself failed (logged). */
  organizationId: string | null
}

/**
 * Idempotently ensure the user has at least one org. Safe to call from
 * signup hooks AND from a backfill loop — checks for existing
 * membership first.
 */
export async function ensurePersonalOrg(
  env: SeedEnv,
  input: PersonalOrgInput,
): Promise<PersonalOrgResult> {
  const db = drizzle(env.DB)
  // Guard: already a member of some org? bail.
  const memberCount = (await db.all(
    sql`SELECT COUNT(*) AS n FROM member WHERE userId = ${input.userId}`,
  )) as Array<{ n: number }>
  if ((memberCount[0]?.n ?? 0) > 0) {
    // Pull the user's first org so the caller can set it active.
    const existing = (await db.all(
      sql`SELECT organizationId FROM member WHERE userId = ${input.userId}
          ORDER BY createdAt ASC LIMIT 1`,
    )) as Array<{ organizationId: string }>
    return {
      created: false,
      organizationId: existing[0]?.organizationId ?? null,
    }
  }

  const orgId = crypto.randomUUID()
  const memberId = crypto.randomUUID()
  const firstName = (input.userName?.trim() || '').split(/\s+/)[0]
  const fallbackFromEmail = (input.userEmail?.split('@')[0] || '').replace(/[._-]+/g, ' ').trim()
  const display = firstName || fallbackFromEmail || 'Personal'
  const orgName = display === 'Personal' ? 'Personal' : `${display}'s workspace`
  // Slug: lowercased name + 8 chars of user id for uniqueness. Slugs
  // have a UNIQUE constraint, so even two "Alices" don't collide.
  const slugBase = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'workspace'
  const slug = `${slugBase}-${input.userId.slice(0, 8)}`

  try {
    // Insert the org + the owner-membership row in one batch so a
    // partial failure doesn't leave an orphan org.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO organization (id, name, slug, logo, metadata, createdAt)
         VALUES (?, ?, ?, NULL, NULL, unixepoch())`,
      ).bind(orgId, orgName, slug),
      env.DB.prepare(
        `INSERT INTO member (id, organizationId, userId, role, createdAt)
         VALUES (?, ?, ?, 'owner', unixepoch())`,
      ).bind(memberId, orgId, input.userId),
    ])
    return { created: true, organizationId: orgId }
  } catch (err) {
    // Log + surface — but don't throw, so signup itself doesn't fail
    // because of an org-create hiccup. The user can create one
    // manually from the UI.
    console.error(
      JSON.stringify({
        event: 'ensure_personal_org_failed',
        userId: input.userId,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    return { created: false, organizationId: null }
  }
}

/**
 * Set the user's activeOrganizationId on a session that doesn't have
 * one yet. Used from session-create hook so first login lands in the
 * personal org instead of "(no active org)".
 *
 * Picks the user's earliest-created org membership. Mostly that's the
 * personal org; for users who joined an existing org (via invitation)
 * before any org of their own, picks whichever they joined first.
 */
export async function setDefaultActiveOrgForSession(
  env: SeedEnv,
  sessionId: string,
  userId: string,
): Promise<void> {
  const db = drizzle(env.DB)
  // Only act when the session has no active org yet.
  const session = (await db.all(
    sql`SELECT activeOrganizationId FROM session WHERE id = ${sessionId} LIMIT 1`,
  )) as Array<{ activeOrganizationId: string | null }>
  if (!session[0] || session[0].activeOrganizationId) return

  const earliest = (await db.all(
    sql`SELECT organizationId FROM member WHERE userId = ${userId}
        ORDER BY createdAt ASC LIMIT 1`,
  )) as Array<{ organizationId: string }>
  if (!earliest[0]) return

  await db.run(
    sql`UPDATE session SET activeOrganizationId = ${earliest[0].organizationId}
        WHERE id = ${sessionId}`,
  )
}
