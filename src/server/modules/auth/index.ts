import { betterAuth } from 'better-auth'
import { organization } from 'better-auth/plugins/organization'
import { testUtils, lastLoginMethod } from 'better-auth/plugins'
import type { D1Database } from '@cloudflare/workers-types'
import { SESSION, TEST_EMAIL_PATTERN } from '@/shared/config/constants'
import { logActivity } from '@/server/modules/activity/log'
import { sendEmail, type EmailEnv } from '@/server/modules/email/service'

/** Default trusted origins (always included) */
const DEFAULT_TRUSTED_ORIGINS = ['http://localhost:5173']

/**
 * Parse trusted origins from environment variable
 * Accepts comma-separated list: "http://localhost:5173,https://myapp.workers.dev"
 */
function parseTrustedOrigins(envValue?: string): string[] {
  if (!envValue) return DEFAULT_TRUSTED_ORIGINS

  const origins = envValue
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0)

  // Always include localhost for development
  if (!origins.includes('http://localhost:5173')) {
    origins.unshift('http://localhost:5173')
  }

  return origins
}

/**
 * Create better-auth instance with Cloudflare D1
 *
 * AUTH CONFIGURATION - See CLAUDE.md "Auth Method Control" section
 * ─────────────────────────────────────────────────────────────────
 * Email/password is DISABLED by default (OAuth-only mode).
 * To enable: Set ENABLE_EMAIL_LOGIN=true (and optionally ENABLE_EMAIL_SIGNUP=true)
 *
 * Uses D1 binding directly (better-auth auto-detects D1 since v1.5).
 */
/**
 * THE auth constructor for application code. Pass `c.env` (or the Worker
 * `env`) directly: `createAuthFromEnv(c.env.DB, c.env as unknown as Record<string, unknown>)`.
 *
 * Why this is the only call site you should use: this forwarder maps EVERY
 * auth-relevant env var onto `createAuth`. Hand-building a partial env object
 * inline (the old pattern) drifts the moment a new var is added here — the
 * inline site silently omits it. That bug shipped to a fork: the OAuth handler
 * hand-built an env object missing the signup-allowlist vars, so the gate
 * fail-closed and blocked every real Google sign-in while test-auth (which
 * used this forwarder) worked. One constructor = one place to add a var = no
 * drift. See issue #71.
 */
/**
 * Signup allowlist gate (issue #88). Pure + exported for testing.
 *
 * The gate is ACTIVE when either list is non-empty OR AUTH_ALLOWLIST='true'.
 * When inactive (the public-starter default) it allows everyone — so a fresh
 * fork's Google sign-in keeps working untouched. When active, only emails
 * matching the explicit list or an allowed domain may create an account;
 * AUTH_ALLOWLIST='true' with empty lists fails closed (rejects all) so a
 * client deploy that forgot to populate the lists blocks rather than opens.
 *
 * Wired into BOTH databaseHooks.user.create.before (gates NEW signups) and
 * databaseHooks.session.create.before (gates EVERY login, so an account that
 * predates an activated allowlist is locked out on its next sign-in too).
 */
export function isSignupAllowed(
  email: string,
  cfg: {
    ALLOWED_AUTH_EMAILS?: string
    ALLOWED_AUTH_DOMAINS?: string
    AUTH_ALLOWLIST?: string
    TEST_AUTH_TOKEN?: string
  }
): boolean {
  const lower = email.toLowerCase().trim()
  // Test-domain bypass (#91): when headless test-auth is enabled, its
  // *@test.<x>.local users must be creatable regardless of the allowlist —
  // otherwise minting a test session behind an active allowlist null-derefs.
  // Gated on TEST_AUTH_TOKEN so this never widens signup in production
  // (no token → no bypass → the .local addresses fall through to the gate).
  if (cfg.TEST_AUTH_TOKEN && TEST_EMAIL_PATTERN.test(lower)) return true
  const split = (raw?: string) =>
    (raw ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  const emails = new Set(split(cfg.ALLOWED_AUTH_EMAILS))
  const domains = new Set(split(cfg.ALLOWED_AUTH_DOMAINS).map((d) => d.replace(/^@/, '')))
  const forced = String(cfg.AUTH_ALLOWLIST ?? '').toLowerCase() === 'true'
  const active = forced || emails.size > 0 || domains.size > 0
  if (!active) return true // gate off → open signup (public-starter default)
  if (emails.has(lower)) return true
  const domain = lower.split('@')[1]
  return !!domain && domains.has(domain)
}

/**
 * Is an allowlist actually configured? When false the app accepts any signup
 * (public-starter default), so error paths in the login gate may fail OPEN
 * without widening access. When true the gate is load-bearing, so those same
 * error paths must fail CLOSED — a transient D1 error must not re-admit a
 * pre-existing account the operator has since removed from the allowlist.
 */
export function isAllowlistActive(cfg: {
  ALLOWED_AUTH_EMAILS?: string
  ALLOWED_AUTH_DOMAINS?: string
  AUTH_ALLOWLIST?: string
}): boolean {
  const has = (raw?: string) =>
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean).length > 0
  return (
    String(cfg.AUTH_ALLOWLIST ?? '').toLowerCase() === 'true' ||
    has(cfg.ALLOWED_AUTH_EMAILS) ||
    has(cfg.ALLOWED_AUTH_DOMAINS)
  )
}

export function createAuthFromEnv(d1: D1Database, env: Record<string, unknown>) {
  return createAuth(d1, {
    BETTER_AUTH_SECRET: String(env['BETTER_AUTH_SECRET'] ?? ''),
    BETTER_AUTH_URL: String(env['BETTER_AUTH_URL'] ?? ''),
    GOOGLE_CLIENT_ID: env['GOOGLE_CLIENT_ID'] as string | undefined,
    GOOGLE_CLIENT_SECRET: env['GOOGLE_CLIENT_SECRET'] as string | undefined,
    EMAIL_API_KEY: env['EMAIL_API_KEY'] as string | undefined,
    EMAIL_FROM: env['EMAIL_FROM'] as string | undefined,
    APP_NAME: env['APP_NAME'] as string | undefined,
    APP_URL: env['APP_URL'] as string | undefined,
    ENABLE_EMAIL_LOGIN: env['ENABLE_EMAIL_LOGIN'] as string | undefined,
    ENABLE_EMAIL_SIGNUP: env['ENABLE_EMAIL_SIGNUP'] as string | undefined,
    TRUSTED_ORIGINS: env['TRUSTED_ORIGINS'] as string | undefined,
    TEST_AUTH_TOKEN: env['TEST_AUTH_TOKEN'] as string | undefined,
    ALLOWED_AUTH_EMAILS: env['ALLOWED_AUTH_EMAILS'] as string | undefined,
    ALLOWED_AUTH_DOMAINS: env['ALLOWED_AUTH_DOMAINS'] as string | undefined,
    AUTH_ALLOWLIST: env['AUTH_ALLOWLIST'] as string | undefined,
    EMAIL: env['EMAIL'],
    SEND_EMAIL: env['SEND_EMAIL'],
  })
}

/**
 * @internal Low-level constructor with a fully-typed env object. Prefer
 * {@link createAuthFromEnv} in application code — it forwards every env var
 * and prevents the partial-object drift documented in issue #71. This stays
 * exported only because the forwarder builds on it.
 */
export function createAuth(
  d1: D1Database,
  env: {
    BETTER_AUTH_SECRET: string
    BETTER_AUTH_URL: string
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
    EMAIL_API_KEY?: string
    EMAIL_FROM?: string
    APP_NAME?: string
    APP_URL?: string
    ENABLE_EMAIL_LOGIN?: string // Set to 'true' to enable email/password (default: disabled)
    ENABLE_EMAIL_SIGNUP?: string // Set to 'true' to allow signups (requires ENABLE_EMAIL_LOGIN)
    TRUSTED_ORIGINS?: string
    /**
     * Signup allowlist (issue #88) — single-tenant / invite-only gate. Both
     * comma-separated. The gate activates when either list is set OR
     * AUTH_ALLOWLIST='true'; when active, only matching emails can create an
     * account. Fires on user CREATION only, so existing users are never locked
     * out. Unset (and AUTH_ALLOWLIST off) → open signup (public-starter default).
     */
    ALLOWED_AUTH_EMAILS?: string // e.g. "alice@acme.com,bob@acme.com"
    ALLOWED_AUTH_DOMAINS?: string // e.g. "acme.com,jezweb.net"
    /**
     * Force the allowlist gate on even with empty lists → fail closed (reject
     * everyone). For client deploys where forgetting to populate the lists
     * should block, not open, signup.
     */
    AUTH_ALLOWLIST?: string
    /**
     * When set, loads better-auth's testUtils plugin so headless agents
     * (Playwright, audit sub-agents) can mint real session cookies via
     * the /api/test-auth endpoints. Production-safe: leaving this unset
     * means the plugin isn't loaded and the endpoints return 404.
     */
    TEST_AUTH_TOKEN?: string
    // Optional Cloudflare email bindings — the service wrapper uses whichever is present.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    EMAIL?: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SEND_EMAIL?: any
  }
) {
  // Email helpers wrap our service so we can swap Resend → Email Service
  // without touching the better-auth config. If nothing's configured the
  // service falls back to console.log so auth flows never block in dev.
  const mailEnv: EmailEnv = {
    DB: d1,
    EMAIL: env.EMAIL,
    SEND_EMAIL: env.SEND_EMAIL,
    EMAIL_API_KEY: env.EMAIL_API_KEY,
    EMAIL_FROM: env.EMAIL_FROM,
    APP_NAME: env.APP_NAME,
    APP_URL: env.APP_URL,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
  }
  const appName = env.APP_NAME || 'Vite Flare Starter'
  // Email login is DISABLED by default (OAuth-only mode)
  // Set ENABLE_EMAIL_LOGIN=true to allow email/password authentication
  const emailLoginEnabled = env.ENABLE_EMAIL_LOGIN === 'true'
  // Email signup requires login to be enabled first
  const emailSignupEnabled = emailLoginEnabled && env.ENABLE_EMAIL_SIGNUP === 'true'
  // Google OAuth access is controlled at Google Cloud Console level:
  // - Set OAuth consent screen "User type" to "Internal" for domain-only access

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,

    // Allow multiple domains - configurable via TRUSTED_ORIGINS env var
    // Format: comma-separated list of URLs
    // Example: "http://localhost:5173,https://myapp.workers.dev,https://myapp.com"
    trustedOrigins: parseTrustedOrigins(env.TRUSTED_ORIGINS),

    // D1 binding directly — better-auth auto-detects D1 (v1.5+).
    // Don't use drizzleAdapter() — it creates an unnecessary Drizzle instance
    // and can cause JSON parse errors on deployed Workers.
    database: d1 as unknown as D1Database,

    // Required on Cloudflare Workers — the OAuth state cookie doesn't reliably
    // survive cross-site redirects from Google. State is still validated via D1.
    account: {
      skipStateCookieCheck: true,
    },

    // Tell better-auth to prefer Cloudflare's `cf-connecting-ip` header when
    // capturing the client IP for new sessions. Without this, it falls back
    // to `x-forwarded-for`, which isn't what the Cloudflare edge sets, and
    // the Active Sessions UI shows "Unknown IP" for every row.
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'],
      },
    },

    // Email and password authentication - DISABLED BY DEFAULT
    // See CLAUDE.md for configuration: ENABLE_EMAIL_LOGIN=true, ENABLE_EMAIL_SIGNUP=true
    emailAndPassword: {
      enabled: emailLoginEnabled,
      // Only require verification when an email provider is configured to deliver it.
      // Without this, users sign up but can never verify → permanently locked out.
      requireEmailVerification: !!(env.EMAIL_API_KEY && env.EMAIL_FROM),
      revokeSessionsOnPasswordReset: true,
      disableSignUp: !emailSignupEnabled,

      // Password reset flow — templated via sendEmail (Phase 3.1)
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(mailEnv, {
          to: user.email,
          userId: user.id,
          template: 'passwordReset',
          templateData: { name: user.name ?? null, resetUrl: url, appName },
          tags: [`user:${user.id}`, 'password-reset'],
        })
      },
    },

    // Session configuration (from shared constants)
    session: {
      expiresIn: SESSION.EXPIRES_IN, // Default: 7 days
      updateAge: SESSION.UPDATE_AGE, // Default: 24 hours
      // Avoid D1 writes on every GET — only refresh session on POST requests
      deferSessionRefresh: true,
      // Validate session from a signed cookie for up to 5 min between DB checks.
      // Eliminates a D1 query on most authenticated requests.
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },

    // Audit trail — log signups and logins to the activity feed.
    // Hooks fire after the DB write so the user/session id exists.
    databaseHooks: {
      user: {
        create: {
          // Signup allowlist gate (issue #88) — runs before the DB write.
          // Returning false blocks creation (better-auth surfaces it as
          // unable_to_create_user, which the sign-in page renders via ?error=,
          // see #69). Inactive by default → allows everyone.
          before: async (newUser) => {
            const email = typeof newUser.email === 'string' ? newUser.email : ''
            if (!isSignupAllowed(email, env)) {
              console.warn(JSON.stringify({ event: 'auth_signup_blocked', email }))
              return false
            }
            return { data: newUser }
          },
          after: async (newUser) => {
            await logActivity(d1, {
              userId: newUser.id,
              action: 'create',
              entityType: 'user',
              entityId: newUser.id,
              entityName: newUser.email,
              metadata: { event: 'signup' },
            })
            // Auto-create a personal org for the new user so the
            // multi-tenant UI has something to render from day one.
            // Idempotent — see ensurePersonalOrg for the guards.
            try {
              const { ensurePersonalOrg } = await import('@/server/modules/organizations/seed')
              await ensurePersonalOrg(
                { DB: d1 },
                {
                  userId: newUser.id,
                  userName: newUser.name,
                  userEmail: newUser.email,
                }
              )
            } catch (err) {
              console.error(
                JSON.stringify({
                  event: 'auth_user_create_personal_org_failed',
                  userId: newUser.id,
                  error: err instanceof Error ? err.message : String(err),
                })
              )
            }
          },
        },
      },
      session: {
        create: {
          // Re-check the allowlist on EVERY login. user.create.before only
          // guards NEW users; this guards EXISTING ones — an account that
          // predates the allowlist (or was created while the gate was off)
          // must not keep signing in once the gate is active. This is the
          // load-bearing half: turning on ALLOWED_AUTH_* now actually locks
          // out an unauthorised account that already exists. (Audit playbook
          // audit-vite-flare-starter-auth-allowlist 2026-06-23.)
          before: async (newSession) => {
            try {
              const row = (await d1
                .prepare('SELECT email FROM user WHERE id = ?')
                .bind(newSession.userId)
                .first()) as { email?: string } | null
              const email = typeof row?.email === 'string' ? row.email : ''
              // When the allowlist is active, fail CLOSED on both a disallowed
              // AND an unresolvable email — an existing-but-now-disallowed
              // account (or one whose email row can't be read) must not log in.
              // When the gate is off, isAllowlistActive is false and we never
              // block here (public-signup forks).
              if (isAllowlistActive(env) && (!email || !isSignupAllowed(email, env))) {
                console.warn(JSON.stringify({ event: 'auth_login_blocked', email }))
                return false
              }
            } catch (err) {
              console.error(
                JSON.stringify({
                  event: 'auth_login_gate_error',
                  error: err instanceof Error ? err.message : String(err),
                })
              )
              // Fail CLOSED when an allowlist is active (a transient D1 error
              // must not re-admit a removed account); fail OPEN when no
              // allowlist is configured, so a blip can't lock out a public fork.
              if (isAllowlistActive(env)) return false
            }
            return { data: newSession }
          },
          after: async (newSession) => {
            await logActivity(d1, {
              userId: newSession.userId,
              action: 'create',
              entityType: 'session',
              entityId: newSession.id,
              metadata: {
                event: 'login',
                ipAddress: newSession.ipAddress ?? null,
                userAgent: newSession.userAgent ?? null,
              },
            })
            // Default the session's active org to the user's earliest
            // membership (usually their personal org) so the dashboard
            // never lands on a "(no active org)" empty state.
            try {
              const { setDefaultActiveOrgForSession } = await import(
                '@/server/modules/organizations/seed'
              )
              await setDefaultActiveOrgForSession({ DB: d1 }, newSession.id, newSession.userId)
            } catch (err) {
              console.error(
                JSON.stringify({
                  event: 'auth_session_set_active_org_failed',
                  sessionId: newSession.id,
                  error: err instanceof Error ? err.message : String(err),
                })
              )
            }
          },
        },
      },
    },

    // Email verification — templated via sendEmail (Phase 3.1)
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(mailEnv, {
          to: user.email,
          userId: user.id,
          template: 'emailVerification',
          templateData: { name: user.name ?? null, verifyUrl: url, appName },
          tags: [`user:${user.id}`, 'email-verification'],
        })
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
    },

    // Social providers (Google OAuth)
    // NOTE: Google OAuth is always enabled when credentials exist.
    //
    // ACCESS CONTROL IS IN CODE, NOT just the consent screen. The previous
    // "handled at Google Cloud Console level" note was a trap: a consent
    // screen set to External (required whenever any user is on a non-Workspace
    // domain) lets ANY Google account sign in. The real gate is the
    // ALLOWED_AUTH_EMAILS / ALLOWED_AUTH_DOMAINS / AUTH_ALLOWLIST allowlist,
    // enforced by isSignupAllowed() in BOTH databaseHooks.user.create.before
    // (new users) and databaseHooks.session.create.before (existing users).
    // The consent screen is defence in depth, never the only gate.
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID || '',
        clientSecret: env.GOOGLE_CLIENT_SECRET || '',
        // Always enabled when credentials exist - domain restriction is at Google Cloud level
        enabled: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        // Map Google profile to user fields with fallback for missing name
        mapProfileToUser: (profile) => ({
          name: profile.name || profile.email?.split('@')[0] || 'User',
          email: profile.email,
          emailVerified: profile.email_verified,
          image: profile.picture,
        }),
      },
    },

    // User management features
    user: {
      // Expose `role` to /api/auth/get-session and the signed session cookie so
      // client-side code (sidebar `minRole`, admin gates) can read it without a
      // separate /api/admin/status round-trip.
      // - `input: false` prevents users from setting their own role on signup.
      // - `defaultValue: 'user'` matches the SQL default in the user table.
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'user',
          input: false,
        },
      },

      // Email change with verification — templated via sendEmail (Phase 3.1)
      changeEmail: {
        enabled: true,
        sendChangeEmailVerification: async ({
          user,
          newEmail,
          url,
        }: {
          user: { id?: string; name: string; email: string }
          newEmail: string
          url: string
          token: string
        }) => {
          await sendEmail(mailEnv, {
            to: user.email, // Current email — security-sensitive confirmation
            userId: user.id,
            template: 'emailChange',
            templateData: { name: user.name, newEmail, confirmUrl: url, appName },
            tags: user.id ? [`user:${user.id}`, 'email-change'] : ['email-change'],
          })
        },
      },

      // Account deletion with lifecycle hooks
      deleteUser: {
        enabled: true,

        // Account deletion confirmation — templated via sendEmail (Phase 3.1)
        sendDeleteAccountVerification: async ({ user, url }) => {
          await sendEmail(mailEnv, {
            to: user.email,
            userId: user.id,
            template: 'deleteAccount',
            templateData: { name: user.name, confirmUrl: url, appName },
            tags: [`user:${user.id}`, 'delete-account'],
          })
        },

        // Before deletion: validation checks
        beforeDelete: async (user) => {
          console.log(`Preparing to delete account for user: ${user.id} (${user.email})`)
          return // Allow deletion to proceed
        },

        // After deletion: cleanup related data
        afterDelete: async (user) => {
          console.log(`Account deleted: ${user.id} (${user.email})`)

          // Sweep orphaned organizations (issue #70). The org plugin auto-creates
          // a personal org per user, but better-auth's `organization` table has no
          // FK to user — on delete, `member` rows cascade away while the org row
          // survives as a zero-member orphan. The NOT EXISTS guard only removes
          // orgs whose last member just went; shared orgs with remaining members
          // are untouched. Harmless no-op if the org plugin isn't in use.
          try {
            await d1
              .prepare(
                `DELETE FROM organization
                 WHERE NOT EXISTS (SELECT 1 FROM member m WHERE m.organizationId = organization.id)`
              )
              .run()
          } catch (err) {
            console.error(
              JSON.stringify({
                event: 'auth_afterdelete_org_cleanup_failed',
                userId: user.id,
                error: err instanceof Error ? err.message : String(err),
              })
            )
          }

          // Add further cleanup for your app's data here:
          // - Remove from mailing lists
          // - Delete stored files (R2)
          // - Clear caches (KV)
          // - Notify integrations
        },
      },
    },

    // Organization plugin — multi-user team / workspace structure.
    // V1 ships with org create/list + member add/remove + active-org
    // tracking on the session. Invitation email flow + custom roles
    // (organizationRole) deferred for a later phase.
    //
    // Migration 0030_organization_plugin.sql provides the tables.
    // Plugin auto-detects them and exposes /api/auth/organization/*.
    //
    // testUtils() is loaded ONLY when TEST_AUTH_TOKEN is set so headless
    // agents can mint real session cookies via /api/test-auth/*. Without
    // the env var, the plugin isn't loaded and the test-auth endpoints
    // return 404 — production-safe by default.
    //
    // lastLoginMethod() drops a `better-auth.last_used_login_method`
    // cookie after successful auth so the login page can pre-highlight
    // the user's preferred provider on return ("Continue with Google"
    // vs email). Pure UX nicety — cookie-only, no DB migration.
    plugins: [
      lastLoginMethod(),
      ...(env.TEST_AUTH_TOKEN ? [testUtils()] : []),
      organization({
        // Default roles: owner, admin, member. Forks needing custom
        // roles configure `ac` here per the AC docs.
        sendInvitationEmail: async (data) => {
          // Phase 5 — send the invite via SMTP2Go (or whatever the
          // email service is wired to). Best-effort: failures are
          // logged but never thrown so the invite-member endpoint
          // still succeeds and the inviter can copy the link instead.
          //
          // Provider falls back to 'console' when EMAIL_API_KEY isn't
          // set, so dev environments still get an email_log row but
          // no real send. Set EMAIL_API_KEY (SMTP2Go) in production.
          try {
            const { sendEmail } = await import('@/server/modules/email/service')
            const baseUrl = String(env.BETTER_AUTH_URL ?? '')
            const signUpUrl = `${baseUrl}/accept-invitation/${data.id}`
            // Use mailEnv (closure-captured) — it includes DB +
            // email-provider bindings. Plain `env` doesn't have DB, so
            // sendEmail would fail logging without it.
            await sendEmail(mailEnv, {
              to: data.email,
              template: 'invite',
              templateData: {
                inviterName: data.inviter.user.name ?? data.inviter.user.email,
                inviterEmail: data.inviter.user.email,
                organizationName: data.organization.name,
                signUpUrl,
                appName: String(env.APP_NAME ?? 'Vite Flare Starter'),
              },
            })
          } catch (err) {
            console.error(
              JSON.stringify({
                event: 'auth_send_invitation_email_failed',
                invitationId: data.id,
                email: data.email,
                error: err instanceof Error ? err.message : String(err),
              })
            )
          }
        },
      }),
    ],
  })
}
