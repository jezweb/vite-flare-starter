/**
 * Spaces — re-exports + helpers
 *
 * The Spaces feature shares the `conversations`, `conversation_messages`,
 * and `conversation_members` tables with the 1:1 chat module — the
 * difference between "chat" and "space" is a property of the conversation
 * (kind + member shape), not a separate code path.
 *
 * This file exists so feature code can `import from '@/server/modules/spaces/db/schema'`
 * without reaching into the conversations module. Future Phase 2+ tables
 * (`thread_subscriptions`, `space_agent_installs`) will live here too.
 */
export {
  conversations,
  conversationMessages,
  conversationMembers,
  type ConversationKind,
  type SpaceMode,
  type ReplyMode,
  type MemberKind,
  type MemberRole,
  type NotificationLevel,
} from '@/server/modules/conversations/db/schema'
