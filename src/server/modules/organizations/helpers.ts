/**
 * Organization helpers — read active org from session, gate routes by role.
 *
 * The Organization plugin attaches `activeOrganizationId` to the
 * session. These helpers wrap the lookup so route handlers don't need
 * to drill into the auth API surface manually.
 *
 * Roles: 'owner', 'admin', 'member' (defaults from better-auth). For
 * custom role hierarchies, configure the `ac` option on the plugin and
 * adjust requireOrgRole accordingly.
 */
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
import type { Context } from 'hono'
import type { AuthContext } from '@/server/middleware/auth'

export type OrgRole = 'owner' | 'admin' | 'member'

export interface ActiveOrg {
  organizationId: string
  organizationName: string
  organizationSlug: string
  /** This user's role in this org. */
  role: OrgRole
}

/**
 * Resolve the user's active organization (if any) from their session.
 * Returns null when the user isn't in any org or hasn't selected one.
 *
 * Reads the session row directly to grab activeOrganizationId, then
 * joins via raw SQL (avoiding a Drizzle schema for org/member tables
 * since those are owned by better-auth's adapter).
 */
export async function getActiveOrg(
  c: Context<AuthContext>,
): Promise<ActiveOrg | null> {
  const userId = c.get('userId')
  if (!userId) return null
  const db = drizzle(c.env.DB)
  // Single denormalised query: session → member → organization.
  // sessionToken is the cookie value; better-auth uses the session
  // table's `id` field as the lookup key for activeOrganizationId
  // population. We rely on userId here to get the most recent active
  // session — most users have one active session at a time.
  const rows = (await db.all(
    sql`SELECT
          o.id   AS organizationId,
          o.name AS organizationName,
          o.slug AS organizationSlug,
          m.role AS role
        FROM session s
        JOIN organization o ON o.id = s.activeOrganizationId
        JOIN member m       ON m.organizationId = o.id AND m.userId = ${userId}
        WHERE s.userId = ${userId} AND s.activeOrganizationId IS NOT NULL
        ORDER BY s.expiresAt DESC
        LIMIT 1`,
  )) as Array<{
    organizationId: string
    organizationName: string
    organizationSlug: string
    role: string
  }>
  const row = rows[0]
  if (!row) return null
  return {
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    organizationSlug: row.organizationSlug,
    role: row.role as OrgRole,
  }
}

/**
 * Read a user's role in a specific org. null if they're not a member.
 * Useful for explicit "is this user X in org Y" checks (e.g. when an
 * agent is acting on behalf of an org-scoped resource and we want to
 * verify before routing).
 */
export async function getOrgRole(
  db: D1Database,
  userId: string,
  organizationId: string,
): Promise<OrgRole | null> {
  const rows = (await drizzle(db).all(
    sql`SELECT role FROM member WHERE userId = ${userId} AND organizationId = ${organizationId} LIMIT 1`,
  )) as Array<{ role: string }>
  const row = rows[0]
  return row ? (row.role as OrgRole) : null
}

/**
 * List all organizations a user belongs to (with their role in each).
 * Used by the org switcher UI.
 */
export async function listUserOrgs(
  db: D1Database,
  userId: string,
): Promise<Array<{ id: string; name: string; slug: string; role: OrgRole }>> {
  const rows = (await drizzle(db).all(
    sql`SELECT o.id, o.name, o.slug, m.role
        FROM organization o
        JOIN member m ON m.organizationId = o.id
        WHERE m.userId = ${userId}
        ORDER BY o.name`,
  )) as Array<{ id: string; name: string; slug: string; role: string }>
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    role: r.role as OrgRole,
  }))
}

/**
 * Express-the-policy helper for route handlers. Returns the active
 * org (with role) on success, or a Response (401/403) the handler
 * should return immediately on failure.
 *
 * Usage:
 *   const orgOrErr = await requireOrgRole(c, ['owner', 'admin'])
 *   if (orgOrErr instanceof Response) return orgOrErr
 *   // orgOrErr is ActiveOrg here
 */
export async function requireOrgRole(
  c: Context<AuthContext>,
  allowedRoles: OrgRole[],
): Promise<ActiveOrg | Response> {
  const org = await getActiveOrg(c)
  if (!org) {
    return c.json({ error: 'No active organisation' }, 401)
  }
  if (!allowedRoles.includes(org.role)) {
    return c.json(
      { error: `Insufficient role: requires ${allowedRoles.join(' or ')}, you are ${org.role}` },
      403,
    )
  }
  return org
}
