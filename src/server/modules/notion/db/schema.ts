import { defineProviderTokenTable } from '@/server/modules/connectors/stub-provider'

export const notionTokens = defineProviderTokenTable('user_notion_tokens')
export type NotionToken = typeof notionTokens.$inferSelect
