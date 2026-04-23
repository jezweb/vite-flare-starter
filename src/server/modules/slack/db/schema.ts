/**
 * Slack token schema — one row per user.
 * Uses the shared `defineProviderTokenTable` factory from the stub helper.
 */
import { defineProviderTokenTable } from '@/server/modules/connectors/stub-provider'

export const slackTokens = defineProviderTokenTable('user_slack_tokens')
export type SlackToken = typeof slackTokens.$inferSelect
