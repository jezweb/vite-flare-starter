import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/d1'
import type { D1Database } from '@cloudflare/workers-types'
import { Resend } from 'resend'
import * as schema from './db/schema'

/**
 * Create better-auth instance with Cloudflare D1
 *
 * CRITICAL: Uses drizzleAdapter() with SQLite provider
 * There is NO direct d1Adapter() - must use Drizzle ORM
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
    DISABLE_EMAIL_SIGNUP?: string
  }
) {
  // Initialize Drizzle with D1 binding
  const db = drizzle(d1, { schema })

  // Check if email signup is disabled (doesn't affect Google OAuth)
  // Google OAuth access is controlled at Google Cloud Console level:
  // - Set OAuth consent screen "User type" to "Internal" for domain-only access
  const emailSignupDisabled = env.DISABLE_EMAIL_SIGNUP === 'true'

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,

    // Allow multiple domains (workers.dev and custom domain)
    trustedOrigins: [
      'http://localhost:5173',
      'https://vite-flare-starter.webfonts.workers.dev',
    ],

    // CRITICAL: Use drizzleAdapter with SQLite provider
    database: drizzleAdapter(db, {
      provider: 'sqlite',
    }),

    // Email and password authentication
    // NOTE: This only controls email/password signup - login for existing users always works
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // Start simple, enable later if needed

      // Disable email sign-up if DISABLE_EMAIL_SIGNUP is set
      // Existing users can still log in with email/password
      ...(emailSignupDisabled && {
        signUp: {
          enabled: false,
        },
      }),
    },

    // Session configuration
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // Update session every 24 hours
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
      // Email change with verification
      changeEmail: {
        enabled: true,
        sendChangeEmailVerification: async ({ user, newEmail, url, token }) => {
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
