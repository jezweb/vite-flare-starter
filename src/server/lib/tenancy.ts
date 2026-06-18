/**
 * Tenancy scoping helper — the single source of truth for per-user-vs-shared
 * row scoping. See src/shared/config/tenancy.ts for the mode config.
 *
 * Use it EVERYWHERE you'd write `eq(table.userId, userId)` — in read WHERE
 * clauses AND in write guards (UPDATE/DELETE WHERE, ownership pre-checks). That
 * consistency is the whole point: scoping reads but not writes (or vice versa)
 * produces "I can see it but can't act on it" bugs. Returns `undefined` in
 * shared mode, so filter it out of `and(...)` condition arrays:
 *
 *   const conditions = [scopeUser(t.userId, userId), eq(t.type, type)].filter(
 *     (c): c is SQL => c !== undefined,
 *   )
 *   db.select().from(t).where(and(...conditions))
 *
 * INSERTs still set `userId` unconditionally — shared mode records who created
 * a row, it just stops filtering on it.
 */
import { eq, type SQL } from 'drizzle-orm'
import type { AnyColumn } from 'drizzle-orm'
import { isSharedTenancy } from '@/shared/config/tenancy'

/**
 * Per-user scope condition, or `undefined` in shared-tenancy mode.
 * @param column the table's userId column (e.g. `entities.userId`)
 * @param userId the authenticated user id
 */
export function scopeUser(column: AnyColumn, userId: string): SQL | undefined {
  return isSharedTenancy ? undefined : eq(column, userId)
}

/** Narrowing predicate for filtering `undefined`s out of a condition array. */
export function isCondition(c: SQL | undefined): c is SQL {
  return c !== undefined
}
