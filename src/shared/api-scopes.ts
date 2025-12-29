/**
 * API Token Scopes
 *
 * Defines granular permissions for API tokens.
 * Scopes follow the pattern: "resource:action"
 *
 * - resource: The API resource (profile, settings, etc.)
 * - action: The permission level (read, write)
 *   - read: GET operations
 *   - write: POST, PUT, PATCH, DELETE operations
 *
 * Special scopes:
 * - '*': Full access to all resources
 */

// All available scopes with human-readable descriptions
export const API_SCOPES = {
  // Full access
  '*': 'Full access (all permissions)',

  // Profile
  'profile:read': 'Read user profile',
  'profile:write': 'Update user profile',

  // Settings
  'settings:read': 'Read settings',
  'settings:write': 'Update settings',

  // Activity
  'activity:read': 'Read activity logs',

  // Organization
  'organization:read': 'Read organization settings',
  'organization:write': 'Update organization settings',

  // Admin (requires elevated permissions)
  'admin:read': 'Read admin statistics and user data',
  'admin:write': 'Modify admin settings',
} as const

// Type for valid scope strings
export type ApiScope = keyof typeof API_SCOPES

// Array of all valid scopes (for validation)
export const VALID_SCOPES = Object.keys(API_SCOPES) as ApiScope[]

// Helper type for scope arrays
export type ScopeArray = ApiScope[]

/**
 * Check if a scope grants access to a resource and action
 *
 * @param userScopes - The scopes granted to the API token
 * @param requiredResource - The resource being accessed (e.g., 'profile')
 * @param requiredAction - The action being performed ('read' or 'write')
 * @returns true if access is granted
 *
 * @example
 * hasScope(['profile:read', 'settings:write'], 'profile', 'read') // true
 * hasScope(['profile:read'], 'profile', 'write') // false
 * hasScope(['*'], 'anything', 'write') // true
 */
export function hasScope(
  userScopes: string[] | null | undefined,
  requiredResource: string,
  requiredAction: 'read' | 'write'
): boolean {
  // No scopes means no access (fail closed)
  if (!userScopes || userScopes.length === 0) {
    return false
  }

  // Full access scope
  if (userScopes.includes('*')) {
    return true
  }

  // Check for exact match: "resource:action"
  const exactScope = `${requiredResource}:${requiredAction}` as ApiScope
  if (userScopes.includes(exactScope)) {
    return true
  }

  // Write access implies read access
  if (requiredAction === 'read') {
    const writeScope = `${requiredResource}:write` as ApiScope
    if (userScopes.includes(writeScope)) {
      return true
    }
  }

  return false
}

/**
 * Parse scopes from JSON string (stored in database)
 */
export function parseScopes(scopesJson: string | null): string[] {
  if (!scopesJson) return []
  try {
    const parsed = JSON.parse(scopesJson)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is string => typeof s === 'string')
  } catch {
    return []
  }
}

/**
 * Validate scopes array - ensure all scopes are valid
 */
export function validateScopes(scopes: string[]): { valid: boolean; invalid: string[] } {
  const invalid = scopes.filter((scope) => !(scope in API_SCOPES))
  return {
    valid: invalid.length === 0,
    invalid,
  }
}

/**
 * Group scopes by resource for display
 */
export function groupScopesByResource(): Record<string, { scope: ApiScope; description: string }[]> {
  const groups: Record<string, { scope: ApiScope; description: string }[]> = {}

  for (const [scope, description] of Object.entries(API_SCOPES)) {
    const typedScope = scope as ApiScope
    if (scope === '*') {
      groups['Full Access'] = [{ scope: typedScope, description }]
    } else {
      const [resource] = scope.split(':')
      if (!resource) continue // Skip malformed scopes
      const groupName = resource.charAt(0).toUpperCase() + resource.slice(1)
      if (!groups[groupName]) {
        groups[groupName] = []
      }
      groups[groupName].push({ scope: typedScope, description })
    }
  }

  return groups
}
