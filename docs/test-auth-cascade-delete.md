# Test-auth: never reassign real data to test users

## Core rule

Forks of vite-flare-starter (and any app using better-auth's `testUtils()` for
headless test sessions) MUST NOT reassign real user data to test user IDs.
Every user-scoped table declares `references user.id, onDelete: cascade`.
The next `/api/test-auth/cleanup` call deletes the test user and cascade-
wipes everything reassigned to it.

## When this fires

Headless test agent / sub-agent / Playwright run needs to "see" real data:

| If tempted to... | Do instead... |
|---|---|
| `UPDATE entities SET user_id = '<test_user>'` | Direct D1 queries: `wrangler d1 execute --command "SELECT … WHERE user_id = '<real>'"` to verify; trust the API to return rows when the real user signs in |
| Same thing with policies / files / conversations / any user-scoped table | Clone rows: `INSERT … SELECT lower(hex(randomblob(16))), '<test_user>', … FROM … WHERE user_id = '<real>'`. Test against clones. Drop test user → clones cascade-delete cleanly, real rows untouched |
| Working through the test session because OAuth feels slow | Add real email to `ALLOWED_AUTH_EMAILS` and OAuth-sign-in. One-time setup, completely safe |

## Why it's hard to catch

- The schema is correct (cascade-delete is the right design)
- The test-auth flow is correct (cleanup-by-email-pattern is the right behaviour)
- The reassignment query "works" — agent sees the data, audit passes
- The deletion only fires on the NEXT cleanup call, which might be a different
  session, hours later, run by automation

The bug is the testing pattern that bridges them, not any single layer.

## Symptoms (after the fact)

- Suddenly empty tables that previously had real data
- Migration with `INSERT OR IGNORE` partially restored rows but not all
- `wrangler d1 execute "SELECT count(*) FROM entities"` returns far fewer than expected
- Last successful audit run was around the same time

## Discovered

2026-04-30 on the RightCover fork. Lost 759 contacts + 20 policies + 64 file
metadata rows during a test cleanup. Recovered only because migration SQL
was idempotent — fork-users with hand-entered live data wouldn't have that
escape hatch.

**Last Updated**: 2026-04-30
