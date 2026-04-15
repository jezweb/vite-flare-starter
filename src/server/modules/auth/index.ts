import { betterAuth } from 'better-auth'
import type { D1Database } from '@cloudflare/workers-types'
import { Resend } from 'resend'
import { SESSION } from '@/shared/config/constants'
import { logActivity } from '@/server/modules/activity/log'

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
export function createAuth(
  d1: D1Database,
  env: {
    BETTER_AUTH_SECRET: string
    BETTER_AUTH_URL: string
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
    EMAIL_API_KEY?: string
    EMAIL_FROM?: string
    ENABLE_EMAIL_LOGIN?: string // Set to 'true' to enable email/password (default: disabled)
    ENABLE_EMAIL_SIGNUP?: string // Set to 'true' to allow signups (requires ENABLE_EMAIL_LOGIN)
    TRUSTED_ORIGINS?: string
  }
) {
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

    // Email and password authentication - DISABLED BY DEFAULT
    // See CLAUDE.md for configuration: ENABLE_EMAIL_LOGIN=true, ENABLE_EMAIL_SIGNUP=true
    emailAndPassword: {
      enabled: emailLoginEnabled,
      // Only require verification when an email provider is configured to deliver it.
      // Without this, users sign up but can never verify → permanently locked out.
      requireEmailVerification: !!(env.EMAIL_API_KEY && env.EMAIL_FROM),
      revokeSessionsOnPasswordReset: true,
      disableSignUp: !emailSignupEnabled,

      // Password reset flow
      sendResetPassword: async ({ user, url }) => {
        if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) {
          console.warn('Email credentials not configured - skipping password reset email')
          return
        }

        const resend = new Resend(env.EMAIL_API_KEY)

        try {
          await resend.emails.send({
            from: env.EMAIL_FROM,
            to: user.email,
            subject: 'Reset Your Password',
            html: `
              <h2>Password Reset Request</h2>
              <p>Hi ${user.name || 'there'},</p>
              <p>You requested to reset your password. Click the link below to set a new password:</p>
              <p><a href="${url}" style="display: inline-block; padding: 12px 24px; background-color: #0f172a; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
              <p>This link will expire in 1 hour.</p>
              <p>If you didn't request this, you can safely ignore this email.</p>
              <hr>
              <p><small>For security, this link can only be used once.</small></p>
            `,
          })
          console.log(`Password reset email sent to ${user.email}`)
        } catch (error) {
          console.error('Failed to send password reset email:', error)
          throw error
        }
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
          after: async (newUser) => {
            await logActivity(d1, {
              userId: newUser.id,
              action: 'create',
              entityType: 'user',
              entityId: newUser.id,
              entityName: newUser.email,
              metadata: { event: 'signup' },
            })
          },
        },
      },
      session: {
        create: {
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
          },
        },
      },
    },

    // Email verification configuration
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) {
          console.warn('Email credentials not configured - skipping verification email')
          return
        }

        const resend = new Resend(env.EMAIL_API_KEY)

        try {
          await resend.emails.send({
            from: env.EMAIL_FROM,
            to: user.email,
            subject: 'Verify Your Email Address',
            html: `
              <h2>Welcome!</h2>
              <p>Hi ${user.name || 'there'},</p>
              <p>Thanks for signing up. Please verify your email address by clicking the button below:</p>
              <p><a href="${url}" style="display: inline-block; padding: 12px 24px; background-color: #0f172a; color: white; text-decoration: none; border-radius: 6px;">Verify Email</a></p>
              <p>This link will expire in 24 hours.</p>
              <p>If you didn't create an account, you can safely ignore this email.</p>
              <hr>
              <p><small>If the button doesn't work, copy and paste this link into your browser:</small></p>
              <p><small>${url}</small></p>
            `,
          })
          console.log(`Verification email sent to ${user.email}`)
        } catch (error) {
          console.error('Failed to send verification email:', error)
          // Don't throw - avoid timing attacks and let user retry
        }
      },
      sendOnSignUp: true, // Automatically send on signup
      autoSignInAfterVerification: true, // Sign in user after they verify
    },

    // Social providers (Google OAuth)
    // NOTE: Google OAuth is always enabled when credentials exist
    // Domain restrictions are handled at Google Cloud Console level:
    // - OAuth consent screen → User type = "Internal" restricts to your Workspace domain only
    // - This allows existing users to login AND restricts new signups to your domain
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

      // Email change with verification
      changeEmail: {
        enabled: true,
        sendChangeEmailVerification: async ({ user, newEmail, url, token }: { user: { name: string; email: string }; newEmail: string; url: string; token: string }) => {
          // Only send email if we have API key configured
          if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) {
            console.warn('Email credentials not configured - skipping verification email')
            return
          }

          const resend = new Resend(env.EMAIL_API_KEY)

          try {
            await resend.emails.send({
              from: env.EMAIL_FROM,
              to: user.email, // Send to CURRENT email for security
              subject: 'Confirm Your Email Change',
              html: `
                <h2>Email Change Request</h2>
                <p>Hi ${user.name},</p>
                <p>You requested to change your email to: <strong>${newEmail}</strong></p>
                <p>Click the link below to confirm this change:</p>
                <p><a href="${url}">Confirm Email Change</a></p>
                <p>This link will expire in 24 hours.</p>
                <p>If you didn't request this change, please ignore this email.</p>
                <hr>
                <p><small>Verification token: ${token}</small></p>
              `,
            })
            console.log(`Email change verification sent to ${user.email}`)
          } catch (error) {
            console.error('Failed to send email change verification:', error)
            throw error
          }
        },
      },

      // Account deletion with lifecycle hooks
      deleteUser: {
        enabled: true,

        // Optional: Send verification email for account deletion
        sendDeleteAccountVerification: async ({ user, url, token }) => {
          if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) {
            console.warn('Email credentials not configured - skipping verification email')
            return
          }

          const resend = new Resend(env.EMAIL_API_KEY)

          try {
            await resend.emails.send({
              from: env.EMAIL_FROM,
              to: user.email,
              subject: 'Confirm Account Deletion',
              html: `
                <h2>Account Deletion Request</h2>
                <p>Hi ${user.name},</p>
                <p>You requested to delete your account.</p>
                <p>Click the link below to confirm account deletion:</p>
                <p><a href="${url}">Confirm Account Deletion</a></p>
                <p>⚠️ <strong>This action cannot be undone.</strong></p>
                <p>This link will expire in 24 hours.</p>
                <p>If you didn't request this, please ignore this email and change your password immediately.</p>
                <hr>
                <p><small>Verification token: ${token}</small></p>
              `,
            })
            console.log(`Account deletion verification sent to ${user.email}`)
          } catch (error) {
            console.error('Failed to send account deletion verification:', error)
            throw error
          }
        },

        // Before deletion: validation checks
        beforeDelete: async (user) => {
          console.log(`Preparing to delete account for user: ${user.id} (${user.email})`)
          return // Allow deletion to proceed
        },

        // After deletion: cleanup related data
        afterDelete: async (user) => {
          console.log(`Account deleted: ${user.id} (${user.email})`)
          // Add cleanup logic for your app's data here
          // - Remove from mailing lists
          // - Delete stored files (R2)
          // - Clear caches (KV)
          // - Notify integrations
        },
      },
    },
  })
}
