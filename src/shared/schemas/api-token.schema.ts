import { z } from 'zod'

/**
 * Shared validation schemas for API tokens
 *
 * These schemas are used by both:
 * - Frontend: React Hook Form validation
 * - Backend: Hono zValidator middleware
 *
 * This ensures consistent validation rules across the stack.
 */

// Create API token schema - used for POST requests
export const createApiTokenSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim(),
  expiresAt: z
    .number()
    .int()
    .positive('Expiration must be a valid timestamp')
    .optional(),
})

// Response schema for created token (includes the raw token, only shown once)
export const apiTokenCreatedSchema = z.object({
  id: z.string(),
  name: z.string(),
  tokenPrefix: z.string(),
  rawToken: z.string(), // Only returned on creation
  expiresAt: z.number().nullable(),
  createdAt: z.number(),
})

// Response schema for listing tokens (no raw token)
export const apiTokenListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  tokenPrefix: z.string(),
  lastUsedAt: z.number().nullable(),
  expiresAt: z.number().nullable(),
  createdAt: z.number(),
})

// Type exports for use in TypeScript code
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>
export type ApiTokenCreated = z.infer<typeof apiTokenCreatedSchema>
export type ApiTokenListItem = z.infer<typeof apiTokenListItemSchema>
