/**
 * Central schema export file
 *
 * All Drizzle table schemas from modules are exported here.
 * This ensures Drizzle Kit can find all tables for migration generation.
 */

// Auth module schemas
export { user, session, account, verification } from '@/server/modules/auth/db/schema'

// API Tokens module schemas
export { apiTokens } from '@/server/modules/api-tokens/db/schema'

// Organization module schemas
export { organizationSettings } from '@/server/modules/organization/db/schema'

// Activity module schemas
export { activityLogs, activityLogsRelations } from '@/server/modules/activity/db/schema'

// Feature Flags module schemas
export { featureFlags, featureFlagsRelations } from '@/server/modules/feature-flags/db/schema'

// Notifications module schemas
export { userNotifications, userNotificationsRelations } from '@/server/modules/notifications/db/schema'

// Files module schemas
export { files } from '@/server/modules/files/db/schema'

// Chat / AI module schemas
export { aiUsageLogs } from '@/server/modules/chat/db/schema'

// User metadata (key-value store)
export { userMeta } from '@/server/modules/user-meta/db/schema'

// Skills registry (Claude Agent Skills compatible)
export { skills } from '@/server/modules/skills/db/schema'

// Scheduled jobs (cron-triggered AI tasks)
export { scheduledJobs } from '@/server/modules/chat/tools/schedule'
