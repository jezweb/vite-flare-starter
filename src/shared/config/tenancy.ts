/**
 * Tenancy mode — per-user vs shared data scoping.
 *
 * The starter scopes every row to its creator (`userId`). That's right for a
 * multi-user SaaS. But a single-tenant / small-team fork — one business, a few
 * trusted logins behind a locked allowlist (see the allowlist auth pattern) —
 * usually wants the data SHARED across those logins, so colleagues see and act
 * on the same records.
 *
 * Set `VITE_TENANCY_MODE=shared` to flip the whole app to shared scoping. The
 * server helper `scopeUser()` (src/server/lib/tenancy.ts) reads this and either
 * filters by userId (per-user) or returns no filter (shared) — applied to reads
 * AND write guards so the two never drift (the classic "I can see it but can't
 * edit it" bug).
 *
 * Default: 'per-user' (unchanged starter behaviour). This is a deploy-time
 * decision per fork, so it's a build-time flag like the feature flags — you
 * don't flip tenancy at runtime.
 *
 * NOTE: shared mode is honoured wherever a module calls `scopeUser()`. The
 * canonical `entities` module is fully converted as the reference; extend the
 * same helper to your own domain modules. Rows still record their creator in
 * `userId` either way — shared mode just stops filtering reads/writes on it.
 */
export type TenancyMode = 'per-user' | 'shared'

export const TENANCY_MODE: TenancyMode =
  import.meta.env['VITE_TENANCY_MODE'] === 'shared' ? 'shared' : 'per-user'

export const isSharedTenancy = TENANCY_MODE === 'shared'
