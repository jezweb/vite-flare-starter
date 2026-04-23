import { defineProviderTokenTable } from '@/server/modules/connectors/stub-provider'

export const atlassianTokens = defineProviderTokenTable('user_atlassian_tokens')
export type AtlassianToken = typeof atlassianTokens.$inferSelect
