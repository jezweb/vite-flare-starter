/**
 * Owner middleware — guest-cookie ownership for freemium UX
 *
 * The starter's default `authMiddleware` requires a logged-in user.
 * That's the right shape for most modules (settings, files, admin)
 * — but it makes "the homepage IS the app" patterns awkward. Anonymous
 * users hit the demo, get prompted to sign in BEFORE doing anything,
 * and bounce.
 *
 * `ownerMiddleware` is the alternative. It establishes a stable
 * owner key for every request:
 *
 *   - If a better-auth session exists → `ownerUserId` set, isGuest=false
 *   - Otherwise → mint or read a long-lived `vfs_session=<uuid>`
 *     cookie, set `ownerSessionId`, isGuest=true
 *
 * Routes scope resources by EITHER user_id OR session_id (whichever
 * `getOwnerKey(c)` returns), so an anonymous user's work survives
 * across requests — and seamlessly migrates if they later sign up
 * (give them an `assignSessionToUser` step on signup).
 *
 * **When to use this instead of authMiddleware:**
 *   - Public demos / freemium tiers
 *   - "Try before you sign up" funnels
 *   - Read-only public surfaces that still benefit from per-visitor
 *     state (e.g. a public scratchpad)
 *
 * **When NOT to use this:**
 *   - Anything sensitive (settings, files, admin, billing) — those
 *     need real auth
 *   - APIs called by external services with their own auth
 *
 * Pattern lifted from imgeo's freemium pipeline. Adjust the cookie
 * name + TTL for your fork's tier policy.
 */
import { createMiddleware } from 'hono/factory'
import { getCookie, setCookie } from 'hono/cookie'
import type { Env } from '../index'
import { createAuthFromEnv } from '../modules/auth'

/** Cookie name. Prefix with your app's token prefix or change to
 *  whatever signals "this is our session" to your CDN logs. */
const GUEST_COOKIE = 'vfs_session'
/** 30 days. Long enough for repeat visitors, short enough that
 *  abandoned guest data doesn't pile up forever. */
const GUEST_COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60

export type OwnerContext = {
  Bindings: Env
  Variables: {
    ownerUserId?: string
    ownerSessionId?: string
    isGuest: boolean
  }
}

export const ownerMiddleware = createMiddleware<OwnerContext>(async (c, next) => {
  // Try to resolve an authenticated session first. The auth module
  // throws if env vars aren't set (e.g. local dev without secrets);
  // catching keeps the guest path working in that case.
  let userId: string | undefined
  try {
    const auth = createAuthFromEnv(c.env.DB, c.env as unknown as Record<string, unknown>)
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (session?.user?.id) userId = session.user.id
  } catch {
    /* fall through to guest */
  }

  if (userId) {
    c.set('ownerUserId', userId)
    c.set('isGuest', false)
    return next()
  }

  // Guest path — read or mint the cookie. UUID format check stops
  // a tampered cookie from being trusted as a valid session id.
  let sessionId = getCookie(c, GUEST_COOKIE)
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    sessionId = crypto.randomUUID()
    setCookie(c, GUEST_COOKIE, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: GUEST_COOKIE_TTL_SECONDS,
    })
  }
  c.set('ownerSessionId', sessionId)
  c.set('isGuest', true)
  return next()
})

/**
 * Returns the owner key pair — whichever is set — for the current
 * request. Downstream Drizzle queries use this to scope resources:
 *
 *   const { userId, sessionId } = getOwnerKey(c)
 *   const rows = await db.select()
 *     .from(jobs)
 *     .where(or(
 *       userId ? eq(jobs.userId, userId) : sql`0`,
 *       sessionId ? eq(jobs.sessionId, sessionId) : sql`0`,
 *     ))
 *
 * The `sql\`0\`` fallback is a no-op WHERE term when one half of the
 * pair is absent — without it Drizzle's `or()` on an empty array
 * would match every row.
 */
export function getOwnerKey(c: { var: { ownerUserId?: string; ownerSessionId?: string } }): {
  userId?: string
  sessionId?: string
} {
  return {
    userId: c.var.ownerUserId,
    sessionId: c.var.ownerSessionId,
  }
}
