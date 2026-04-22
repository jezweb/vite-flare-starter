/**
 * TanStack Query Key Factory
 *
 * Centralised query key management for consistent cache invalidation.
 * Every module's queries use keys from this factory.
 *
 * @see https://tkdodo.eu/blog/effective-react-query-keys
 */

export const queryKeys = {
  // Auth / Session
  session: ['session'] as const,

  // Settings
  settings: {
    all: ['settings'] as const,
    preferences: () => ['settings', 'preferences'] as const,
  },

  // Sessions
  sessions: {
    all: ['sessions'] as const,
    list: () => ['sessions', 'list'] as const,
  },

  // API Tokens
  apiTokens: {
    all: ['api-tokens'] as const,
    list: () => ['api-tokens', 'list'] as const,
  },

  // Files
  files: {
    all: ['files'] as const,
    list: (params?: Record<string, unknown>) => ['files', 'list', params] as const,
  },

  // Activity
  activity: {
    all: ['activity'] as const,
    list: (params?: Record<string, unknown>) => ['activity', 'list', params] as const,
    stats: () => ['activity', 'stats'] as const,
  },

  // Admin
  admin: {
    all: ['admin'] as const,
    users: () => ['admin', 'users'] as const,
    usersList: (params?: Record<string, unknown>) => ['admin', 'users', 'list', params] as const,
    user: (id: string) => ['admin', 'users', 'detail', id] as const,
    stats: () => ['admin', 'stats'] as const,
    featureFlags: () => ['admin', 'feature-flags'] as const,
  },

  // Organization
  organization: {
    all: ['organization'] as const,
    settings: () => ['organization', 'settings'] as const,
  },

  // Notifications
  notifications: {
    all: ['notifications'] as const,
    list: () => ['notifications', 'list'] as const,
    unread: () => ['notifications', 'unread'] as const,
  },

  // AI / Chat
  ai: {
    all: ['ai'] as const,
    models: () => ['ai', 'models'] as const,
  },

  // Skills
  skills: {
    all: ['skills'] as const,
    list: () => ['skills', 'list'] as const,
    summary: () => ['skills', 'summary'] as const,
    detail: (name: string) => ['skills', 'detail', name] as const,
  },
} as const
