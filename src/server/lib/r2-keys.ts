/**
 * R2 key ownership — the single source of truth for "may this user read this
 * FILES-bucket object?". Objects are stored under user-scoped key prefixes
 * (`users/<userId>/...`, plus two legacy prefixes). Any route that serves an
 * R2 object from a caller-supplied key MUST gate on this, or a logged-in user
 * can read another tenant's files by guessing the key (cross-tenant IDOR).
 *
 * Respects tenancy mode: in shared-tenancy forks colleagues share data, so any
 * user-scoped key is allowed; in the default per-user mode the key must belong
 * to the caller. Mirrors the gate in the files module so images / media / files
 * never drift.
 */
import { isSharedTenancy } from '@/shared/config/tenancy'

/** User-scoped FILES-bucket prefixes for a user: current + two legacy formats. */
export function ownedR2Prefixes(userId: string): string[] {
  return [`users/${userId}/`, `generated/${userId}/`, `files/${userId}/`]
}

/**
 * True if `key` is readable by `userId`. In per-user mode the key must start
 * with one of this user's scoped prefixes; in shared-tenancy mode any
 * user-scoped key is allowed (colleagues share data). Empty/non-scoped keys
 * are always rejected.
 */
export function isOwnedR2Key(key: string | undefined | null, userId: string): boolean {
  if (!key) return false
  // R2 is a flat keyspace (no path traversal), so the prefix check below is
  // already sufficient — but reject `.`/`..`/empty segments, leading slashes
  // and backslashes anyway as defense-in-depth, so no caller that normalises
  // the key (or a future store with directory semantics) can escape the prefix.
  if (key.startsWith('/') || key.includes('\\')) return false
  if (key.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) return false
  if (isSharedTenancy) return /^(users|generated|files)\/[^/]+\//.test(key)
  return ownedR2Prefixes(userId).some((p) => key.startsWith(p))
}
