import { z } from 'zod'

// Role type matching the database schema
export const ROLES = ['user', 'manager', 'admin'] as const
export type Role = (typeof ROLES)[number]

// Schema for updating a user (admin action)
export const updateUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  email: z.string().email('Invalid email').optional(),
  role: z.enum(ROLES).optional(),
})

export type UpdateUserInput = z.infer<typeof updateUserSchema>

// Schema for user list query parameters
export const userListQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'email', 'createdAt', 'lastActiveAt', 'role']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type UserListQuery = z.infer<typeof userListQuerySchema>

// User response type (what the API returns)
export interface UserResponse {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  role: Role
  createdAt: string
  updatedAt: string
  sessionCount: number
  lastActiveAt: string | null
  isAdmin: boolean
}

// User list response
export interface UserListResponse {
  users: UserResponse[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// Admin stats response
export interface AdminStatsResponse {
  totalUsers: number
  activeSessionsCount: number
  usersCreatedLast7Days: number
  usersCreatedLast30Days: number
}

// Admin status response
export interface AdminStatusResponse {
  isAdmin: boolean
  role: Role
  email: string
}

// ============================================================================
// Feature Flags (Admin)
// ============================================================================

export const updateFeatureFlagSchema = z.object({
  enabled: z.boolean(),
})

export type UpdateFeatureFlagInput = z.infer<typeof updateFeatureFlagSchema>

// Feature flag response type
export interface FeatureFlagResponse {
  key: string
  name: string
  description: string
  enabled: boolean
  category: string
}

// Feature flags list response
export interface FeatureFlagsResponse {
  flags: FeatureFlagResponse[]
}
