/**
 * API Token Scopes
 *
 * Defines available permission scopes for API tokens.
 * Scopes follow the pattern: resource:action
 */

export const API_TOKEN_SCOPES = {
  // Profile access
  'profile:read': 'Read your profile information',
  'profile:write': 'Update your profile',

  // Settings access
  'settings:read': 'Read your preferences and settings',
  'settings:write': 'Update your preferences and settings',

  // Activity log
  'activity:read': 'Read your activity history',

  // Notifications
  'notifications:read': 'Read your notifications',
  'notifications:write': 'Mark notifications as read or delete them',

  // Chat / AI
  'chat:read': 'Read chat conversation history',
  'chat:write': 'Send messages and interact with AI',

  // AI features
  'ai:use': 'Use AI features (generation, models)',
} as const

// Type for valid scope strings
export type ApiTokenScope = keyof typeof API_TOKEN_SCOPES

// All available scopes as an array
export const ALL_SCOPES = Object.keys(API_TOKEN_SCOPES) as ApiTokenScope[]

// Scope categories for UI grouping
export const SCOPE_CATEGORIES = {
  'Profile & Settings': ['profile:read', 'profile:write', 'settings:read', 'settings:write'],
  'Activity & Notifications': ['activity:read', 'notifications:read', 'notifications:write'],
  'AI & Chat': ['chat:read', 'chat:write', 'ai:use'],
} as const satisfies Record<string, readonly ApiTokenScope[]>

// Helper to check if a scope is valid
export function isValidScope(scope: string): scope is ApiTokenScope {
  return scope in API_TOKEN_SCOPES
}

// Helper to validate an array of scopes
export function validateScopes(scopes: string[]): { valid: boolean; invalid: string[] } {
  const invalid = scopes.filter((s) => !isValidScope(s))
  return { valid: invalid.length === 0, invalid }
}
