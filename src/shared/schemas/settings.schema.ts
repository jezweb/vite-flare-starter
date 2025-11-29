import { z } from 'zod'

/**
 * Shared validation schemas for user settings
 *
 * These schemas are used by both:
 * - Frontend: React Hook Form validation
 * - Backend: Hono zValidator middleware
 *
 * This ensures consistent validation rules across the stack.
 */

/**
 * Update user profile name
 * PATCH /api/settings/profile
 */
export const updateNameSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim(),
})

/**
 * Request email change
 * POST /api/settings/email
 *
 * Note: This triggers email verification flow.
 * User stays logged in. Email updates only after verification.
 */
export const changeEmailSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),
})

/**
 * Change password
 * POST /api/settings/password
 *
 * Requires current password verification before allowing change.
 */
export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be 128 characters or less'),
  confirmPassword: z
    .string()
    .min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

/**
 * Delete user account
 * DELETE /api/settings/account
 *
 * Uses better-auth's deleteUser API which requires:
 * - Password verification (email/password users)
 * - Fresh session (signed in within last 24 hours)
 * - Triggers lifecycle hooks (beforeDelete, afterDelete)
 *
 * Cascade deletes all user data via afterDelete hook.
 */
export const deleteAccountSchema = z.object({
  password: z
    .string()
    .min(1, 'Password is required to delete your account')
    .optional(), // Optional for OAuth users
})

// Type exports for use in TypeScript code
export type UpdateNameInput = z.infer<typeof updateNameSchema>
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>
