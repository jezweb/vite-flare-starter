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
export {
  userNotifications,
  userNotificationsRelations,
} from '@/server/modules/notifications/db/schema'

// Files module schemas
export { files } from '@/server/modules/files/db/schema'

// Chat / AI module schemas
export { aiUsageLogs, aiToolCalls } from '@/server/modules/chat/db/schema'

// User metadata (key-value store)
export { userMeta } from '@/server/modules/user-meta/db/schema'

// Skills registry (Claude Agent Skills compatible)
export { skills } from '@/server/modules/skills/db/schema'

// Scheduled jobs (cron-triggered AI tasks)
export { scheduledJobs } from '@/server/modules/chat/tools/schedule'

// Conversations (chat persistence)
export { conversations, conversationMessages } from '@/server/modules/conversations/db/schema'

// Projects — groupings of conversations with shared instructions
export { projects } from '@/server/modules/projects/db/schema'

// Memories — multi-entry three-scope (project/user/org) persistent memory
export { memories } from '@/server/modules/memories/db/schema'

// Email log — every outbound email attempt with provider + status
export { emailLog } from '@/server/modules/email/db/schema'

// MCP Connectors (Phase 5) — per-user OAuth-connected MCP servers
export {
  userMcpConnections,
  userMcpToolPolicies,
} from '@/server/modules/mcp-connections/db/schema'

// Google Workspace (v1.8) — native Google OAuth (no MCP indirection)
export { googleWorkspaceTokens } from '@/server/modules/google-workspace/db/schema'

// Microsoft Workspace (v1.9) — native Microsoft 365 OAuth (Azure AD v2.0)
export { microsoftWorkspaceTokens } from '@/server/modules/microsoft-workspace/db/schema'

// Per-user connector settings (v1.9) — enables scaling to many providers
// without flooding the agent context. Master switch + per-tool toggles.
export { userConnectorSettings } from '@/server/modules/connectors/db/schema'

// Stub-provider token tables (v1.9) — Slack, Notion, Atlassian OAuth
// tokens. Each uses the shared `defineProviderTokenTable` factory so
// the table shape is identical across providers.
export { slackTokens } from '@/server/modules/slack/db/schema'
export { notionTokens } from '@/server/modules/notion/db/schema'
export { atlassianTokens } from '@/server/modules/atlassian/db/schema'

// Config diff proposals — staged changes to user-configurable resources
// (skills, system prompts, settings) awaiting user review + approval.
export { configDiffProposals } from '@/server/modules/config-diff/db/schema'

// Routines (issue #50) — declarative recurring agent workflows
export {
  routines,
  routineRuns,
  routineCadenceChanges,
} from '@/server/modules/routines/db/schema'

// Inbox (issue #50 slice 5) — agent-emitted findings the user reviews
export { inboxItems } from '@/server/modules/inbox/db/schema'

// Polymorphic modules (entity_type + entity_id pattern)
export { comments } from '@/server/modules/comments/db/schema'
export { tags, entityTags } from '@/server/modules/tags/db/schema'
export { watchers } from '@/server/modules/watchers/db/schema'
export { favourites } from '@/server/modules/favourites/db/schema'
export { recentViews } from '@/server/modules/recent-views/db/schema'
