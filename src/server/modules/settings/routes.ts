import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { authMiddleware, requireScopes, type AuthContext } from '@/server/middleware/auth'
import { createAuth } from '@/server/modules/auth'
import * as schema from '@/server/db/schema'
import {
  updateNameSchema,
  changeEmailSchema,
  changePasswordSchema,
  deleteAccountSchema,
} from '@/shared/schemas/settings.schema'
import { userPreferencesSchema, defaultPreferences } from '@/shared/schemas/preferences.schema'
import { AVATAR } from '@/shared/config/constants'

// Create Hono app for settings routes with auth context
const app = new Hono<AuthContext>()

// Apply auth middleware to all settings routes
app.use('/*', authMiddleware)

/**
 * Helper middleware to require session auth only (no API tokens)
 * Used for sensitive operations like password change, email change, account deletion
 */
const requireSessionAuth = async (c: any, next: any) => {
  const authMethod = c.get('authMethod')
  if (authMethod !== 'session') {
    return c.json({ error: 'This action requires web session authentication' }, 403)
  }
  await next()
}

/**
 * PATCH /api/settings/profile
 * Update user profile (name, image)
 *
 * Uses better-auth's updateUser API for:
 * - Automatic updatedAt handling
 * - Lifecycle hook support
 * - Consistent with auth system
 *
 * Requires: profile:write scope for API tokens
 */
app.patch('/profile', requireScopes('profile:write'), zValidator('json', updateNameSchema), async (c) => {
  const input = c.req.valid('json')

  try {
    // Create auth instance
    const auth = createAuth(c.env.DB, {
      BETTER_AUTH_SECRET: c.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: c.env.BETTER_AUTH_URL,
      GOOGLE_CLIENT_ID: c.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: c.env.GOOGLE_CLIENT_SECRET,
      EMAIL_API_KEY: c.env.EMAIL_API_KEY,
      EMAIL_FROM: c.env.EMAIL_FROM,
    })

    // Use better-auth's updateUser API
    const result = await auth.api.updateUser({
      body: {
        name: input.name,
        // image: input.image, // Can add image support later
      },
      headers: c.req.raw.headers,
    })

    if (!result) {
      return c.json({ error: 'Failed to update profile' }, 500)
    }

    return c.json({
      message: 'Profile updated successfully',
      user: result
    })
  } catch (error) {
    console.error('Update profile error:', error)
    return c.json({ error: 'Failed to update profile' }, 500)
  }
})

/**
 * GET /api/settings/preferences
 * Fetch user preferences (theme, mode)
 *
 * Returns user preferences or defaults if not set
 *
 * Requires: settings:read scope for API tokens
 */
app.get('/preferences', requireScopes('settings:read'), async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  try {
    // Fetch user record with preferences
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        preferences: true,
      },
    })

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    // Return preferences (or defaults if null)
    const prefs = user.preferences || defaultPreferences

    return c.json({ preferences: prefs })
  } catch (error) {
    console.error('Get preferences error:', error)
    return c.json({ error: 'Failed to fetch preferences' }, 500)
  }
})

/**
 * PATCH /api/settings/preferences
 * Update user preferences (theme, mode)
 *
 * Validates input and updates preferences in database
 *
 * Requires: settings:write scope for API tokens
 */
app.patch('/preferences', requireScopes('settings:write'), zValidator('json', userPreferencesSchema), async (c) => {
  const userId = c.get('userId')
  const input = c.req.valid('json')
  const db = drizzle(c.env.DB, { schema })

  try {
    // Update user preferences
    await db
      .update(schema.user)
      .set({
        preferences: input,
        updatedAt: new Date(),
      })
      .where(eq(schema.user.id, userId))

    return c.json({
      message: 'Preferences updated successfully',
      preferences: input,
    })
  } catch (error) {
    console.error('Update preferences error:', error)
    return c.json({ error: 'Failed to update preferences' }, 500)
  }
})

/**
 * POST /api/settings/avatar
 * Upload user avatar to R2
 *
 * Accepts multipart/form-data with 'avatar' field
 * Stores in R2 with key: avatars/{userId}.jpg
 * Updates user.image with public URL
 *
 * Requires: profile:write scope for API tokens
 */
app.post('/avatar', requireScopes('profile:write'), async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  try {
    // Parse multipart form data
    const formData = await c.req.formData()
    const file = formData.get('avatar')

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400)
    }

    // Validate file type (from shared constants)
    if (!AVATAR.ALLOWED_TYPES.includes(file.type as typeof AVATAR.ALLOWED_TYPES[number])) {
      return c.json({
        error: `Invalid file type. Allowed: ${AVATAR.ALLOWED_TYPES.join(', ')}`
      }, 400)
    }

    // Validate file size (from shared constants)
    if (file.size > AVATAR.MAX_SIZE_BYTES) {
      return c.json({
        error: `File too large. Maximum size: ${AVATAR.MAX_SIZE_DISPLAY}`
      }, 400)
    }

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()

    // Determine file extension from MIME type
    const ext = file.type.split('/')[1] || 'jpg'
    const key = `avatars/${userId}.${ext}`

    // Upload to R2
    await c.env.AVATARS.put(key, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
      },
    })

    // Update user.image field with avatar URL
    // Add timestamp query parameter to bust browser cache
    const timestamp = Date.now()
    const avatarUrl = `/api/avatar/${userId}?t=${timestamp}`

    await db
      .update(schema.user)
      .set({
        image: avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(schema.user.id, userId))

    return c.json({
      message: 'Avatar uploaded successfully',
      avatarUrl,
    })
  } catch (error) {
    console.error('Upload avatar error:', error)
    return c.json({ error: 'Failed to upload avatar' }, 500)
  }
})

/**
 * DELETE /api/settings/avatar
 * Delete user avatar from R2
 *
 * Removes avatar from R2 and clears user.image field
 *
 * Requires: profile:write scope for API tokens
 */
app.delete('/avatar', requireScopes('profile:write'), async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB, { schema })

  try {
    // Delete all possible avatar formats from R2
    const extensions = ['jpg', 'jpeg', 'png', 'webp']
    await Promise.all(
      extensions.map(ext =>
        c.env.AVATARS.delete(`avatars/${userId}.${ext}`)
      )
    )

    // Clear user.image field
    await db
      .update(schema.user)
      .set({
        image: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.user.id, userId))

    return c.json({
      message: 'Avatar deleted successfully',
    })
  } catch (error) {
    console.error('Delete avatar error:', error)
    return c.json({ error: 'Failed to delete avatar' }, 500)
  }
})

/**
 * POST /api/settings/email
 * Request email change with verification
 *
 * Uses better-auth's changeEmail API for:
 * - Email uniqueness check
 * - Verification email sent to CURRENT email (security)
 * - Safe email change workflow
 *
 * Requires: Session auth only (no API tokens - security sensitive)
 */
app.post('/email', requireSessionAuth, zValidator('json', changeEmailSchema), async (c) => {
  const input = c.req.valid('json')

  try {
    // Create auth instance
    const auth = createAuth(c.env.DB, {
      BETTER_AUTH_SECRET: c.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: c.env.BETTER_AUTH_URL,
      GOOGLE_CLIENT_ID: c.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: c.env.GOOGLE_CLIENT_SECRET,
      EMAIL_API_KEY: c.env.EMAIL_API_KEY,
      EMAIL_FROM: c.env.EMAIL_FROM,
    })

    // Use better-auth's changeEmail API
    // This triggers sendChangeEmailVerification callback
    const result = await auth.api.changeEmail({
      body: {
        newEmail: input.email,
        callbackURL: '/settings?emailChanged=true',
      },
      headers: c.req.raw.headers,
    })

    if (!result) {
      return c.json({ error: 'Failed to initiate email change' }, 500)
    }

    return c.json({
      message: 'Verification email sent to your current email address',
      requiresVerification: true,
    })
  } catch (error: any) {
    console.error('Change email error:', error)

    // Handle specific errors
    if (error?.message?.includes('already in use') || error?.message?.includes('duplicate')) {
      return c.json({ error: 'Email already in use' }, 409)
    }

    if (error?.message?.includes('same email')) {
      return c.json({ error: 'This is already your current email address' }, 400)
    }

    return c.json({ error: 'Failed to change email' }, 500)
  }
})

/**
 * POST /api/settings/password
 * Change password (requires current password verification)
 *
 * Uses better-auth's changePassword API which handles:
 * - Current password verification (custom salt:hash format)
 * - New password hashing
 * - Optional session revocation
 *
 * Requires: Session auth only (no API tokens - security sensitive)
 */
app.post('/password', requireSessionAuth, zValidator('json', changePasswordSchema), async (c) => {
  const userId = c.get('userId')
  const input = c.req.valid('json')
  const db = drizzle(c.env.DB, { schema })

  try {
    // Get user's account record to check if password exists
    const userAccount = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, userId))
      .get()

    if (!userAccount || !userAccount.password) {
      // User signed up with OAuth (no password)
      return c.json(
        {
          error:
            'No password set. You signed up with Google OAuth. Password changes only available for email/password accounts.',
        },
        400
      )
    }

    // Use better-auth's changePassword API
    // This handles password verification and hashing using the correct salt:hash format
    const auth = createAuth(c.env.DB, {
      BETTER_AUTH_SECRET: c.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: c.env.BETTER_AUTH_URL,
      GOOGLE_CLIENT_ID: c.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: c.env.GOOGLE_CLIENT_SECRET,
    })

    const result = await auth.api.changePassword({
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: false, // Keep other sessions active
      },
      headers: c.req.raw.headers, // Pass session cookie
    })

    // Check if the API call succeeded
    if (!result) {
      // Most likely: current password is incorrect
      return c.json({ error: 'Current password is incorrect' }, 401)
    }

    return c.json({ message: 'Password updated successfully' })
  } catch (error: any) {
    console.error('Change password error:', error)

    // better-auth throws specific errors we can handle
    if (
      error?.message?.includes('Invalid password') ||
      error?.message?.includes('password')
    ) {
      return c.json({ error: 'Current password is incorrect' }, 401)
    }

    return c.json({ error: 'Failed to change password' }, 500)
  }
})

/**
 * DELETE /api/settings/account
 * Delete user account with security safeguards
 *
 * Uses better-auth's deleteUser API for:
 * - Password verification (email/password users)
 * - Fresh session requirement (default: 1 day)
 * - Lifecycle hooks (beforeDelete, afterDelete)
 * - Cascade delete via afterDelete hook
 *
 * Requires: Session auth only (no API tokens - security sensitive)
 */
app.delete('/account', requireSessionAuth, zValidator('json', deleteAccountSchema), async (c) => {
  const input = c.req.valid('json')

  try {
    // Create auth instance
    const auth = createAuth(c.env.DB, {
      BETTER_AUTH_SECRET: c.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: c.env.BETTER_AUTH_URL,
      GOOGLE_CLIENT_ID: c.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: c.env.GOOGLE_CLIENT_SECRET,
      EMAIL_API_KEY: c.env.EMAIL_API_KEY,
      EMAIL_FROM: c.env.EMAIL_FROM,
    })

    // For email/password users: require password verification
    // For OAuth users: will require email verification
    const result = await auth.api.deleteUser({
      body: {
        password: input.password, // better-auth recommends password over "DELETE" string
        callbackURL: '/account-deleted',
      },
      headers: c.req.raw.headers,
    })

    if (!result) {
      return c.json({ error: 'Failed to delete account' }, 500)
    }

    // Return success - lifecycle hooks handle cleanup
    return c.json({
      message: 'Account deleted successfully',
      success: true,
    })
  } catch (error: any) {
    console.error('Delete account error:', error)

    // Handle specific errors
    if (error?.message?.includes('password') || error?.message?.includes('incorrect')) {
      return c.json({ error: 'Incorrect password' }, 401)
    }

    if (error?.message?.includes('fresh session') || error?.message?.includes('sign in')) {
      return c.json({
        error: 'Please sign in again to delete your account (security requirement)',
        requiresFreshSession: true
      }, 403)
    }

    return c.json({ error: 'Failed to delete account' }, 500)
  }
})

export default app
