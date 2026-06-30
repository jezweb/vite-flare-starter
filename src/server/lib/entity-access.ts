/**
 * Entity-access oracle — the single "can this user touch this entity?" check
 * for polymorphic features (comments, watchers, …) that act on an
 * `entityType + entityId` pair taken from the request.
 *
 * The problem it solves: comments and watchers attach to ANY entity by
 * (entityType, entityId). Without a generic ownership check, user A can read
 * and write user B's comments/watchers by guessing/knowing B's entity ids
 * (a polymorphic IDOR). A per-site patch gives false confidence — the class
 * recurs the next time someone adds an entity-attached feature. This oracle
 * is the one place that knows how to resolve an entity's owner, so every such
 * site gates through `canAccessEntity` and the class is closed by construction.
 *
 * Contract (mirrors `scopeUser` in lib/tenancy.ts so the two never drift):
 *   - shared-tenancy mode → always allow (records are shared by design)
 *   - per-user mode       → the entity's owner userId must equal the caller
 *
 * Fail closed: an unregistered entity type with no fallback, or an entity
 * that doesn't exist, returns false. Org-membership-based access is a
 * deliberate later layer — v1 matches the userId-only semantics that
 * `scopeUser` and the entities tool already use.
 *
 * Registration: a module that owns an entity type calls `registerEntityType`
 * with a resolver that returns the entity's owner. The entities module stores
 * many user-defined types (issue/task/…) in one table keyed by id, so it
 * can't enumerate type strings — it registers a single `registerEntityFallback`
 * that an entities-row lookup by id satisfies for any unmatched type.
 */
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { isSharedTenancy } from '@/shared/config/tenancy'

export interface EntityOwner {
  userId: string
  /** Reserved for org-membership access (a later layer). Unused in v1. */
  organizationId?: string | null
}

export interface EntityAccessEnv {
  DB: D1Database
}

/** Resolve an entity's owner, or null if it doesn't exist. */
export type EntityAccessResolver = (
  env: EntityAccessEnv,
  entityId: string
) => Promise<EntityOwner | null>

const resolvers = new Map<string, EntityAccessResolver>()
let fallbackResolver: EntityAccessResolver | null = null

/** Register the owner-resolver for an exact entity type (e.g. 'conversation'). */
export function registerEntityType(entityType: string, resolver: EntityAccessResolver): void {
  resolvers.set(entityType, resolver)
}

/**
 * Register a resolver tried when no exact type matches. The entities module
 * uses this so its dynamic user-defined types (issue/task/…) are all covered
 * by one entities-row lookup without enumerating type strings.
 */
export function registerEntityFallback(resolver: EntityAccessResolver): void {
  fallbackResolver = resolver
}

let coreInstalled = false

/**
 * Install resolvers for the entity types the starter ships. Done lazily +
 * once per isolate so the oracle is self-contained — callers don't depend on
 * an import-for-side-effect running first. Forks add their own via
 * registerEntityType / registerEntityFallback at module load.
 */
async function ensureCoreResolvers(): Promise<void> {
  if (coreInstalled) return
  coreInstalled = true
  const { conversations } = await import('@/server/modules/conversations/db/schema')
  const { files } = await import('@/server/modules/files/db/schema')
  const { entities } = await import('@/server/modules/entities/db/schema')

  registerEntityType('conversation', async (env, id) => {
    const [row] = await drizzle(env.DB)
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1)
    return row ? { userId: row.userId } : null
  })

  registerEntityType('file', async (env, id) => {
    const [row] = await drizzle(env.DB)
      .select({ userId: files.userId })
      .from(files)
      .where(eq(files.id, id))
      .limit(1)
    return row ? { userId: row.userId } : null
  })

  // Fallback: the generic entities store keys every type (issue/task/custom)
  // by id, owned by userId (+ optional organizationId). Covers any entityType
  // that doesn't have an exact resolver.
  registerEntityFallback(async (env, id) => {
    const [row] = await drizzle(env.DB)
      .select({ userId: entities.userId, organizationId: entities.organizationId })
      .from(entities)
      .where(eq(entities.id, id))
      .limit(1)
    return row ? { userId: row.userId, organizationId: row.organizationId } : null
  })
}

/**
 * Can `userId` access the entity identified by (entityType, entityId)?
 *
 * Returns false (deny) for unknown types or missing entities — fail closed.
 * Use at every request boundary that reads/writes by a client-supplied
 * entityType + entityId.
 */
export async function canAccessEntity(
  env: EntityAccessEnv,
  entityType: string,
  entityId: string,
  userId: string
): Promise<boolean> {
  if (isSharedTenancy) return true
  await ensureCoreResolvers()
  const resolver = resolvers.get(entityType) ?? fallbackResolver
  if (!resolver) return false
  const owner = await resolver(env, entityId)
  if (!owner) return false
  return owner.userId === userId
}
