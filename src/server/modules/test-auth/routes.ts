/**
 * Test-auth — mint real session cookies for headless agents.
 *
 * Why this exists: ux-audit + regression sub-agents need to walk the
 * deployed app as a real signed-in user, but the production auth flow
 * is OAuth-only. Without this module, every audit run blocks on Jez
 * (the human) being signed in via Chrome.
 *
 * How it works: better-auth's testUtils() plugin (loaded conditionally
 * when TEST_AUTH_TOKEN is set in env) exposes `auth.$context.test` with
 * `saveUser` / `getCookies` / `login`. We expose a thin HTTP wrapper so
 * agents can mint cookies remotely and inject them into Playwright.
 *
 * Production safety:
 *   1. If TEST_AUTH_TOKEN is unset, the testUtils plugin isn't loaded
 *      AND every endpoint here returns 404 — no surface area at all.
 *   2. If set, the X-Test-Auth header is compared constant-time to the
 *      secret. Wrong header → 401.
 *   3. Email is allowlisted to `*@test.<anything>.local` so the endpoint
 *      can never mint a session for a real user account.
 *   4. Allowlist bypass for the test domain (#91): the signup gate
 *      (isSignupAllowed) lets *@test.<x>.local through whenever
 *      TEST_AUTH_TOKEN is set, so minting a test session works even when
 *      a fork runs an active ALLOWED_AUTH_* allowlist that excludes the
 *      test domain. Without that, databaseHooks.user.create.before would
 *      reject the test signup and this route would 403.
 *
 * Usage from a test agent:
 *   curl -X POST $URL/api/test-auth/cookies \
 *     -H "X-Test-Auth: $TEST_AUTH_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{ "email": "alice@test.vite-flare.local", "name": "Alice" }'
 *   # → { user, cookies: [{ name, value, domain, path, ... }] }
 *   #   cookies are Playwright/Puppeteer-compatible.
 *
 * ⚠️  CASCADE-DELETE TRAP — read before reassigning real data.
 *
 * Every user-scoped table in the starter (and most fork schemas)
 * declares `references user.id, onDelete: cascade`. That's correct
 * schema design — when a user is deleted, their data goes with them.
 *
 * The trap: when working with real data through a test session, it is
 * tempting to reassign ownership so the test session "sees" real rows:
 *
 *     -- DON'T DO THIS
 *     UPDATE entities SET user_id = '<test_user_id>' WHERE ...;
 *
 * The next /api/test-auth/cleanup call (which deletes every user with
 * email matching *@test.*.local) will cascade-delete every row you
 * reassigned. Real data, gone. No undo.
 *
 * This actually happened on a fork: 759 contacts + 20 policies + 64
 * file metadata rows lost when cleanup ran. Recovered only because
 * the migration SQL was idempotent (INSERT OR IGNORE) — fork-users
 * with live, hand-entered data don't have that escape.
 *
 * Safe patterns instead:
 *
 *   1. Don't reassign — verify data with direct D1 queries
 *      (`wrangler d1 execute ... --command "SELECT ..."`) and trust
 *      the API will return the right rows when the real user signs in.
 *
 *   2. Clone, don't move:
 *        INSERT INTO entities (id, user_id, ...)
 *        SELECT lower(hex(randomblob(16))), '<test_user_id>', ...
 *        FROM entities WHERE user_id = '<real_user>';
 *      Test against the clones, then drop the test user (the clones
 *      cascade-delete; the real rows stay).
 *
 *   3. Add the test email to ALLOWED_AUTH_EMAILS and OAuth-sign-in
 *      as the real account. Slower per run, completely safe.
 *
 * Discovered: 2026-04-30 on the RightCover fork.
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { drizzle } from 'drizzle-orm/d1'
import { eq, like } from 'drizzle-orm'
import { user as userTable } from '@/server/modules/auth/db/schema'
import { createAuthFromEnv } from '@/server/modules/auth'
import { TEST_EMAIL_PATTERN } from '@/shared/config/constants'

interface TestAuthEnv {
  DB: D1Database
  TEST_AUTH_TOKEN?: string
  [key: string]: unknown
}

const app = new Hono<{ Bindings: TestAuthEnv }>()

// Test-email allowlist pattern is the shared security primitive in
// @/shared/config/constants — the signup gate's test-domain bypass (#91)
// depends on the same shape, so both import it rather than re-declaring.

/** Constant-time string compare to avoid timing-side-channel leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Block all routes when TEST_AUTH_TOKEN is unset. */
app.use('/*', async (c, next) => {
  const expected = c.env.TEST_AUTH_TOKEN
  if (!expected) return c.json({ error: 'Not found' }, 404)
  const provided = c.req.header('X-Test-Auth') ?? ''
  if (!safeEqual(provided, expected)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

const cookiesBody = z.object({
  email: z.string().email().regex(TEST_EMAIL_PATTERN, {
    message: 'email must match *@test.<anything>.local',
  }),
  name: z.string().trim().min(1).max(80).optional(),
})

/**
 * POST /api/test-auth/cookies
 *
 * Find-or-create the test user, then return a freshly-minted session
 * (real DB row + signed cookie). The cookie array is shaped to drop
 * straight into Playwright's `context.addCookies()` or Puppeteer's
 * `page.setCookie()`.
 */
app.post('/cookies', zValidator('json', cookiesBody), async (c) => {
  const { email, name } = c.req.valid('json')

  const auth = createAuthFromEnv(c.env.DB, c.env as Record<string, unknown>)
  const ctx = await auth.$context
  const test = ctx.test
  if (!test) {
    // Plugin should be loaded (we already gated on TEST_AUTH_TOKEN), so
    // missing test helpers means a config drift — log + return 500.
    console.error(JSON.stringify({ event: 'test_auth_helpers_missing' }))
    return c.json({ error: 'test-utils plugin not initialised' }, 500)
  }

  const db = drizzle(c.env.DB)
  const existing = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, email.toLowerCase()))
    .limit(1)
  let userId: string
  if (existing[0]) {
    userId = existing[0].id
  } else {
    const stub = test.createUser({
      email: email.toLowerCase(),
      name: name ?? email.split('@')[0],
      emailVerified: true,
    })
    const saved = await test.saveUser(stub)
    // Defence-in-depth (#91): the signup gate bypasses test emails when
    // TEST_AUTH_TOKEN is set, so this should always succeed. But if a fork
    // blocks creation some other way, saveUser returns null — return an
    // actionable 403 instead of null-derefing on `.id`.
    if (!saved?.id) {
      console.warn(JSON.stringify({ event: 'test_auth_create_blocked', email }))
      return c.json(
        {
          error:
            'Test-user creation was blocked (likely the signup allowlist). ' +
            'Set TEST_AUTH_TOKEN so the *@test.<x>.local bypass applies, ' +
            'or add the test domain to ALLOWED_AUTH_EMAILS/ALLOWED_AUTH_DOMAINS.',
        },
        403
      )
    }
    userId = saved.id
  }

  const cookies = await test.getCookies({ userId })
  const me = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1)
  return c.json({
    user: me[0]
      ? { id: me[0].id, email: me[0].email, name: me[0].name, role: me[0].role }
      : { id: userId, email, name: name ?? null, role: 'user' },
    cookies,
  })
})

/**
 * POST /api/test-auth/cleanup
 *
 * Delete every test-domain user — useful between audit runs to avoid
 * D1 row growth. No body needed.
 */
app.post('/cleanup', async (c) => {
  const auth = createAuthFromEnv(c.env.DB, c.env as Record<string, unknown>)
  const ctx = await auth.$context
  const test = ctx.test
  if (!test) return c.json({ error: 'test-utils plugin not initialised' }, 500)

  const db = drizzle(c.env.DB)
  const rows = await db
    .select({ id: userTable.id, email: userTable.email })
    .from(userTable)
    .where(like(userTable.email, '%@test.%.local'))

  let deleted = 0
  for (const row of rows) {
    try {
      await test.deleteUser(row.id)
      deleted += 1
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'test_auth_delete_failed',
          userId: row.id,
          error: err instanceof Error ? err.message : String(err),
        })
      )
    }
  }
  return c.json({ deleted, scanned: rows.length })
})

export default app
