/**
 * Test Data Factories
 *
 * Creates mock data for testing purposes.
 */

/**
 * Create a mock user object
 */
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: crypto.randomUUID(),
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    image: null,
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export interface MockUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  role: 'user' | 'manager' | 'admin'
  createdAt: Date
  updatedAt: Date
}

/**
 * Create a mock session object
 */
export function createMockSession(overrides: Partial<MockSession> = {}): MockSession {
  const userId = overrides.userId || crypto.randomUUID()
  return {
    id: crypto.randomUUID(),
    token: `session_${crypto.randomUUID()}`,
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0 (Test)',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export interface MockSession {
  id: string
  token: string
  userId: string
  expiresAt: Date
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Create a mock API token object
 */
export function createMockApiToken(overrides: Partial<MockApiToken> = {}): MockApiToken {
  const userId = overrides.userId || crypto.randomUUID()
  return {
    id: crypto.randomUUID(),
    name: 'Test Token',
    tokenPrefix: 'vfs_abc12',
    tokenHash: 'hashed_token_value',
    scopes: 'profile:read',
    userId,
    expiresAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
    ...overrides,
  }
}

export interface MockApiToken {
  id: string
  name: string
  tokenPrefix: string
  tokenHash: string
  scopes: string
  userId: string
  expiresAt: Date | null
  lastUsedAt: Date | null
  createdAt: Date
}

/**
 * Generate valid password samples for testing
 */
export const validPasswords = [
  'StrongP@ss123',
  'MySecure!Pass99',
  'Testing123!@#',
  'ValidPass1!word',
  'Complex$Password1',
]

/**
 * Generate weak password samples for testing
 * These should all fail isValid check
 */
export const weakPasswords = [
  'password',      // Too common, only lowercase
  '12345678',      // Only numbers
  'abcdefgh',      // Only lowercase
  'ABCDEFGH',      // Only uppercase
  'short',         // Too short
  'Pass1!',        // Too short (6 chars)
  'abc',           // Way too short
]

/**
 * API Token scopes for testing
 */
export const testScopes = {
  valid: ['profile:read', 'profile:write', 'settings:read'] as const,
  invalid: ['invalid:scope', 'admin:super'] as const,
  readOnly: ['profile:read', 'settings:read', 'activity:read'] as const,
  full: ['profile:read', 'profile:write', 'settings:read', 'settings:write', 'ai:use'] as const,
}
